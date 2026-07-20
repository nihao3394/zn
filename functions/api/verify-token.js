// 口令验证接口：若正确，则在当前域名的浏览器中植入一个具备安全隔离属性的 gate_pass 通行证
export async function onRequestPost(context) {
    const { request, env } = context;
    try {
        // 检查 KV 数据库是否绑定
        const KV = env.RATE_LIMIT_KV;

        if (!KV) {
            return new Response(JSON.stringify({ success: false, msg: "未绑定数据库" }), { status: 500, headers: {"Content-Type":"application/json"}});
        }

        // 获取客户端真实 IP（Cloudflare 自带请求头）
        const clientIp = request.headers.get("CF-Connecting-IP") || "anonymous";
        const kvKey = `rate_limit:${clientIp}`;

        let rateData = {
            attempts: 0,    // 当前周期已失败次数（最大为 3）
            blockCount: 0,  // 历史上总共被封禁了多少次
            lockedUntil: 0  // 封禁解除的时间戳（毫秒）
        };

        const stored = await KV.get(kvKey);
        if (stored) {
            rateData = JSON.parse(stored);
        }

        const now = Date.now();

        // 检查是否处于封禁状态
        if (now < rateData.lockedUntil) {
            const remainingSec = Math.ceil((rateData.lockedUntil - now) / 1000);
            return new Response(JSON.stringify({ 
                success: false, 
                msg: `请求过于频繁，请在 ${remainingSec} 秒后重试。` 
            }), { 
                status: 429, 
                headers: { "Content-Type": "application/json" }
            });
        }

        // 口令验证
        const body = await request.json();
        const token = body.token;
        const MASTER_TOKEN = env.MASTER_TOKEN; 

        // 防止在面板里忘记配置变量导致漏洞
        if (!MASTER_TOKEN) {
            return new Response(JSON.stringify({ success: false, msg: "服务器未配置口令" }), 
            { status: 500, headers: { "Content-Type": "application/json" }});
        }

        if (token === MASTER_TOKEN) {
            // 验证成功：立即将该 IP 的错误计数器从数据库抹除，不耽误正常使用
            if (KV) await KV.delete(kvKey);

            // 创建动态 Session 并存入 KV（有效期 1 小时）
            const session = crypto.randomUUID();
            await KV.put(`session:${session}`,
                JSON.stringify({ created: Date.now(), ip: clientIp }),
                { expirationTtl: 3600 }
            );

            // 植入 HttpOnly 通行 Cookie 并返回成功
            return new Response(JSON.stringify({ success: true, msg: "已验证，正在加载登录面板..." }), {
                status: 200,
                headers: {
                "Content-Type": "application/json",
                "Set-Cookie": `gate_pass=${session}; Path=/manage; HttpOnly; Secure; SameSite=Strict`
                }
            });
        }

        // 封禁逻辑：每个 IP 允许连续输错 3 次，超过后触发封禁，封禁时间呈指数增长
        rateData.attempts += 1;

        if (rateData.attempts >= 3) {
            // 触发封禁，封禁次数加一
            rateData.blockCount += 1;
      
            // 指数级算法：1, 2, 4, 8, 16... 分钟
            const lockoutMinutes = Math.pow(2, rateData.blockCount - 1);
            const lockoutSeconds = lockoutMinutes * 60;
      
            // 计算未来解封的时间点
            rateData.lockedUntil = now + (lockoutSeconds * 1000);
            rateData.attempts = 0; // 重置当前周期失败计数，等待解封后重新计算

            // 计算 KV 保留这套数据的最大寿命（增加一个安全缓冲期，确保在封禁期内数据不丢）
            const ttl = Math.max(60, lockoutSeconds + 600); 
             await KV.put(kvKey, JSON.stringify(rateData), { expirationTtl: ttl });

            return new Response(JSON.stringify({ 
                success: false, 
                msg: `口令无效，已连续触发 3 次失败。你已累计被封禁 ${rateData.blockCount} 次，请在 ${lockoutMinutes} 分钟后重试` 
            }), { 
                status: 429,
                headers: { "Content-Type": "application/json" }
            });
        } else {
            // 只是单次输错，还未达到 3 次，更新 KV 记录（缓存 1 小时即可）
            await KV.put(kvKey, JSON.stringify(rateData), { expirationTtl: 3600 });
      
            const remainingAttempts = 3 - rateData.attempts;
            return new Response(JSON.stringify({ 
                success: false, 
                msg: `口令无效，你还有 ${remainingAttempts} 次尝试机会。` 
            }), { 
                status: 403,
                headers: { "Content-Type": "application/json" }
            });
        }
    } catch (e) {
        return new Response(JSON.stringify({ success: false, msg: "请求异常" }), { status: 400, headers: { "Content-Type": "application/json" }});
    }
}
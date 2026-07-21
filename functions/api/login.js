// 基于 Web Crypto API 的密码 SHA-256 哈希函数
async function hashPassword(password) {
    const msgUint8 = new TextEncoder().encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// 安全解析 JSON，防止 KV 脏数据导致崩溃
function safeJsonParse(jsonString) {
    try {
        return JSON.parse(jsonString);
    } catch (e) {
        return null;
    }
}

// 处理 OPTIONS 预检请求 (解决跨域问题)
export async function onRequestOptions() {
    return new Response(null, {
        status: 204,
        headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
            "Access-Control-Max-Age": "86400"
        }
    });
}

// POST /api/login 主入口
export async function onRequestPost(context) {
    const { request, env } = context;

    try {
        const KV = env.USER_DB;
        if (!KV) {
            return Response.json({ success: false, msg: "未绑定 USER_DB 数据库" }, { status: 500 });
        }

        // 请求体基础校验
        const body = await request.json().catch(() => null);
        if (!body) {
            return Response.json({ success: false, msg: "无效的请求数据格式" }, { status: 400 });
        }

        let { identifier, pass, code } = body;
        identifier = typeof identifier === 'string' ? identifier.trim() : '';
        pass = typeof pass === 'string' ? pass : '';
        code = typeof code === 'string' ? code.trim() : '';

        if (!identifier) {
            return Response.json({ success: false, msg: "请输入用户名或邮箱" }, { status: 400 });
        }

        let userKey = "";
        let targetEmail = "";
        let actualUsername = identifier;

        // 判定登录标识是邮箱还是用户名
        if (identifier.includes('@')) {
            targetEmail = identifier.toLowerCase();
            const mappedUser = await KV.get(`email:${targetEmail}`);
            if (!mappedUser) {
                return Response.json({ success: false, msg: "该邮箱尚未注册" }, { status: 404 });
            }
            userKey = `user:${mappedUser}`;
            actualUsername = mappedUser; // 抽取真实的用户名用于风控记录
        } else {
            userKey = `user:${identifier}`;
        }

        // 登录风控前置校验：查询 IP 和 Username 是否处于冻结期
        const ip = request.headers.get("cf-connecting-ip") || "unknown";
        const ipFailKey = `login_fail:ip:${ip}`;
        const userFailKey = `login_fail:user:${actualUsername}`;

        const checkLockout = async (key) => {
            const dataStr = await KV.get(key);
            if (!dataStr) return { locked: false, remainingMs: 0 };
            
            const parsed = safeJsonParse(dataStr);
            if (!parsed || !parsed.lockedUntil) return { locked: false, remainingMs: 0 };

            if (parsed.lockedUntil > Date.now()) {
                return { locked: true, remainingMs: parsed.lockedUntil - Date.now() };
            }
            return { locked: false, remainingMs: 0 };
        };

        const [ipLock, userLock] = await Promise.all([
            checkLockout(ipFailKey),
            checkLockout(userFailKey)
        ]);

        if (ipLock.locked || userLock.locked) {
            // 取 IP 和 账号两者中更长的冻结时间提醒用户
            const maxRemainMs = Math.max(ipLock.remainingMs || 0, userLock.remainingMs || 0);
            const remainMins = Math.max(1, Math.ceil(maxRemainMs / 60000));
            return Response.json(
                { success: false, msg: `失败次数过多，出于安全保护，请 ${remainMins} 分钟后再试` },
                { status: 429 }
            );
        }

        // 记录错误计数的封装函数
        const recordFail = async (key) => {
            const dataStr = await KV.get(key);
            let count = 1;
            let lockedUntil = 0;
            
            if (dataStr) {
                const parsed = safeJsonParse(dataStr);
                if (parsed) {
                    if (Date.now() > parsed.lockedUntil) {
                        count = (parsed.count || 0) + 1;
                    } else {
                        return; // 若已处于锁定期则不重复累加
                    }
                }
            }
            
            if (count >= 5) {
                // 指数级封禁：第5次错封 1 分钟，第6次 2 分钟，第7次 4 分钟...
                const banMinutes = Math.pow(2, count - 5);
                lockedUntil = Date.now() + banMinutes * 60 * 1000;
                
                // Cloudflare KV 的 expirationTtl 必须 >= 60 秒
                const ttl = Math.max(60, (banMinutes * 60) + 1800); 
                await KV.put(key, JSON.stringify({ count, lockedUntil }), { expirationTtl: ttl });
            } else {
                // 未达到 5 次连错，保存 10 分钟 (600秒)，超时未达标则自动清零
                await KV.put(key, JSON.stringify({ count, lockedUntil: 0 }), { expirationTtl: 600 });
            }
        };

        // 拉取用户数据库原始记录
        const userDataRaw = await KV.get(userKey);
        if (!userDataRaw) {
            return Response.json({ success: false, msg: "用户不存在" }, { status: 404 });
        }
        
        const userData = safeJsonParse(userDataRaw);
        if (!userData) {
            return Response.json({ success: false, msg: "用户数据格式损坏" }, { status: 500 });
        }

        // 验证身份（优先校验验证码，若没传验证码则校验密码）
        if (code) {
            if (!targetEmail) targetEmail = userData.email; 
            if (!targetEmail) {
                return Response.json({ success: false, msg: "该账号未绑定有效邮箱，无法使用验证码登录" }, { status: 400 });
            }

            const savedCode = await KV.get(`code:login:${targetEmail}`);
            const codeFailKey = `verify_fail_count:${targetEmail}`;
            
            if (!savedCode || savedCode !== code) {
                const currentFailStr = await KV.get(codeFailKey);
                let failCount = (parseInt(currentFailStr || "0", 10)) + 1;
                
                if (failCount >= 5) {
                    await Promise.all([
                        KV.delete(`code:login:${targetEmail}`),
                        KV.delete(codeFailKey)
                    ]);
                    return Response.json({ success: false, msg: "验证码错误次数超限，当前验证码已失效，请重新发送" }, { status: 401 });
                }
                
                // TTL 设定为 300 秒（5分钟）
                await KV.put(codeFailKey, failCount.toString(), { expirationTtl: 300 }); 
                return Response.json({ success: false, msg: `验证码错误或已过期 (剩余尝试次数: ${5 - failCount})` }, { status: 401 });
            }

            // 验证码匹配成功：立即销毁验证码和错误计数
            await Promise.all([
                KV.delete(codeFailKey),
                KV.delete(`code:login:${targetEmail}`)
            ]);

        } else if (pass) {
            const hashedPass = await hashPassword(pass);
            if (userData.password !== hashedPass) {
                // 密码错误，触发风控计数
                await Promise.all([recordFail(ipFailKey), recordFail(userFailKey)]);
                return Response.json({ success: false, msg: "密码错误" }, { status: 401 });
            }
        } else {
            return Response.json({ success: false, msg: "必须提供密码或验证码" }, { status: 400 });
        }

        // 账号状态审核拦截
        if (userData.status === "pending") {
            return Response.json({ success: false, msg: "您的注册申请正在审核中，请等待管理员批准" }, { status: 403 });
        }

        if (userData.status === "rejected") {
            return Response.json({ success: false, msg: "您的注册申请已被管理员驳回" }, { status: 403 });
        }

        // 登录成功：清除错误计数器
        await Promise.all([
            KV.delete(ipFailKey),
            KV.delete(userFailKey)
        ]);

        // 生成 Session 并下发安全的 Cookie
        const sessionId = crypto.randomUUID();

        // 写入 KV 存储 Session，有效期 1 小时 (3600 秒)
        await KV.put(
            `session:${sessionId}`,
            JSON.stringify({
                user: actualUsername,
                loginTime: Date.now()
            }),
            { expirationTtl: 3600 } 
        );

        // 返回 Response 标头
        return new Response(JSON.stringify({ 
            success: true, 
            msg: "登录成功！", 
            role: userData.role || "member",
            user: actualUsername
        }), {
            status: 200,
            headers: {
                "Content-Type": "application/json; charset=utf-8",
                "Set-Cookie": `session=${sessionId}; HttpOnly; Secure; SameSite=Strict; Path=/`
            }
        });

    } catch (e) {
        // 在 Cloudflare Real-time logs 中打印具体报错堆栈
        console.error("Login Exception Error:", e);
        return Response.json({ success: false, msg: "服务器内部错误: " + e.message }, { status: 500 });
    }
}
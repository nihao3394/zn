export async function onRequestPost(context) {
    const { request, env } = context;

    try {
        const KV = env.USER_DB;
        if (!KV) {
            return Response.json(
                { success: false, msg: "未绑定 USER_DB 数据库" }, 
                { status: 500 }
            );
        }

        const { email, action } = await request.json();

        // 严格的邮箱格式校验（前端已放行，后端做二次拦截）
        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return Response.json(
                { success: false, msg: "邮箱格式不正确" }, 
                { status: 400 }
            );
        }

        // 发送接口 IP 频率限制 (1分钟最多 5 次)
        const ip = request.headers.get("cf-connecting-ip") || "unknown";
        const ipLimitKey = `limit:send_ip:${ip}`;
        const ipSendStats = await KV.get(ipLimitKey);

        if (ipSendStats) {
            const count = parseInt(ipSendStats);
            if (count >= 5) {
                return Response.json(
                    { success: false, msg: "当前IP发送频率过高，请 1 分钟后再试" }, 
                    { status: 429 }
                );
            }
            await KV.put(ipLimitKey, (count + 1).toString(), { expirationTtl: 60 });
        } else {
            await KV.put(ipLimitKey, "1", { expirationTtl: 60 });
        }

        // 单个邮箱发送频率限制（防刷、防邮箱轰炸：60秒冷静期）
        const limitKey = `limit:code:${email}`;
        const limited = await KV.get(limitKey);
        if (limited) {
            return Response.json(
                { success: false, msg: "发送过于频繁，请 60 秒后再试" }, 
                { status: 429 }
            );
        }

        // 如果是登录场景，校验邮箱是否注册
        if (action === 'login') {
            const mappedUser = await KV.get(`email:${email}`);
            if (!mappedUser) {
                return Response.json(
                    { success: false, msg: "该邮箱尚未注册或申请" }, 
                    { status: 404 }
                );
            }
        }

        // 生成 6 位随机数字验证码 (使用 Web Crypto API 确保安全性)
        const randArray = new Uint32Array(1);
        crypto.getRandomValues(randArray);
        const code = (randArray[0] % 900000 + 100000).toString(); 

        // 保存验证码至 KV（区分 action 用途，设置 5 分钟 TTL 过期）
        const actionType = action || 'register';
        await KV.put(`code:${actionType}:${email}`, code, { expirationTtl: 1800 });
        await KV.put(limitKey, "1", { expirationTtl: 60 }); // 设置 60s 冷却标记

        if (env.RESEND_API_KEY) {
            const resendRes = await fetch('https://api.resend.com/emails', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${env.RESEND_API_KEY}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    from: '知农系统 <no-reply@findingstar.top>',
                    to: [email],
                    subject: '【知农】您的验证码：' + code,
                    html: `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f5f7fa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f7fa;padding:40px 0;">
  <tr>
    <td align="center">
      <table width="480" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.06);">
        <!-- 顶部色条 -->
        <tr>
          <td style="background:linear-gradient(135deg,#2e7d32,#43a047);padding:28px 32px;text-align:center;">
            <h1 style="color:#fff;font-size:22px;margin:0;font-weight:600;">🌱 知农 · 验证码</h1>
          </td>
        </tr>
        <!-- 正文 -->
        <tr>
          <td style="padding:32px;text-align:center;">
            <p style="color:#555;font-size:14px;margin:0 0 8px;">您正在进行身份验证，请在 30 分钟内输入以下验证码：</p>
            <div style="background:#f1f8f1;border:2px dashed #a5d6a7;border-radius:10px;padding:18px 24px;margin:20px 0;display:inline-block;">
              <span style="font-size:36px;font-weight:700;color:#2e7d32;letter-spacing:6px;font-family:'Courier New',monospace;">${code}</span>
            </div>
            <p style="color:#999;font-size:12px;margin:0;">如非本人操作，请忽略此邮件。</p>
          </td>
        </tr>
        <!-- 底部 -->
        <tr>
          <td style="background:#fafafa;padding:16px 32px;text-align:center;border-top:1px solid #eee;">
            <p style="color:#bbb;font-size:11px;margin:0;">此邮件由系统自动发送，请勿回复。</p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`,
                    text: `您的验证码为：${code}，有效期 30 分钟。如非本人操作请忽略。`
                })
            });

            if (!resendRes.ok) {
                console.error("Resend 邮件发送失败", await resendRes.text());
                return Response.json(
                    { success: false, msg: "邮件服务商发送失败，请稍后再试" }, 
                    { status: 500 }
                );
            }
        } else {
            // 测试环境下如果没有配置 RESEND_API_KEY，可以在控制台或返回提示中查看
            console.warn("未检测到 RESEND_API_KEY 环境变量，当前验证码为:", code);
        }

        return Response.json({ success: true, msg: "验证码已发送" });

    } catch (e) {
        console.error("handleSendCode Error:", e);
        return Response.json(
            { success: false, msg: "发送验证码服务端异常" }, 
            { status: 500 }
        );
    }
}
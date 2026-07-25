export async function onRequestPost(context) {
    const { request, env } = context;
    try {
        const cookie = request.headers.get("Cookie") || "";
        const match = cookie.match(/session=([^;]+)/);
        if (!match) return Response.json({ success: false, msg: "未登录" }, { status: 401 });

        const userKV = env.USER_DB;
        const sessRaw = await userKV.get(`session:${match[1]}`);
        if (!sessRaw) return Response.json({ success: false, msg: "登录过期" }, { status: 401 });
        const sess = JSON.parse(sessRaw);
        const username = sess.user;

        const { content, type } = await request.json();
        if (!content || content.length > 1000) return Response.json({ success: false, msg: "内容不能为空且不超过1000字" }, { status: 400 });

        const validTypes = ["suggestion", "question", "bug", "chat"];
        const finalType = validTypes.includes(type) ? type : "chat";

        // IP + 用户 频率限制
        const ip = request.headers.get("cf-connecting-ip") || "unknown";
        const chatKV = env.CHATTING_DB;
        if (!chatKV) return Response.json({ success: false, msg: "CHATTING_DB 未绑定" }, { status: 500 });

        const rateKey = `rate:${username}`;
        const lastTime = await chatKV.get(rateKey);
        if (lastTime && Date.now() - parseInt(lastTime) < 3000) {
            return Response.json({ success: false, msg: "发言过快，请3秒后再试" }, { status: 429 });
        }
        await chatKV.put(rateKey, String(Date.now()), { expirationTtl: 10 });

        const msg = {
            id: crypto.randomUUID(),
            user: username,
            content,
            type: finalType,
            timestamp: new Date().toISOString()
        };

        const listRaw = await chatKV.get("chat:messages");
        const messages = listRaw ? JSON.parse(listRaw) : [];
        messages.unshift(msg);
        if (messages.length > 500) messages.length = 500;
        await chatKV.put("chat:messages", JSON.stringify(messages));

        await userKV.put("system:mutation_version", String(Date.now()));
        return Response.json({ success: true, msg: "发送成功", message: msg });
    } catch (e) {
        return Response.json({ success: false, msg: e.message }, { status: 500 });
    }
}
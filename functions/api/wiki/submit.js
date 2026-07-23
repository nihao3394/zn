/*
用途：POST /api/wiki/submit
请求体：{ keyword, usage }
KV：env.WIKI_DB（新 KV 命名空间）
Key：keyword:pending:{username}
Value：{ keyword, usage, user: currentUsername, createdAt } 
*/

export async function onRequestPost(context) {
    const { request, env } = context;

    try {
        // ——— 提取当前登录用户名 ———
        const cookie = request.headers.get("Cookie") || "";
        const match = cookie.match(/session=([^;]+)/);
        if (!match) {
            return Response.json({ success: false, msg: "未登录" }, { status: 401 });
        }

        const userKV = env.USER_DB;
        if (!userKV) {
            return Response.json({ success: false, msg: "数据库未绑定" }, { status: 500 });
        }

        const sessRaw = await userKV.get(`session:${match[1]}`);
        if (!sessRaw) {
            return Response.json({ success: false, msg: "登录已过期" }, { status: 401 });
        }
        const sess = JSON.parse(sessRaw);
        const username = sess.user;

        // ——— 解析请求 ———
        const { keyword, usage } = await request.json();
        if (!keyword || !usage) {
            return Response.json({ success: false, msg: "请填写完整词条和用途说明" }, { status: 400 });
        }

        // ——— 重复检测：待审核 + 已通过 ———
        // 遍历待审核列表
        const pendingList = await wikiKV.list({ prefix: "keyword:pending:" });
        for (const key of pendingList.keys) {
            const raw = await wikiKV.get(key.name);
            if (raw) {
                const data = JSON.parse(raw);
                if (data.keyword === keyword) {
                    return Response.json({ success: false, msg: "该词条已经存在" }, { status: 409 });
                }
            }
        }

        // 检查已通过聚合列表
        const approvedRaw = await wikiKV.get("keyword:approved:list");
        if (approvedRaw) {
            const approvedList = JSON.parse(approvedRaw);
            if (approvedList.some(item => item.keyword === keyword)) {
                return Response.json({ success: false, msg: "该词条已经存在" }, { status: 409 });
            }
        }

        // ——— 写入 WIKI_DB ———

        // ——— 写入 WIKI_DB ———
        const wikiKV = env.WIKI_DB;
        if (!wikiKV) {
            return Response.json({ success: false, msg: "WIKI_DB 数据库未绑定" }, { status: 500 });
        }

        await wikiKV.put(
            `keyword:pending:${username}`,
            JSON.stringify({
                keyword,
                usage,
                user: username,
                createdAt: new Date().toISOString()
            })
        );

        return Response.json({ success: true, msg: "词条申请已提交，等待审核" });
    } catch (e) {
        return Response.json({ success: false, msg: "提交失败: " + (e.message || e) }, { status: 500 });
    }
}
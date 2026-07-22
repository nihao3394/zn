/*
用途：GET /api/wiki/pending
KV：env.WIKI_DB
遍历 keyword:pending:* → 返回待审核列表
鉴权：admin 或 keyword_reviewer 
*/

export async function onRequestGet(context) {
    const { request, env } = context;

    try {
        // ——— 鉴权 ———
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

        const userRaw = await userKV.get(`user:${sess.user}`);
        if (!userRaw) {
            return Response.json({ success: false, msg: "用户不存在" }, { status: 404 });
        }
        const user = JSON.parse(userRaw);
        if (user.role !== "admin" && user.role !== "keyword_reviewer") {
            return Response.json({ success: false, msg: "权限不足" }, { status: 403 });
        }

        // ——— 遍历 WIKI_DB ———
        const wikiKV = env.WIKI_DB;
        if (!wikiKV) {
            return Response.json({ success: false, msg: "WIKI_DB 数据库未绑定" }, { status: 500 });
        }

        const listRes = await wikiKV.list({ prefix: "keyword:pending:" });
        const pendingList = [];

        for (const key of listRes.keys) {
            const raw = await wikiKV.get(key.name);
            if (raw) {
                const data = JSON.parse(raw);
                pendingList.push({
                    id: key.name,
                    keyword: data.keyword,
                    usage: data.usage,
                    user: data.user,
                    createdAt: data.createdAt
                });
            }
        }

        return Response.json({ success: true, list: pendingList });
    } catch (e) {
        return Response.json({ success: false, list: [], msg: "获取词条列表异常" }, { status: 500 });
    }
}
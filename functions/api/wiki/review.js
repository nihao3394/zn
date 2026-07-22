/*
用途：POST /api/wiki/review
请求体：{ id, action: "approve"|"reject" }
批准 → 从 keyword:pending:{user} 移到 keyword:approved:{id}
驳回 → 删除 keyword:pending:{user}
*/

export async function onRequestPost(context) {
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

        // ——— 解析请求 ———
        const { id, action } = await request.json();
        if (!id || !action) {
            return Response.json({ success: false, msg: "参数缺失" }, { status: 400 });
        }

        const wikiKV = env.WIKI_DB;
        if (!wikiKV) {
            return Response.json({ success: false, msg: "WIKI_DB 数据库未绑定" }, { status: 500 });
        }

        const pendingRaw = await wikiKV.get(id);
        if (!pendingRaw) {
            return Response.json({ success: false, msg: "该词条申请不存在或已被处理" }, { status: 404 });
        }

        const pendingData = JSON.parse(pendingRaw);

        if (action === "approve") {
            // 移到已批准列表
            const approvedId = crypto.randomUUID();
            await wikiKV.put(
                `keyword:approved:${approvedId}`,
                JSON.stringify({
                    keyword: pendingData.keyword,
                    reviewer: sess.user,
                    approvedAt: new Date().toISOString()
                })
            );
            await wikiKV.delete(id);
            return Response.json({ success: true, msg: "词条已通过并归档" });
        } else if (action === "reject") {
            await wikiKV.delete(id);
            return Response.json({ success: true, msg: "词条申请已驳回" });
        } else {
            return Response.json({ success: false, msg: "无效的操作类型" }, { status: 400 });
        }
    } catch (e) {
        return Response.json({ success: false, msg: "操作失败: " + (e.message || e) }, { status: 500 });
    }
}
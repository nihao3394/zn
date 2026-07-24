// POST /api/articles/review
// 请求体: { article_id, action: "approve"|"reject" }

export async function onRequestPost(context) {
    const { request, env } = context;

    try {
        const cookie = request.headers.get("Cookie") || "";
        const match = cookie.match(/session=([^;]+)/);
        if (!match) {
            return Response.json({ success: false, msg: "未登录" }, { status: 401 });
        }

        const userKV = env.USER_DB;
        if (!userKV) {
            return Response.json({ success: false, msg: "USER_DB 未绑定" }, { status: 500 });
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
        if (user.role !== "admin" && user.role !== "article_reviewer") {
            return Response.json({ success: false, msg: "权限不足" }, { status: 403 });
        }

        const { article_id, action } = await request.json();
        if (!article_id || !action) {
            return Response.json({ success: false, msg: "参数缺失" }, { status: 400 });
        }

        const db = env.ARTICLE_DB;
        if (!db) {
            return Response.json({ success: false, msg: "ARTICLE_DB 未绑定" }, { status: 500 });
        }

        if (action === "approve") {
            await db.prepare(
                "UPDATE articles SET status = 'approved', reviewer = ?, updated_at = ? WHERE id = ?"
            ).bind(sess.user, new Date().toISOString(), article_id).run();
            // 递增版本号驱动前端刷新
            await userKV.put("system:mutation_version", String(Date.now()));
            return Response.json({ success: true, msg: "文章已通过审核" });
        } else if (action === "reject") {
            await db.prepare(
                "UPDATE articles SET status = 'rejected', reviewer = ?, updated_at = ? WHERE id = ?"
            ).bind(sess.user, new Date().toISOString(), article_id).run();
            await userKV.put("system:mutation_version", String(Date.now()));
            return Response.json({ success: true, msg: "文章已驳回" });
        } else {
            return Response.json({ success: false, msg: "无效操作" }, { status: 400 });
        }
    } catch (e) {
        return Response.json({ success: false, msg: "操作失败: " + (e.message || e) }, { status: 500 });
    }
}
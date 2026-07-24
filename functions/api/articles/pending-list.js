// GET /api/articles/pending-list → 待审核文章列表
// 鉴权：admin 或 article_reviewer

export async function onRequestGet(context) {
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

        const db = env.ARTICLE_DB;
        if (!db) {
            return Response.json({ success: false, msg: "ARTICLE_DB 未绑定" }, { status: 500 });
        }

        const { results } = await db.prepare(
            "SELECT a.id, a.title, a.author, a.slug, a.created_at, c.name as cat_name FROM articles a JOIN categories c ON a.category_id = c.id WHERE a.status = 'pending' ORDER BY a.created_at DESC"
        ).all();

        return Response.json({ success: true, list: results });
    } catch (e) {
        return Response.json({ success: false, list: [], msg: "获取列表异常" }, { status: 500 });
    }
}
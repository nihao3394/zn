// GET /api/articles/detail?id=xxx → 返回单篇文章全文（审核用）

export async function onRequestGet(context) {
    const { request, env } = context;
    const url = new URL(request.url);
    const articleId = url.searchParams.get("id");

    if (!articleId) {
        return Response.json({ success: false, msg: "缺少文章ID" }, { status: 400 });
    }

    try {
        const cookie = request.headers.get("Cookie") || "";
        const match = cookie.match(/session=([^;]+)/);
        if (!match) {
            return Response.json({ success: false, msg: "未登录" }, { status: 401 });
        }

        const userKV = env.USER_DB;
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

        const article = await db.prepare(
            "SELECT a.*, c.name as cat_name FROM articles a JOIN categories c ON a.category_id = c.id WHERE a.id = ?"
        ).bind(articleId).first();

        if (!article) {
            return Response.json({ success: false, msg: "文章不存在" }, { status: 404 });
        }

        const { results: tags } = await db.prepare(
            "SELECT tag FROM article_tags WHERE article_id = ?"
        ).bind(articleId).all();

        return Response.json({ success: true, article: { ...article, tags: tags.map(t => t.tag) } });
    } catch (e) {
        return Response.json({ success: false, msg: "获取文章异常" }, { status: 500 });
    }
}
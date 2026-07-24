// POST /api/articles/delete
// 请求体: { article_id }
// 仅作者可删除自己的 draft 或 rejected 文章

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

        const { article_id } = await request.json();
        if (!article_id) return Response.json({ success: false, msg: "缺少文章ID" }, { status: 400 });

        const db = env.ARTICLE_DB;
        const article = await db.prepare("SELECT * FROM articles WHERE id = ? AND author = ?").bind(article_id, username).first();
        if (!article) return Response.json({ success: false, msg: "文章不存在或无权操作" }, { status: 404 });
        if (article.status !== "draft" && article.status !== "rejected") {
            return Response.json({ success: false, msg: "只能删除草稿或已驳回的文章" }, { status: 403 });
        }

        await db.prepare("DELETE FROM article_tags WHERE article_id = ?").bind(article_id).run();
        await db.prepare("DELETE FROM articles WHERE id = ?").bind(article_id).run();
        await userKV.put("system:mutation_version", String(Date.now()));

        return Response.json({ success: true, msg: "文章已删除" });
    } catch (e) {
        return Response.json({ success: false, msg: e.message }, { status: 500 });
    }
}
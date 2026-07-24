export async function onRequestGet(context) {
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

        const db = env.ARTICLE_DB;
        if (!db) return Response.json({ success: false, list: [], msg: "DB未绑定" }, { status: 500 });

        const { results } = await db.prepare(
            "SELECT a.id, a.title, a.content, a.status, a.slug, a.created_at, a.updated_at, c.name as cat_name FROM articles a JOIN categories c ON a.category_id = c.id WHERE a.author = ? ORDER BY a.updated_at DESC"
        ).bind(username).all();

        for (const r of results) {
            const { results: tags } = await db.prepare("SELECT tag FROM article_tags WHERE article_id = ?").bind(r.id).all();
            r.tags = tags.map(t => t.tag);
        }
        return Response.json({ success: true, list: results });
    } catch (e) {
        return Response.json({ success: false, list: [], msg: e.message }, { status: 500 });
    }
}
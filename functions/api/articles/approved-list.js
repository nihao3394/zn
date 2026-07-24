export async function onRequestGet(context) {
    const { request, env } = context;
    try {
        const db = env.ARTICLE_DB;
        if (!db) return Response.json({ success: false, list: [], msg: "DB未绑定" }, { status: 500 });

        const { results } = await db.prepare(
            "SELECT a.id, a.title, a.author, a.reviewer, a.slug, a.created_at, c.name as cat_name FROM articles a JOIN categories c ON a.category_id = c.id WHERE a.status = 'approved' ORDER BY a.created_at DESC"
        ).all();
        return Response.json({ success: true, list: results });
    } catch (e) {
        return Response.json({ success: false, list: [], msg: e.message }, { status: 500 });
    }
}
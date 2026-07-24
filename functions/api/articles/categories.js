// GET /api/articles/categories → 返回全部分类（含新增字段）

export async function onRequestGet(context) {
    const { env } = context;
    try {
        const db = env.ARTICLE_DB;
        if (!db) return Response.json({ success: false, list: [] });
        const { results } = await db.prepare(
            "SELECT * FROM categories ORDER BY parent_id IS NULL DESC, sort_order ASC"
        ).all();
        return Response.json({ success: true, list: results });
    } catch (e) {
        return Response.json({ success: false, list: [] });
    }
}
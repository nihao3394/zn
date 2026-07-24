// POST /api/articles/add-category
// 请求体: { name, parent_id, image_url, description, tag }

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
        const userRaw = await userKV.get(`user:${sess.user}`);
        const user = JSON.parse(userRaw);
        if (user.role !== "admin") return Response.json({ success: false, msg: "仅管理员可创建分类" }, { status: 403 });

        const { name, parent_id, image_url, description, tag } = await request.json();
        if (!name) return Response.json({ success: false, msg: "分类名称不能为空" }, { status: 400 });

        const db = env.ARTICLE_DB;
        const slug = name.replace(/[^\w\u4e00-\u9fff]+/g, "-").replace(/^-|-$/g, "").toLowerCase().substring(0, 40);

        const existing = await db.prepare("SELECT id FROM categories WHERE slug = ?").bind(slug).first();
        const finalSlug = existing ? slug + "-" + Date.now().toString(36) : slug;

        const maxOrder = await db.prepare(
            "SELECT COALESCE(MAX(sort_order),0)+1 as n FROM categories WHERE parent_id IS ?"
        ).bind(parent_id || null).first();

        await db.prepare(
            "INSERT INTO categories (name, slug, parent_id, sort_order, image_url, description, tag) VALUES (?,?,?,?,?,?,?)"
        ).bind(name, finalSlug, parent_id || null, maxOrder.n, image_url || "", description || "", tag || "").run();

        await userKV.put("system:mutation_version", String(Date.now()));
        return Response.json({ success: true, msg: "分类已创建" });
    } catch (e) {
        return Response.json({ success: false, msg: e.message }, { status: 500 });
    }
}
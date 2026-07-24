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

        const { article_id, title, content, tags, action, category_id } = await request.json();
        if (!article_id) return Response.json({ success: false, msg: "缺少文章ID" }, { status: 400 });

        const db = env.ARTICLE_DB;
        const article = await db.prepare("SELECT * FROM articles WHERE id = ? AND author = ?").bind(article_id, username).first();
        if (!article) return Response.json({ success: false, msg: "文章不存在或无权修改" }, { status: 404 });

        const now = new Date().toISOString();
        const newStatus = action === "submit" ? "pending" : article.status;

        await db.prepare(
            "UPDATE articles SET title = ?, content = ?, status = ?, category_id = ?, updated_at = ? WHERE id = ?"
        ).bind(title || article.title, content || article.content, newStatus, category_id || article.category_id, now, article_id).run();

        if (tags !== undefined) {
            await db.prepare("DELETE FROM article_tags WHERE article_id = ?").bind(article_id).run();
            const tagArr = typeof tags === "string" ? tags.replace(/，/g, ",").split(",").map(t => t.trim()).filter(Boolean).slice(0, 20) : (Array.isArray(tags) ? tags.slice(0, 20) : []);
            const stmt = db.prepare("INSERT OR IGNORE INTO article_tags (article_id, tag) VALUES (?, ?)");
            for (const t of tagArr) if (t) await stmt.bind(article_id, t).run();
        }

        await userKV.put("system:mutation_version", String(Date.now()));
        return Response.json({ success: true, msg: newStatus === "pending" ? "已提交审核" : "文章已更新" });
    } catch (e) {
        return Response.json({ success: false, msg: e.message }, { status: 500 });
    }
}
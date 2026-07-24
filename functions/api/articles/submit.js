// POST /api/articles/submit
// 请求体: { title, content, category_id, tags, action }
// action: "draft" (保存草稿) | "submit" (提交审核)

export async function onRequestPost(context) {
    const { request, env } = context;

    try {
        const db = env.ARTICLE_DB;
        if (!db) {
            return Response.json({ success: false, msg: "ARTICLE_DB 未绑定" }, { status: 500 });
        }

        // 提取当前用户
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
        const username = sess.user;

        // 解析请求
        const { title, content, category_id, tags, action } = await request.json();
        if (!title || !content || !category_id) {
            return Response.json({ success: false, msg: "标题、内容和分类不能为空" }, { status: 400 });
        }

        const validActions = ["draft", "submit"];
        const finalAction = validActions.includes(action) ? action : "draft";

        // 生成 slug
        const now = new Date().toISOString();
        const shortHash = crypto.randomUUID().split("-")[0];
        const slugBase = title
            .replace(/[^\w\u4e00-\u9fff]+/g, "-")
            .replace(/^-|-$/g, "")
            .toLowerCase()
            .substring(0, 50);
        const slug = slugBase + "-" + shortHash;

        // 检查 slug 唯一性
        const existing = await db.prepare("SELECT id FROM articles WHERE slug = ?").bind(slug).first();
        const finalSlug = existing ? slug + "-" + crypto.randomUUID().split("-")[0] : slug;

        // 确定状态
        const status = finalAction === "submit" ? "pending" : "draft";

        // 写入文章
        await db.prepare(
            "INSERT INTO articles (id, title, content, author, category_id, status, slug, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
        ).bind(crypto.randomUUID(), title, content, username, category_id, status, finalSlug, now, now).run();

        // 读取刚插入的文章 ID
        const article = await db.prepare("SELECT id FROM articles WHERE slug = ?").bind(finalSlug).first();
        const articleId = article.id;

        // 写入标签
        if (tags && Array.isArray(tags) && tags.length > 0) {
            const stmt = db.prepare("INSERT OR IGNORE INTO article_tags (article_id, tag) VALUES (?, ?)");
            for (const tag of tags) {
                const t = tag.trim();
                if (t) await stmt.bind(articleId, t).run();
            }
        }

        const msg = status === "draft" ? "草稿已保存" : "已提交审核，请等待审核员批准";
        return Response.json({ success: true, msg, article_id: articleId, slug: finalSlug });
    } catch (e) {
        return Response.json({ success: false, msg: "提交失败: " + (e.message || e) }, { status: 500 });
    }
}
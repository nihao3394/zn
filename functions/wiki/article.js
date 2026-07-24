export async function onRequest(context) {
    const { request, env } = context;
    const url = new URL(request.url);
    const slug = url.searchParams.get("slug") || "";

    if (!slug) {
        return new Response("缺少文章标识", { status: 400 });
    }

    try {
        const db = env.ARTICLE_DB;
        const article = db
            ? await db.prepare(
                "SELECT a.*, c.name as cat_name FROM articles a JOIN categories c ON a.category_id = c.id WHERE a.slug = ? AND a.status = 'approved'"
            ).bind(slug).first()
            : null;

        if (!article) {
            return new Response("文章不存在", { status: 404 });
        }

        let tags = [];
        if (db) {
            const { results } = await db.prepare("SELECT tag FROM article_tags WHERE article_id = ?").bind(article.id).all();
            tags = (results || []).map(t => t.tag);
        }

        const tagsHtml = tags.map(t => `<span style="display:inline-block;background:#e8f5e9;color:#2e7d32;padding:3px 10px;border-radius:12px;font-size:12px;margin-right:6px;">#${t}</span>`).join('');

        const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width,initial-scale=1.0">
    <title>${article.title} - 助农知识库</title>
    <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
    <style>
        *{margin:0;padding:0;box-sizing:border-box}
        body{font-family:'Helvetica Neue',Arial,sans-serif;color:#333;background:#f9f9f9;line-height:1.8}
        header{background:#2e7d32;color:#fff;padding:12px 0}
        .container{width:85%;max-width:860px;margin:0 auto}
        .nav-box{display:flex;justify-content:space-between;align-items:center}
        .nav-links{list-style:none;display:flex;gap:16px}
        .nav-links a{color:#fff;text-decoration:none;font-weight:bold;padding:5px 10px;border-radius:4px;font-size:.9rem}
        .nav-links a:hover{background:rgba(255,255,255,.2)}
        .article-header{padding:32px 0 20px;border-bottom:1px solid #eee;margin-bottom:24px}
        .article-header h1{font-size:1.8rem;color:#1b5e20;margin-bottom:10px}
        .article-meta{color:#999;font-size:.85rem;display:flex;gap:16px;flex-wrap:wrap}
        .article-body{font-size:15px;line-height:1.9;padding-bottom:30px}
        .article-body h2{color:#2e7d32;margin:24px 0 12px;font-size:1.3rem}
        .article-body h3{color:#333;margin:16px 0 8px;font-size:1.1rem}
        .article-body p{margin-bottom:12px}
        .article-body ul,.article-body ol{padding-left:24px;margin-bottom:12px}
        .article-body code{background:#f5f5f5;padding:2px 6px;border-radius:3px;font-size:.9em}
        .article-body pre{background:#2d2d2d;color:#f8f8f2;padding:16px;border-radius:6px;overflow-x:auto;margin-bottom:12px}
        .article-body blockquote{border-left:3px solid #a5d6a7;padding-left:16px;color:#666;margin:12px 0}
        .article-body img{max-width:100%;border-radius:6px}
        .tags-row{display:flex;gap:6px;flex-wrap:wrap;padding:16px 0;border-top:1px solid #eee;margin-bottom:30px}
        footer{background:#1b5e20;color:#fff;text-align:center;padding:16px 0;font-size:.85rem}
        @media(max-width:768px){.container{width:92%}.article-header h1{font-size:1.4rem}.nav-box{flex-direction:column;gap:8px}}
    </style>
</head>
<body>
    display: flex;
    flex-direction: column;
    min-height: 100vh; /* 让 body 的最小高度等于浏览器视口高度 */

<header><div class="container nav-box">
    <h2>乡村振兴·助农前线</h2>
    <nav><ul class="nav-links">
        <li><a href="/">首页</a></li>
        <li><a href="/wiki/">知识库</a></li>
        <li><a href="/products/">农产品</a></li>
        <li><a href="/about/">关于项目</a></li>
    </ul></nav>
</div></header>

<main class="container">
    <div class="article-header">
        <h1>${article.title}</h1>
        <div class="article-meta">
            <span>作者：${article.author}</span>
            <span>分类：${article.cat_name || '-'}</span>
            <span>审核员：${article.reviewer || '-'}</span>
            <span>发布于：${new Date(article.created_at).toLocaleDateString()}</span>
        </div>
    </div>
    <div class="article-body" id="content"></div>
    <div class="tags-row">${tagsHtml || '<span style="color:#ccc;font-size:12px;">暂无标签</span>'}</div>
</main>

<footer>
    /* 修改 margin-top 为 auto，在 flex 布局中它会自动利用所有剩余空间，把页脚推到最底部 */
    margin-top: auto; 
    <div class="container"><p>© 2026 乡村振兴助农宣传 Demo 页</p></div>
</footer>
<script>
    document.getElementById('content').innerHTML = marked.parse(${JSON.stringify(article.content)});
</script>
</body>
</html>`;

        return new Response(html, { headers: { "Content-Type": "text/html;charset=utf-8", "Cache-Control": "no-store" } });
    } catch (e) {
        return new Response("加载失败: " + (e.message || e), { status: 500 });
    }
}
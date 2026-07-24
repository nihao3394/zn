// GET /wiki/list?cat=pest-control → 按分类拉取已发布文章，渲染卡片列表

export async function onRequest(context) {
    const { request, env } = context;
    const url = new URL(request.url);
    const catSlug = url.searchParams.get("cat") || "";

    try {
        const db = env.ARTICLE_DB;
        let articles = [];
        let catName = "全部文章";

        if (catSlug && db) {
            const cat = await db.prepare("SELECT id, name FROM categories WHERE slug = ?").bind(catSlug).first();
            if (cat) {
                catName = cat.name;
                const { results } = await db.prepare(
                    "SELECT a.id, a.title, a.author, a.slug, a.created_at FROM articles a WHERE a.category_id = ? AND a.status = 'approved' ORDER BY a.created_at DESC"
                ).bind(cat.id).all();
                articles = results || [];
            }
        }

        const cardsHtml = articles.length > 0
            ? articles.map(a => `
                <a href="/wiki/article/?slug=${a.slug}" class="card-link">
                    <div class="card">
                        <h3>${a.title}</h3>
                        <p>作者：${a.author} | ${new Date(a.created_at).toLocaleDateString()}</p>
                    </div>
                </a>
            `).join('')
            : '<p style="text-align:center;color:#999;grid-column:1/-1;">该分类下暂无文章</p>';

        const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width,initial-scale=1.0">
    <title>${catName} - 助农知识库</title>
    <style>
        *{margin:0;padding:0;box-sizing:border-box}
        body{font-family:'Helvetica Neue',Arial,sans-serif;color:#333;background:#f9f9f9}
        header{background:#2e7d32;color:#fff;padding:15px 0}
        .container{width:85%;max-width:1200px;margin:0 auto}
        .nav-box{display:flex;justify-content:space-between;align-items:center}
        .nav-links{list-style:none;display:flex;gap:20px}
        .nav-links a{color:#fff;text-decoration:none;font-weight:bold;padding:6px 14px;border-radius:4px;transition:background .4s}
        .nav-links a:hover,.nav-links a.active{background:linear-gradient(135deg,#a5d6a7,#81c784);color:#1b5e20}
        .hero{background:linear-gradient(rgba(0,0,0,.4),rgba(0,0,0,.4)),url('https://images.unsplash.com/photo-1592982537447-6f296b05e620?auto=format&fit=crop&w=1200&q=80') no-repeat center/cover;height:200px;color:#fff;display:flex;align-items:center;text-align:center}
        .hero h1{font-size:2.2rem;width:100%}
        .section-title{text-align:center;margin:30px 0 20px;color:#2e7d32;font-size:1.5rem}
        .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:20px;padding:0 5% 40px}
        .card-link{text-decoration:none;color:inherit;border-radius:8px;transition:transform .3s,box-shadow .3s}
        .card-link:hover{transform:translateY(-4px);box-shadow:0 6px 16px rgba(46,125,50,.15)}
        .card{background:#fff;border-radius:8px;padding:24px;box-shadow:0 2px 8px rgba(0,0,0,.06);border-left:4px solid #2e7d32}
        .card h3{color:#1b5e20;margin-bottom:8px}
        .card p{color:#888;font-size:.85rem}
        footer{background:#1b5e20;color:#fff;text-align:center;padding:20px 0;margin-top:40px;font-size:.9rem}
        @media(max-width:768px){.container{width:90%}.nav-box{flex-direction:column;gap:10px}.hero{height:160px}.hero h1{font-size:1.5rem}}
    </style>
</head>
<body>
<header><div class="container nav-box">
    <h2>乡村振兴·助农前线</h2>
    <nav><ul class="nav-links">
        <li><a href="/">首页</a></li>
        <li><a href="/wiki/" class="active">知识库</a></li>
        <li><a href="/products/">农产品</a></li>
        <li><a href="/about/">关于项目</a></li>
    </ul></nav>
</div></header>
<section class="hero"><h1>${catName}</h1></section>
<main>
    <h2 class="section-title">已发布文章</h2>
    <div class="grid">${cardsHtml}</div>
</main>
<footer><div class="container"><p>© 2026 乡村振兴助农宣传 Demo 页</p></div></footer>
</body>
</html>`;

        return new Response(html, { headers: { "Content-Type": "text/html;charset=utf-8", "Cache-Control": "no-store" } });
    } catch (e) {
        return new Response("加载失败", { status: 500 });
    }
}
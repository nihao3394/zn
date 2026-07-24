// GET /wiki/list?cat=pest-control → 按分类拉取已发布文章，渲染包含左侧边栏的卡片列表

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
                        <p class="meta-info">作者：${a.author} <span class="divider">|</span> ${a.created_at.substring(0,10).replace(/-/g,'/')}</p>
                    </div>
                </a>
            `).join('')
            : '<div class="empty-state">当前板块暂无文章可查看</div>';

        const html = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width,initial-scale=1.0">
    <title>${catName} - 助农知识库</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { display: flex; flex-direction: column; min-height: 100vh; font-family: 'Helvetica Neue', Arial, sans-serif; color: #333; background: #f9f9f9; line-height: 1.6; }
        
        /* 顶部导航条：增加 width: 100% 确保横向拉满 */
        header { background: #2e7d32; color: #fff; padding: 15px 0; position: sticky; top: 0; z-index: 100; box-shadow: 0 2px 10px rgba(0,0,0,0.1); width: 100%; }
        .container { width: 90%; max-width: 1200px; margin: 0 auto; }
        .nav-box { display: flex; justify-content: space-between; align-items: center; }
        .nav-links { list-style: none; display: flex; gap: 20px; }
        .nav-links a { color: #fff; text-decoration: none; font-weight: bold; padding: 6px 14px; border-radius: 4px; transition: background .4s; }
        .nav-links a:hover, .nav-links a.active { background: linear-gradient(135deg, #a5d6a7, #81c784); color: #1b5e20; }

        /* 修复侧边栏靠边问题：恢复 auto 居中与 5% 的左右留白 */
        .layout-wrapper { display: flex; max-width: 1200px; width: 100%; margin: 40px auto; gap: 36px; padding: 0 5%; flex-grow: 1; }
        
        /* 左侧边栏 */
        .sidebar { width: 260px; flex-shrink: 0; background: #fff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.05); padding: 20px 0; height: fit-content; position: sticky; top: 90px; }
        .sidebar h3 { padding: 0 20px 15px; border-bottom: 1px solid #eee; color: #1b5e20; font-size: 1.2rem; margin-bottom: 10px; }
        .category-list { list-style: none; }
        .category-list li a { display: block; padding: 12px 20px; color: #555; text-decoration: none; transition: all 0.3s ease; border-left: 4px solid transparent; }
        .category-list li a:hover { background: #f1f8e9; color: #2e7d32; }
        .category-list li a.active { background: #e8f5e9; border-left-color: #2e7d32; color: #2e7d32; font-weight: bold; }

        /* 右侧内容区 */
        .main-content { flex-grow: 1; min-width: 0; }
        
        /* 修复按钮居右：使用 justify-content: space-between */
        .content-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 25px; border-bottom: 2px solid #2e7d32; padding-bottom: 10px; }
        .content-header h1 { color: #2e7d32; font-size: 1.8rem; margin: 0; }
        .view-toggle { display: flex; gap: 8px; }
        .view-toggle button { background: #eee; border: 1px solid #ccc; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 13px; font-weight: bold; }
        .view-toggle button.active { background: #2e7d32; color: #fff; border-color: #2e7d32; }

        .menu-toggle { display: none; background: none; border: none; font-size: 1.6rem; color: #fff; cursor: pointer; line-height: 1; padding: 0 4px; }
        .brand-row { display: flex; align-items: center; gap: 8px; }

        .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 24px; }
        .card-link { text-decoration: none; color: inherit; display: block; transition: transform .3s, box-shadow .3s; }
        .card-link:hover { transform: translateY(-4px); box-shadow: 0 6px 16px rgba(46,125,50,.15); }
        .card { background: #fff; border-radius: 8px; padding: 28px 24px; box-shadow: 0 2px 8px rgba(0,0,0,.06); border-left: 4px solid #2e7d32; }
        .card h3 { color: #1b5e20; margin-bottom: 10px; font-size: 1.25rem; }
        .card p { color: #888; font-size: 0.9rem; }
        
        .empty-state { text-align: center; color: #666; padding: 60px 0; background: #fff; border-radius: 8px; width: 100%; border: 1px dashed #ccc; font-size: 1.1rem; }

        /* 列表模式：严格的长条布局，拉满宽度 */
        .grid.list { display: flex; flex-direction: column; gap: 14px; width: 100%; }
        .grid.list .card-link { width: 100%; }
        .grid.list .card { display: flex; justify-content: space-between; align-items: center; padding: 18px 24px; width: 100%; box-sizing: border-box; }
        .grid.list .card h3 { margin: 0; flex: 1; padding-right: 20px; }
        .grid.list .card p.meta-info { margin: 0; white-space: nowrap; color: #999; font-size: .85rem; flex-shrink: 0; }

        /* 网格模式 */
        .grid.grid-mode { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 24px; }
        .grid.grid-mode .card { display: block; }
        .grid.grid-mode .card h3 { margin-bottom: 10px; padding-right: 0; }
        .grid.grid-mode .card p.meta-info { white-space: normal; }

        /* 修复页脚截断：确保 width 为 100% */
        footer { margin-top: auto; background: #1b5e20; color: #fff; text-align: center; padding: 20px 0; font-size: .9rem; width: 100%; }
        
        .overlay { display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); z-index: 150; }
        .overlay.active { display: block; }

        @media(max-width: 860px) {
            .nav-box { flex-wrap: wrap; gap: 10px; }
            .nav-links { gap: 8px; }
            .nav-links a { padding: 4px 8px; font-size: .82rem; }
            .layout-wrapper { flex-direction: column; padding: 0 4%; margin: 24px auto; gap: 0; }
            .menu-toggle { display: block; }
            .sidebar { position: fixed; top: 0; left: -280px; height: 100vh; width: 260px; margin: 0; z-index: 200; border-radius: 0; box-shadow: 2px 0 10px rgba(0,0,0,0.2); transition: left 0.3s ease; overflow-y: auto; padding-top: 60px; }
            .sidebar.active { left: 0; }
            
            /* 手机端列表卡片自适应换行 */
            .grid.list .card { flex-direction: column; align-items: flex-start; gap: 8px; }
            .grid.list .card p.meta-info { white-space: normal; }
            .grid.list .card h3 { padding-right: 0; }
            
            .content-header h1 { font-size: 1.4rem; }
        }
    </style>
</head>
<body>

<header>
    <div class="container nav-box">
        <div class="brand-row">
            <button class="menu-toggle" id="menu-toggle" aria-label="打开分类菜单">☰</button>
            <h2>乡村振兴·助农前线</h2>
        </div>
        <nav>
            <ul class="nav-links">
                <li><a href="/">首页</a></li>
                <li><a href="/wiki/" class="active">知识库</a></li>
                <li><a href="/products/">农产品</a></li>
                <li><a href="/about/">关于项目</a></li>
            </ul>
        </nav>
    </div>
</header>

<div class="overlay" id="overlay"></div>

<div class="layout-wrapper">
    <aside class="sidebar" id="sidebar">
        <h3>全部分类</h3>
        <ul class="category-list" id="category-list">
            <li><a href="#" style="color:#999;">加载中...</a></li>
        </ul>
    </aside>

    <main class="main-content">
        <div class="content-header">
            <h1>${catName}</h1>
            <div class="view-toggle">
                <button id="btn-list" class="active" onclick="setView('list')">☰ 列表</button>
                <button id="btn-grid" onclick="setView('grid')">▦ 网格</button>
            </div>
        </div>
        <div class="grid list">
            ${cardsHtml}
        </div>
    </main>
</div>

<footer>
    <div class="container"><p>© 2026 乡村振兴助农宣传 Demo 页</p></div>
</footer>

<script>
    document.addEventListener("DOMContentLoaded", function() {
        const menuToggle = document.getElementById('menu-toggle');
        const sidebar = document.getElementById('sidebar');
        const overlay = document.getElementById('overlay');

        function toggleMenu() {
            sidebar.classList.toggle('active');
            overlay.classList.toggle('active');
            document.body.style.overflow = sidebar.classList.contains('active') ? 'hidden' : '';
        }

        menuToggle.addEventListener('click', toggleMenu);
        overlay.addEventListener('click', toggleMenu);
    });

    function setView(mode) {
        const grid = document.querySelector('.grid');
        grid.className = 'grid ' + mode;
        if (mode === 'grid') grid.classList.add('grid-mode');
        document.getElementById('btn-list').classList.toggle('active', mode === 'list');
        document.getElementById('btn-grid').classList.toggle('active', mode === 'grid');
    }
</script>

<script>
document.addEventListener("DOMContentLoaded", async function() {
    const list = document.getElementById('category-list');
    try {
        const res = await fetch('/api/articles/categories');
        const data = await res.json();
        const subs = (data.list || []).filter(c => c.parent_id);
        if (subs.length === 0) { list.innerHTML = '<li><a href="#" style="color:#999;">暂无分类</a></li>'; return; }
        const currentSlug = '${catSlug}';
        list.innerHTML = subs.map(c =>
            \`<li><a href="/wiki/list?cat=\${c.slug}" class="\${c.slug === currentSlug ? 'active' : ''}">\${c.name}</a></li>\`
        ).join('');
    } catch(e) { list.innerHTML = '<li><a href="#" style="color:red;">加载失败</a></li>'; }
});
</script>

</body>
</html>`;

        return new Response(html, { headers: { "Content-Type": "text/html;charset=utf-8", "Cache-Control": "no-store" } });
    } catch (e) {
        return new Response("加载失败", { status: 500 });
    }
}
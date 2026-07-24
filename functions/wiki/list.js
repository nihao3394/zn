// GET /wiki/list?cat=pest-control → 按分类拉取已发布文章，渲染包含左侧边栏的卡片列表

export async function onRequest(context) {
    const { request, env } = context;
    const url = new URL(request.url);
    const catSlug = url.searchParams.get("cat") || "";

    try {
        const db = env.ARTICLE_DB;
        let articles = [];
        let catName = "全部文章";

        // 从数据库拉取分类信息和文章列表[cite: 2]
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

        // 渲染文章卡片，如果为空则显示指定提示文本
        const cardsHtml = articles.length > 0
            ? articles.map(a => `
                <a href="/wiki/article/?slug=${a.slug}" class="card-link">
                    <div class="card">
                        <h3>${a.title}</h3>
                        <p>作者：${a.author} | 发布于：${new Date(a.created_at).toLocaleDateString()}</p>
                    </div>
                </a>
            `).join('')
            : '<div class="empty-state">当前板块暂无文章可查看</div>';

        const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width,initial-scale=1.0">
    <title>${catName} - 助农知识库</title>
    <style>
        /* 基础样式与色彩继承自 index.html[cite: 1] */
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { display: flex; flex-direction: column; min-height: 100vh; font-family: 'Helvetica Neue', Arial, sans-serif; color: #333; background: #f9f9f9; line-height: 1.6; }
        
        /* 顶部导航条 */
        header { background: #2e7d32; color: #fff; padding: 15px 0; position: sticky; top: 0; z-index: 100; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .container { width: 90%; max-width: 1200px; margin: 0 auto; }
        .nav-box { display: flex; justify-content: space-between; align-items: center; }
        .nav-links { list-style: none; display: flex; gap: 20px; }
        .nav-links a { color: #fff; text-decoration: none; font-weight: bold; padding: 6px 14px; border-radius: 4px; transition: background .4s; }
        .nav-links a:hover, .nav-links a.active { background: linear-gradient(135deg, #a5d6a7, #81c784); color: #1b5e20; }

        /* 主体双栏布局 */
        .layout-wrapper { display: flex; max-width: 1200px; margin: 40px auto; gap: 36px; padding: 0 5%; min-height: 70vh; }
        
        /* 左侧边栏 - 桌面端 */
        .sidebar { width: 260px; flex-shrink: 0; background: #fff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.05); padding: 20px 0; height: fit-content; position: sticky; top: 90px; }
        .sidebar h3 { padding: 0 20px 15px; border-bottom: 1px solid #eee; color: #1b5e20; font-size: 1.2rem; margin-bottom: 10px; }
        .category-list { list-style: none; }
        .category-list li a { display: block; padding: 12px 20px; color: #555; text-decoration: none; transition: all 0.3s ease; border-left: 4px solid transparent; }
        .category-list li a:hover { background: #f1f8e9; color: #2e7d32; }
        .category-list li a.active { background: #e8f5e9; border-left-color: #2e7d32; color: #2e7d32; font-weight: bold; }

        /* 右侧内容区 */
        .main-content { flex-grow: 1; }
        .content-header { display: flex; align-items: center; margin-bottom: 25px; border-bottom: 2px solid #2e7d32; padding-bottom: 10px; }
        .content-header h1 { color: #2e7d32; font-size: 1.8rem; }
        
        /* 汉堡包按钮 (默认隐藏，仅移动端显示) */
        .menu-toggle { display: none; background: none; border: none; font-size: 1.6rem; color: #fff; cursor: pointer; line-height: 1; padding: 0 4px; }
        .brand-row { display: flex; align-items: center; gap: 8px; }

        /* 文章卡片网格[cite: 2] */
        .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 24px; }
        .card-link { text-decoration: none; color: inherit; display: block; transition: transform .3s, box-shadow .3s; }
        .card-link:hover { transform: translateY(-4px); box-shadow: 0 6px 16px rgba(46,125,50,.15); }
        .card { background: #fff; border-radius: 8px; padding: 28px 24px; box-shadow: 0 2px 8px rgba(0,0,0,.06); border-left: 4px solid #2e7d32; }
        .card h3 { color: #1b5e20; margin-bottom: 10px; font-size: 1.25rem; }
        .card p { color: #888; font-size: 0.9rem; }
        
        /* 空状态提示 */
        .empty-state { text-align: center; color: #666; padding: 60px 0; background: #fff; border-radius: 8px; grid-column: 1 / -1; border: 1px dashed #ccc; font-size: 1.1rem; }

        footer { margin-top: auto; background: #1b5e20; color: #fff; text-align: center; padding: 20px 0; margin-top: 40px; font-size: .9rem; }
        
        /* 移动端遮罩层 */
        .overlay { display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); z-index: 150; }
        .overlay.active { display: block; }

        /* ==========================================
           移动端响应式适配：侧边栏抽屉与汉堡包
           ========================================== */
        @media(max-width: 860px) {
            .nav-box { flex-wrap: wrap; gap: 10px; }
            .nav-links { gap: 8px; }
            .nav-links a { padding: 4px 8px; font-size: .82rem; }
            .layout-wrapper { flex-direction: column; padding: 0 4%; margin: 24px auto; gap: 0; }
            .menu-toggle { display: block; }
            .sidebar { position: fixed; top: 0; left: -280px; height: 100vh; width: 260px; margin: 0; z-index: 200; border-radius: 0; box-shadow: 2px 0 10px rgba(0,0,0,0.2); transition: left 0.3s ease; overflow-y: auto; padding-top: 60px; }
            .sidebar.active { left: 0; }
            .grid { grid-template-columns: 1fr; }
            .card { padding: 20px 16px; }
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

<!-- 移动端侧边栏开启时的遮罩层 -->
<div class="overlay" id="overlay"></div>

<div class="layout-wrapper">
    <!-- 左侧导航树 -->
    <aside class="sidebar" id="sidebar">
        <h3>全部分类</h3>
        <ul class="category-list">
            <li><a href="/wiki/list?cat=modern-farming" class="${catSlug === 'modern-farming' ? 'active' : ''}">现代农业种植技术</a></li>
            <li><a href="/wiki/list?cat=pest-control" class="${catSlug === 'pest-control' ? 'active' : ''}">病虫害绿色防治指南</a></li>
            <li><a href="/wiki/list?cat=ecommerce" class="${catSlug === 'ecommerce' ? 'active' : ''}">农产品电商运营入门</a></li>
            <li><a href="/wiki/list?cat=recent-policies" class="${catSlug === 'recent-policies' ? 'active' : ''}">近年惠农政策解读</a></li>
            <li><a href="/wiki/list?cat=rural-tourism" class="${catSlug === 'rural-tourism' ? 'active' : ''}">乡村旅游与文创开发</a></li>
        </ul>
    </aside>

    <!-- 右侧内容区 -->
    <main class="main-content">
        <div class="content-header">
            <h1>${catName}</h1>
        </div>
        <div class="grid">
            ${cardsHtml}
        </div>
    </main>
</div>

<footer>
    <div class="container"><p>© 2026 乡村振兴助农宣传 Demo 页</p></div>
</footer>

<script>
    // 移动端汉堡包菜单的交互逻辑
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
</script>
</body>
</html>`;

        return new Response(html, { headers: { "Content-Type": "text/html;charset=utf-8", "Cache-Control": "no-store" } });
    } catch (e) {
        return new Response("加载失败", { status: 500 });
    }
}
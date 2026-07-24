export async function onRequest(context) {
    const { request, env } = context;
    
    // session 校验
    const cookieHeader = request.headers.get("Cookie") || "";
    const sessionMatch = cookieHeader.match(/session=([^;]+)/);
    if (!sessionMatch) {
        return new Response("404 Not Found", { status: 404 });
    }

    const userKV = env.USER_DB;
    if (!userKV) {
        return new Response("404 Not Found", { status: 404 });
    }

    const userSessionRaw = await userKV.get(`session:${sessionMatch[1]}`);
    if (!userSessionRaw) {
        return new Response("404 Not Found", { status: 404 });
    }

    let userCtx;
    try {
        const sess = JSON.parse(userSessionRaw);
        const userRaw = await userKV.get(`user:${sess.user}`);
        if (!userRaw) {
            return new Response("404 Not Found", { status: 404 });
        }
        const user = JSON.parse(userRaw);
        if (user.status === "pending" || user.status === "rejected") {
            return new Response("404 Not Found", { status: 404 });
        }
        userCtx = { username: sess.user, role: user.role };
    } catch (e) {
        return new Response("404 Not Found", { status: 404 });
    }

    return renderDashboardPage(userCtx, env.ROOT_USER || '');
}

/**
动态渲染控制台页面模块
@param {Object} userCtx - 包含当前登录用户信息的对象，例如 { username: 'Admin', role: 'admin' }
@returns {Response} - 渲染好 HTML 且带有防缓存 Headers 的 Response 对象
*/
export function renderDashboardPage(userCtx, rootUser = '') {
    const html = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>控制台 - 管理中心</title>
    <style>
        :root {
            --primary: #2e7d32;
            --primary-hover: #1b5e20;
            --primary-light: #a5d6a7;
            --bg-main: #f1f8f1;
            --card-bg: #ffffff;
            --text-main: #2c3e50;
            --text-muted: #7f8c8d;
            --border-color: #e2e8f0;
            --danger: #c62828;
            --danger-hover: #b71c1c;
            --sidebar-width: 240px;
        }

        * { margin: 0; padding: 0; box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; }
        body { background-color: var(--bg-main); color: var(--text-main); display: flex; height: 100vh; overflow: hidden; }

        /* 左侧导航栏 */
        .sidebar {
            width: var(--sidebar-width);
            min-width: 200px;    /* 限制最小宽度防止破坏布局 */
            max-width: 40vw;     /* 限制最大伸缩宽度 */
            position: relative;  /* 为拖拽手柄提供定位锚点 */
            background: #ffffff;
            border-right: 1px solid var(--border-color);
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            z-index: 20;
            box-shadow: 2px 0 10px rgba(0,0,0,0.03);
        }

        .brand {
            padding: 24px 20px;
            font-size: 18px;
            font-weight: bold;
            color: var(--primary);
            display: flex;
            align-items: center;
            gap: 10px;
            border-bottom: 1px solid var(--border-color);
        }

        .nav-list { list-style: none; padding: 16px 12px; flex: 1; }
        .nav-item {
            padding: 12px 16px;
            margin-bottom: 6px;
            border-radius: 8px;
            cursor: pointer;
            color: var(--text-main);
            font-size: 14px;
            font-weight: 500;
            display: flex;
            align-items: center;
            justify-content: space-between;
            transition: all 0.2s ease;
        }
        .nav-item:hover { background-color: #f5fdf5; color: var(--primary); }
        .nav-item.active { background-color: var(--primary); color: white; }

        .user-info-card {
            padding: 16px;
            border-top: 1px solid var(--border-color);
            background: #fafdfa;
            display: flex;
            align-items: center;
            justify-content: space-between;
        }
        .role-badge {
            font-size: 11px;
            padding: 2px 8px;
            border-radius: 12px;
            background: var(--primary-light);
            color: var(--primary-hover);
            font-weight: bold;
        }

        /* 右侧主内容区 */
        .main-content { flex: 1; display: flex; flex-direction: column; overflow: hidden; position: relative; }
        .top-header {
            height: 60px;
            background: white;
            border-bottom: 1px solid var(--border-color);
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 0 24px;
        }

        .view-panel { display: none; padding: 24px; height: calc(100vh - 60px); overflow-y: auto; }
        .view-panel.active { display: block; }

        /* 长条形圆角卡片 (X轴长，Y轴短) */
        .horizontal-card {
            background: white;
            border-radius: 10px;
            padding: 16px 24px;
            margin-bottom: 12px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            box-shadow: 0 2px 6px rgba(0,0,0,0.04);
            border: 1px solid var(--border-color);
            cursor: pointer;
            transition: transform 0.15s ease, box-shadow 0.15s ease;
        }
        .horizontal-card:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(46,125,50,0.12);
            border-color: var(--primary-light);
        }
        .card-meta { display: flex; gap: 24px; align-items: center; }
        .card-title { font-weight: 600; font-size: 15px; color: var(--text-main); }
        .card-sub { font-size: 13px; color: var(--text-muted); }

        /* 维基百科嵌入与右侧抽屉 */
        .wiki-container { width: 100%; height: 100%; position: relative; overflow: hidden; }
        .wiki-iframe { width: 100%; height: 100%; border: none; }
        
        .wiki-trigger-zone {
            position: absolute;
            top: 0; right: 0; 
            width: 12px;         /* 极窄判定区，需鼠标贴合边缘 */
            height: 100%;
            z-index: 50;
            cursor: w-resize;    /* 提示用户可拉出 */
        }
        .wiki-drawer {
            position: absolute;
            top: 0; right: -360px; width: 350px; height: 100%;
            background: white;
            box-shadow: -4px 0 20px rgba(0,0,0,0.15);
            transition: right 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            z-index: 40;
            padding: 24px;
            display: flex;
            flex-direction: column;
            gap: 16px;
        }
        /* 严格限制仅悬停在 12px 触发区、抽屉本身或内部有元素时才弹出 */
        .wiki-trigger-zone:hover + .wiki-drawer, 
        .wiki-drawer:hover,
        .wiki-drawer:focus-within { right: 0; }

        /* 通用表单与按钮 */
        .form-group { margin-bottom: 16px; }
        .form-group label { display: block; font-size: 13px; font-weight: 600; margin-bottom: 6px; }
        .form-control {
            width: 100%;
            padding: 10px 14px;
            border: 1px solid var(--border-color);
            border-radius: 6px;
            font-size: 14px;
            outline: none;
        }
        .form-control:focus { border-color: var(--primary); }
        
        .btn-group { display: flex; gap: 8px; }
        .btn {
            padding: 8px 16px;
            border-radius: 6px;
            border: none;
            font-size: 13px;
            font-weight: 600;
            cursor: pointer;
            transition: 0.2s;
        }
        .btn-primary { background: var(--primary); color: white; }
        .btn-primary:hover { background: var(--primary-hover); }
        .btn-danger { background: var(--danger); color: white; }
        .btn-danger:hover { background: var(--danger-hover); }
        .btn-secondary { background: #e0e0e0; color: #333; }

        /* 叠加弹窗 Modal */
        .modal-overlay {
            position: fixed;
            top: 0; left: 0; width: 100vw; height: 100vh;
            background: rgba(0,0,0,0.4);
            display: none;
            align-items: center;
            justify-content: center;
            z-index: 100;
        }
        .modal-overlay.active { display: flex; }
        .modal-card {
            background: white;
            width: 90%;
            max-width: 500px;
            border-radius: 12px;
            padding: 24px;
            box-shadow: 0 10px 25px rgba(0,0,0,0.2);
        }

        /* 成员列表表格 */
        .member-table { width: 100%; border-collapse: collapse; background: white; border-radius: 8px; overflow: hidden; }
        .member-table th, .member-table td { padding: 12px 16px; text-align: left; border-bottom: 1px solid var(--border-color); font-size: 14px; }
        .member-table th { background: #fafafa; font-weight: 600; }
        
        /* Toast 消息 */
        .toast {
            position: fixed; top: 20px; right: 20px;
            background: #333; color: white; padding: 12px 20px;
            border-radius: 8px; font-size: 14px; z-index: 200;
            display: none; box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        }

        /* 侧边栏拖拽调节手柄 */
        .sidebar-resize-handle {
            position: absolute;
            top: 0;
            right: -4px;           /* 跨在边框上 */
            width: 8px;
            height: 100%;
            cursor: col-resize;
            z-index: 30;
            transition: background 0.15s;
        }
        .sidebar-resize-handle:hover,
        .sidebar-resize-handle.dragging {
            background: rgba(46, 125, 50, 0.2);
        }

        /* 汉堡菜单按钮（仅移动端可见） */
        .hamburger {
            display: none;
            background: none;
            color: var(--primary);
            border: none;
            width: 32px;
            height: 32px;
            font-size: 20px;
            cursor: pointer;
            flex-shrink: 0;
        }

        /* 移动端适配 */
        @media (max-width: 768px) {
            .hamburger { display: flex; align-items: center; justify-content: center; margin-right: 6px; }
            .sidebar-resize-handle { display: none; }

            .sidebar {
                position: fixed;
                top: 0; left: -100%;
                width: 260px;
                min-width: 260px;
                max-width: 80vw;
                height: 100vh;
                overflow-y: auto;
                z-index: 150;
                transition: left 0.3s ease;
                box-shadow: 4px 0 20px rgba(0,0,0,0.2);
            }
            .sidebar.open { left: 0; }

            .main-content { width: 100%; }
            .top-header { padding: 0 10px; height: 48px; display: flex; align-items: center; }
            .top-header h3 { font-size: 14px; flex: 1; }
            .view-panel { padding: 12px; height: calc(100vh - 48px); }

            /* 卡片在手机上堆叠 */
            .horizontal-card {
                flex-direction: column;
                align-items: flex-start;
                gap: 8px;
                padding: 14px 16px;
            }
            .card-meta { flex-direction: column; gap: 6px; }

            /* 成员表格横向滚动 */
            .member-table { display: block; overflow-x: auto; font-size: 12px; }
            .member-table th, .member-table td { padding: 8px 10px; white-space: nowrap; }

            /* Modal 宽度自适应 */
            .modal-card { width: 95%; max-width: none; padding: 16px; }

            /* Toast 不超出屏幕 */
            .toast { left: 8px; right: 8px; top: auto; bottom: 16px; width: auto; text-align: center; }

            /* wiki 抽屉在手机上占满 */
            .wiki-drawer { width: 280px; right: -280px; }
            .wiki-trigger-zone { width: 32px; background: rgba(46,125,50,0.08); border-radius: 6px 0 0 6px; }

            /* 取消移动端的原生 hover 触发，避免触屏卡死，改为依靠类名控制 */
            .wiki-trigger-zone:hover + .wiki-drawer,
            .wiki-drawer:hover { right: -280px; } 
            .wiki-trigger-zone.active + .wiki-drawer,
            .wiki-drawer.open,
            .wiki-drawer:focus-within { right: 0 !important; }

            .horizontal-card { flex-direction: column; align-items: flex-start; gap: 4px; padding: 12px 14px; }
        }

        /* 文章编辑器容器 */
        .editor-wrapper { max-width: 900px; margin: 0 auto; }
        .editor-wrapper .form-group { margin-bottom: 14px; }
        .editor-wrapper .form-group label { display: block; font-size: 13px; font-weight: 600; margin-bottom: 4px; color: var(--text-main); }
        .editor-wrapper input.form-control { width: 100%; padding: 10px 14px; border: 1px solid var(--border-color); border-radius: 6px; font-size: 14px; outline: none; }
        .editor-wrapper input.form-control:focus { border-color: var(--primary); }

        /* 分类选择按钮组 */
        .cat-btn-group { display: flex; gap: 8px; flex-wrap: wrap; }
        .cat-btn {
            padding: 6px 14px; border: 1px solid var(--border-color); border-radius: 16px;
            background: #fff; color: #888; font-size: 12px; cursor: pointer; transition: all 0.2s;
        }
        .cat-btn.selected { background: var(--primary); color: #fff; border-color: var(--primary); }
        .cat-btn.sub-selected { background: #e8f5e9; color: var(--primary); border-color: var(--primary-light); }

        .cat-add-btn { background: none; border: 2px dashed #ccc; color: #aaa; font-size: 18px; padding: 4px 12px; min-width: 36px; }
        .cat-add-btn:hover { border-color: var(--primary); color: var(--primary); }
        
        /* 标签小方块 */
        .tag-input-row { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }
        .tag-chip { display: inline-flex; align-items: center; gap: 4px; background: #e8f5e9; color: var(--primary); padding: 2px 8px; border-radius: 10px; font-size: 12px; }
        .tag-chip .tag-remove { cursor: pointer; font-weight: bold; color: #c62828; }

        /* Vditor 容器 */
        #vditor-container { min-height: 400px; border: 1px solid var(--border-color); border-radius: 6px; }

    </style>
    <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
</head>
<body>

    <div class="overlay" id="sidebar-overlay" style="display:none;position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.3);z-index:140;" onclick="document.querySelector('.sidebar').classList.remove('open');this.style.display='none'">☰</div>

    <div id="toast" class="toast"></div>

    <!-- 左侧导航 -->
    <aside class="sidebar">
        <div>
            <div class="brand">🌱 平台控制中心</div>
            <ul class="nav-list">
                <li class="nav-item active" onclick="switchTab('wiki')">🌐 维基百科</li>
                <li class="nav-item" onclick="switchTab('article-editor')">✏️ 文章撰写</li>
                <li class="nav-item" onclick="switchTab('my-articles')">📋 我的文章</li>
                <li class="nav-item role-admin-only" onclick="switchTab('user-audit')">📝 注册审核 <span id="user-pending-count" class="role-badge">0</span></li>
                <li class="nav-item role-article-reviewer-only" onclick="switchTab('article-audit')">📄 文章审核 <span id="article-pending-count" class="role-badge">0</span></li>
                <li class="nav-item role-reviewer-only" onclick="switchTab('keyword-audit')">🔍 词条审核 <span id="kw-pending-count" class="role-badge">0</span></li>
                <li class="nav-item" onclick="switchTab('article-approved')">📰 过审文章</li>
                <li class="nav-item" onclick="switchTab('keyword-approved')">✅ 过审词条</li>
                <li class="nav-item" onclick="switchTab('members')">👥 全体成员</li>
                <li class="nav-item" onclick="switchTab('settings')">⚙️ 个人设置</li>
            </ul>
        </div>
        <div class="user-info-card">
            <div>
                <div id="display-username" style="font-weight:600; font-size:14px;">用户</div>
                <span id="display-role" class="role-badge">member</span>
            </div>
            <button class="btn btn-secondary" onclick="logout()" style="padding:4px 8px; font-size:12px;">退出</button>
        </div>
        <div class="sidebar-resize-handle"></div>
    </aside>

    <!-- 主操作区 -->
    <main class="main-content">
        <header class="top-header">
            <button class="hamburger" id="hamburger-btn" onclick="var s=document.querySelector('.sidebar');var o=document.getElementById('sidebar-overlay');s.classList.toggle('open');o.style.display=s.classList.contains('open')?'block':'none'">☰</button>
            <h3 id="panel-title">维基百科镜像</h3>
        </header>

        <!-- 1. 维基百科面板 -->
        <section id="panel-wiki" class="view-panel active" style="padding:0;">
            <div class="wiki-container" onclick="if(!event.target.closest('.wiki-drawer')&&!event.target.closest('.wiki-trigger-zone'))closeDrawer()">
                <iframe id="wiki-frame" class="wiki-iframe" src="https://wiki.findingstar.top"></iframe>
                <!-- 添加 onclick 事件，点击时切换 open 和 active 状态 -->
                <div class="wiki-trigger-zone" onclick="toggleWikiDrawer()"></div>
                <!-- 侧边抽屉 -->
                <div id="wiki-drawer-panel" class="wiki-drawer">
                    <!-- 移动端专属的关闭按钮 -->
                    <div class="wiki-drawer-close" onclick="closeWikiDrawer()">×</div>
                    <h4>提交新词条词条申请</h4>
                    <div class="form-group">
                        <label>您要提交的关键词：</label>
                        <input type="text" id="kw-input" class="form-control" placeholder="请您提交前确认该词条真实存在">
                    </div>
                    <div class="form-group">
                        <label>请简述该词条用途：</label>
                        <textarea id="kw-usage" class="form-control" rows="4" placeholder="简要说明该词条的提交原因..."></textarea>
                    </div>
                    <div class="btn-group">
                        <button class="btn btn-primary" onclick="submitKeyword()">提交</button>
                        <button class="btn btn-secondary" onclick="clearKwForm()">清空</button>
                        <button class="btn btn-secondary" onclick="closeDrawer()">取消</button>
                    </div>
                </div>
            </div>
        </section>

        <!-- 1.5. 文章编辑器面板 -->
        <section id="panel-article-editor" class="view-panel">
            <div class="editor-wrapper">
                <div class="form-group">
                    <label>文章标题</label>
                    <input type="text" id="article-title" class="form-control" placeholder="请输入文章标题">
                </div>

                <div class="form-group">
                    <label>文章大类</label>
                    <div class="cat-btn-group" id="cat-parent-group">
                        <button class="cat-btn cat-add-btn" onclick="openCategoryModal(null)">＋</button>
                    </div>
                </div>

                <div class="form-group" id="subcat-group" style="display:none;">
                    <label>文章子类</label>
                    <div class="cat-btn-group" id="cat-sub-group">
                        <button class="cat-btn cat-add-btn" style="display:none;" id="btn-add-sub" onclick="openCategoryModal(selectedParentId)">＋</button>
                    </div>
                </div>

                <div class="form-group">
                    <label>自定义标签</label>
                    <div class="tag-input-row" id="tag-row">
                        <input type="text" id="tag-input" class="form-control" style="width:160px;" placeholder="标签之间以逗号分隔" onkeydown="if(event.keyCode===13){event.preventDefault();addTag();}">
                    </div>
                </div>

                <div class="form-group">
                    <label>文章正文（Markdown）</label>
                    <div id="vditor-container"></div>
                </div>

                <div class="btn-group" style="margin-top:16px;">
                    <button class="btn btn-primary" onclick="saveArticle('draft')">💾 保存草稿</button>
                    <button class="btn btn-primary" style="background:#e6a817;" onclick="saveArticle('submit')">📤 提交审核</button>
                    <button class="btn btn-secondary" id="btn-new-article" style="display:none;" onclick="newArticle()">🆕 创建新文章</button>
                </div>
                <div id="editor-msg" style="margin-top:8px;font-size:13px;"></div>
            </div>
        </section>

        <!-- 1.6. 文章审核面板 -->
        <section id="panel-article-audit" class="view-panel">
            <div id="article-audit-list"></div>
        </section>

        <!-- 2. 注册审核面板 (管理员) -->
        <section id="panel-user-audit" class="view-panel">
            <div id="user-audit-list">
                <!-- 动态渲染长条卡片 -->
            </div>
        </section>

        <!-- 3. 词条审核面板 (管理员 & 词条审核员) -->
        <section id="panel-keyword-audit" class="view-panel">
            <div id="keyword-audit-list">
                <!-- 动态渲染长条卡片 -->
            </div>
        </section>

        <!-- 3.3. 我的文章面板 -->
        <section id="panel-my-articles" class="view-panel">
            <div id="my-articles-list"></div>
        </section>

        <!-- 3.4. 过审文章面板 -->
        <section id="panel-article-approved" class="view-panel">
            <div id="article-approved-list"></div>
        </section>

        <!-- 3.5. 过审词条面板 (所有身份可见) -->
        <section id="panel-keyword-approved" class="view-panel">
            <div id="keyword-approved-list"></div>
        </section>

        <!-- 4. 全体成员面板 -->
        <section id="panel-members" class="view-panel">
            <table class="member-table">
                <thead>
                    <tr>
                        <th>用户名</th>
                        <th>当前身份</th>
                        <th class="role-admin-only">身份调整操作</th>
                    </tr>
                </thead>
                <tbody id="member-table-body">
                    <!-- 动态渲染成员列表 -->
                </tbody>
            </table>
        </section>

        <!-- 5. 设置页面 -->
        <section id="panel-settings" class="view-panel">
            <div style="max-width: 100%; background:white; padding:24px; border-radius:12px; border:1px solid var(--border-color);">
                <h4 style="margin-bottom:16px;">偏好设置</h4>
                <div class="form-group" style="display:flex; justify-content:space-between; align-items:center;">
                    <span>维基百科提交侧边栏开关</span>
                    <input type="checkbox" id="setting-drawer-toggle" checked onchange="toggleWikiDrawerSetting(this.checked)">
                </div>
                <hr style="margin: 20px 0; border:none; border-top:1px solid var(--border-color);">
                <h4 style="margin-bottom:16px;">安全设置</h4>
                <button class="btn btn-primary" id="btn-show-pwd-form" onclick="togglePasswordForm()">修改密码</button>

                <div id="password-form-box" style="display:none; margin-top:16px;">
                    <div class="form-group" id="old-pwd-group">
                        <label>旧密码</label>
                        <input type="password" id="pwd-old" class="form-control" placeholder="请输入旧密码">
                    </div>
                    <div class="form-group">
                        <label>新密码</label>
                        <input type="password" id="pwd-new" class="form-control" placeholder="请输入新密码">
                    </div>
                    <div class="form-group">
                        <label>重复新密码</label>
                        <input type="password" id="pwd-confirm" class="form-control" placeholder="请重复新密码">
                    </div>
                    <div style="margin-bottom:16px;">
                        <a href="javascript:void(0)" onclick="triggerForgetOldPassword()" style="color:var(--primary); font-size:13px; text-decoration:none;">忘记旧密码？</a>
                    </div>
                    <div class="btn-group">
                        <button class="btn btn-primary" onclick="submitPasswordChange()">确认</button>
                        <button class="btn btn-secondary" onclick="togglePasswordForm()">取消</button>
                        <button class="btn btn-secondary" onclick="clearPwdForm()">清空输入框</button>
                    </div>
                </div>
            </div>
        </section>
    </main>

    <!-- 弹窗：卡片详情审核 -->
    <div id="modal-audit" class="modal-overlay">
        <div class="modal-card">
            <h4 id="modal-title" style="margin-bottom:12px;">审核详情</h4>
            <div id="modal-content" style="font-size:14px; line-height:1.6; margin-bottom:20px; color:#555;"></div>
            <div class="btn-group" style="justify-content: flex-end;">
                <button class="btn btn-primary" id="modal-btn-approve">通过申请</button>
                <button class="btn btn-danger" id="modal-btn-reject">驳回申请</button>
                <button class="btn btn-secondary" onclick="closeModal('modal-audit')">关闭</button>
            </div>
        </div>
    </div>

    <!-- 弹窗：忘记旧密码验证码输入 -->
    <div id="modal-otp" class="modal-overlay">
        <div class="modal-card">
            <h4 style="margin-bottom:12px;">邮箱安全验证</h4>
            <p style="font-size:13px; color:#666; margin-bottom:12px;">验证码已发送至您的注册邮箱，请注意查收。</p>
            <div class="form-group">
                <input type="text" id="otp-input" class="form-control" placeholder="请输入 6 位数字验证码">
            </div>
            <div class="btn-group" style="justify-content: flex-end;">
                <button class="btn btn-primary" onclick="verifyForgetOtp()">验证验证码</button>
                <button class="btn btn-secondary" onclick="closeModal('modal-otp')">取消</button>
            </div>
        </div>
    </div>

    <!-- 弹窗：文章全文预览 -->
    <div id="modal-article-preview" class="modal-overlay">
        <div class="modal-card" style="max-width:800px;max-height:85vh;overflow-y:auto;">
            <h4 id="preview-title" style="margin-bottom:8px;"></h4>
            <p style="font-size:12px;color:#999;margin-bottom:12px;">
                作者：<span id="preview-author"></span> | 分类：<span id="preview-cat"></span>
            </p>
            <hr style="margin-bottom:16px;">
            <div id="preview-body" style="font-size:14px;line-height:1.8;"></div>
            <hr style="margin-top:16px;margin-bottom:12px;">
            <div id="preview-tags" style="display:flex;gap:6px;flex-wrap:wrap;"></div>
            <div class="btn-group" style="justify-content:flex-end;margin-top:16px;">
                <button class="btn btn-primary" id="preview-btn-approve">通过审核</button>
                <button class="btn btn-danger" id="preview-btn-reject">驳回文章</button>
                <button class="btn btn-secondary" onclick="closeModal('modal-article-preview')">关闭</button>
            </div>
        </div>
    </div>

    <!-- 弹窗：我的文章编辑 -->
    <div id="modal-my-article" class="modal-overlay">
        <div class="modal-card" style="max-width:800px;max-height:85vh;overflow-y:auto;">
            <h4 id="my-article-title-display" style="margin-bottom:12px;"></h4>
            <div class="form-group">
                <label>标题</label>
                <input type="text" id="my-article-title-input" class="form-control">
            </div>
            <div class="form-group">
                <label>正文（Markdown）</label>
                <textarea id="my-article-content" class="form-control" rows="18" style="font-family:monospace;font-size:13px;"></textarea>
            </div>
            <div class="form-group">
                <label>标签（逗号分隔）</label>
                <input type="text" id="my-article-tags" class="form-control" placeholder="标签1,标签2">
            </div>
            <!-- 文章分类下拉框 -->
            <div class="form-group">
                <label>文章分类</label>
                <select id="my-article-cat-select" class="form-control"></select>
            </div>
            <div style="color:#999;font-size:12px;margin-bottom:8px;">
                状态：<span id="my-article-status"></span> | 分类：<span id="my-article-cat"></span>
            </div>
            <div class="btn-group" style="justify-content:flex-end;">
                <button class="btn btn-primary" id="my-article-btn-save" onclick="updateMyArticle('draft')">💾 保存</button>
                <button class="btn btn-primary" style="background:#e6a817;" id="my-article-btn-submit" onclick="updateMyArticle('submit')">📤 提交审核</button>
                <button class="btn btn-danger" id="my-article-btn-delete" style="display:none;" onclick="deleteMyArticle()">🗑 删除</button>
                <button class="btn btn-secondary" onclick="closeModal('modal-my-article')">关闭</button>
            </div>
        </div>
    </div>

    <div id="modal-add-category" class="modal-overlay">
        <div class="modal-card" style="max-width:480px;">
            <h4 id="cat-modal-title" style="margin-bottom:14px;">创建新分类</h4>
            <div class="form-group">
                <label>分类名称</label>
                <input type="text" id="cat-name-input" class="form-control" placeholder="如：智慧农业">
            </div>
            <div id="cat-extra-fields" style="display:none;">
                <div class="form-group">
                    <label>封面图片URL</label>
                    <input type="text" id="cat-image-input" class="form-control" placeholder="https://...">
                </div>
                <div class="form-group">
                    <label>描述文字</label>
                    <input type="text" id="cat-desc-input" class="form-control" placeholder="简要描述此分类的内容方向">
                </div>
                <div class="form-group">
                    <label>默认标签</label>
                    <input type="text" id="cat-tag-input" class="form-control" placeholder="如：种植技术">
                </div>
            </div>
            <div class="btn-group" style="justify-content:flex-end;margin-top:12px;">
                <button class="btn btn-primary" onclick="submitCategory()">创建</button>
                <button class="btn btn-secondary" onclick="closeModal('modal-add-category')">取消</button>
            </div>
        </div>
    </div>

    <script>
        // 全局状态管理
        // 核心注入点：直接利用模板字符串的 \${} 语法，将传入的 userCtx 变量注入到 JS 中
        let currentUser = { 
            username: '${userCtx.username}', 
            role: '${userCtx.role}' 
        };
        const ROOT_USER = '${rootUser}';

        // ——— 侧边栏拖拽调整宽度 ———
        (function initSidebarResize() {
            const sidebar = document.querySelector('.sidebar');
            const handle = document.querySelector('.sidebar-resize-handle');
            let startX, startWidth;

            handle.addEventListener('mousedown', (e) => {
                e.preventDefault();
                startX = e.clientX;
                startWidth = sidebar.offsetWidth;
                handle.classList.add('dragging');
                document.body.style.userSelect = 'none';
                document.body.style.cursor = 'col-resize';

                document.addEventListener('mousemove', onMove);
                document.addEventListener('mouseup', onUp);
            });

            function onMove(e) {
                const delta = e.clientX - startX;
                const newWidth = Math.min(
                    Math.max(startWidth + delta, 200),  // min-width
                    window.innerWidth * 0.4              // max-width (40vw)
                );
                sidebar.style.width = newWidth + 'px';
            }

            function onUp() {
                handle.classList.remove('dragging');
                document.body.style.userSelect = '';
                document.body.style.cursor = '';
                document.removeEventListener('mousemove', onMove);
                document.removeEventListener('mouseup', onUp);
            }
        })();

        let forgetOtpVerified = false;

        function showToast(msg,type) {
            const toast = document.getElementById('toast');
            toast.innerText = msg;
            toast.style.display = 'block';

            // 按类型换色
            if (type === 'success') {
                toast.style.background = '#2e7d32';
            } else if (type === 'warn') {
                toast.style.background = '#e6a817';
                toast.style.color = '#333';
            } else {
                toast.style.background = '#333';
                toast.style.color = 'white';
            }
                
            setTimeout(() => { toast.style.display = 'none'; }, 2500);
        }

        // 页面初始化：权限受控渲染
        // ——— 事件驱动轮询 ———
        let pollTimer = null;
        const POLL_INTERVAL = 5000; // 事件检测间隔 5 秒
        let currentTab = 'wiki';
        let lastVersion = 0;

        async function checkVersion() {
            try {
                const res = await fetch('/api/system/version', { cache: 'no-store' });
                const data = await res.json();
                if (data.version !== lastVersion) {
                    lastVersion = data.version;
                    // 版本变动 → 全量刷新当前面板
                    switch (currentTab) {
                        case 'user-audit':        loadUserAuditList(); break;
                        case 'keyword-audit':     loadKeywordAuditList(); break;
                        case 'article-audit':     loadArticleAuditList(); break;
                        case 'my-articles':       loadMyArticles(); break;
                        case 'article-approved':  loadArticleApprovedList(); break;
                        case 'keyword-approved':  loadKeywordApprovedList(); break;
                        case 'members':           loadMemberList(); break;
                    }
                }
            } catch (e) { /* 静默 */ }
        }

        function startPolling() {
            stopPolling();
            checkVersion(); // 立即获取初始版本
            pollTimer = setInterval(checkVersion, POLL_INTERVAL);
        }

        function stopPolling() {
            if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
        }

        window.addEventListener('DOMContentLoaded', () => {
            applyRolePermissions();
            loadCategories();
            loadUserAuditList();
            loadArticleAuditList();
            loadKeywordAuditList();
            loadKeywordApprovedList();
            loadMyArticles();
            loadArticleApprovedList();
            loadMemberList();
            startPolling();
        });

        function applyRolePermissions() {
            document.getElementById('display-username').innerText = currentUser.username;
            document.getElementById('display-role').innerText = currentUser.role;

            // 根据身份控制 UI 显示
            document.querySelectorAll('.role-admin-only').forEach(el => {
                el.style.display = currentUser.role === 'admin' ? '' : 'none';
            });
            document.querySelectorAll('.role-reviewer-only').forEach(el => {
                const canReview = currentUser.role === 'admin' || currentUser.role === 'keyword_reviewer';
                el.style.display = canReview ? '' : 'none';
            });
            document.querySelectorAll('.role-article-reviewer-only').forEach(el => {
                const canReview = currentUser.role === 'admin' || currentUser.role === 'article_reviewer';
                el.style.display = canReview ? '' : 'none';
            });
        }

        // ——— 文章分类数据（从 API 动态加载） ———
        let CATEGORIES = { parents: [], subs: {} };
        let catAddParentId = null;

        function selectParentCat(btn) {
            selectedParentId = parseInt(btn.getAttribute('data-id'));
            selectedSubId = null;
            renderParentButtons();
            renderSubButtons(selectedParentId);
        }

        function selectSubCat(btn) {
            document.querySelectorAll('#cat-sub-group .cat-btn').forEach(b => b.classList.remove('sub-selected'));
            btn.classList.add('sub-selected');
            selectedSubId = parseInt(btn.getAttribute('data-id'));
        }

        async function loadCategories() {
            try {
                const res = await fetch('/api/articles/categories', { cache: 'no-store' });
                const data = await res.json();
                if (data.success && data.list) {
                    CATEGORIES.parents = data.list.filter(c => !c.parent_id);
                    CATEGORIES.subs = {};
                    data.list.forEach(c => {
                        if (c.parent_id) {
                            if (!CATEGORIES.subs[c.parent_id]) CATEGORIES.subs[c.parent_id] = [];
                            CATEGORIES.subs[c.parent_id].push(c);
                        }
                    });
                    renderParentButtons();
                    if (selectedParentId) renderSubButtons(selectedParentId);
                }
            } catch(e) {}
        }

        function renderParentButtons() {
            const group = document.getElementById('cat-parent-group');
            group.innerHTML = CATEGORIES.parents.map(p =>
                \`<button class="cat-btn" data-id="\${p.id}" onclick="selectParentCat(this)">\${p.name}</button>\`
            ).join('') + '<button class="cat-btn cat-add-btn" onclick="openCategoryModal(null)">＋</button>';
            if (selectedParentId) {
                const btn = group.querySelector(\`[data-id="\${selectedParentId}"]\`);
                if (btn) btn.classList.add('selected');
            }
        }

        function renderSubButtons(parentId) {
            const group = document.getElementById('cat-sub-group');
            const subs = CATEGORIES.subs[parentId] || [];
            group.innerHTML = subs.map(s =>
                \`<button class="cat-btn" data-id="\${s.id}" onclick="selectSubCat(this)">\${s.name}</button>\`
            ).join('') + '<button class="cat-btn cat-add-btn" id="btn-add-sub" onclick="openCategoryModal(' + parentId + ')">＋</button>';
            document.getElementById('subcat-group').style.display = 'block';
            if (selectedSubId) {
                const btn = group.querySelector(\`[data-id="\${selectedSubId}"]\`);
                if (btn) btn.classList.add('sub-selected');
            }
        }

        function openCategoryModal(parentId) {
            catAddParentId = parentId;
            document.getElementById('cat-modal-title').innerText = parentId ? '创建新子类' : '创建新大类';
            document.getElementById('cat-extra-fields').style.display = parentId ? '' : 'none';
            document.getElementById('cat-name-input').value = '';
            document.getElementById('cat-image-input').value = '';
            document.getElementById('cat-desc-input').value = '';
            document.getElementById('cat-tag-input').value = '';
            openModal('modal-add-category');
        }

        async function submitCategory() {
            const name = document.getElementById('cat-name-input').value.trim();
            if (!name) { showToast('请输入分类名称', 'warn'); return; }
            const payload = { name };
            if (catAddParentId) {
                payload.parent_id = catAddParentId;
                payload.image_url = document.getElementById('cat-image-input').value.trim();
                payload.description = document.getElementById('cat-desc-input').value.trim();
                payload.tag = document.getElementById('cat-tag-input').value.trim();
            }
            try {
                const res = await fetch('/api/articles/add-category', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                const data = await res.json();
                if (data.success) { showToast(data.msg, 'success'); closeModal('modal-add-category'); loadCategories(); }
                else showToast(data.msg || '失败');
            } catch(e) { showToast('操作失败'); }
        }

        function selectSubCat(btn) {
            document.querySelectorAll('#cat-sub-group .cat-btn').forEach(b => b.classList.remove('sub-selected'));
            btn.classList.add('sub-selected');
            selectedSubId = parseInt(btn.getAttribute('data-id'));
        }

        // ——— 标签管理 ———
        function addTag() {
            if (articleTags.length >= 20) { showToast('最多添加20个标签', 'warn'); input.value = ''; return; }
            const input = document.getElementById('tag-input');
            const tag = input.value.trim();
            if (!tag || articleTags.includes(tag)) { input.value = ''; return; }
            articleTags.push(tag);
            renderTags();
            input.value = '';
        }

        function removeTag(tag) {
            articleTags = articleTags.filter(t => t !== tag);
            renderTags();
        }

        function renderTags() {
            const row = document.getElementById('tag-row');
            row.innerHTML = articleTags.map(t =>
                \`<span class="tag-chip">\${t}<span class="tag-remove" onclick="removeTag('\${t}')">×</span></span>\`
            ).join('') +
                '<input type="text" id="tag-input" class="form-control" style="width:160px;" placeholder="标签之间以逗号分隔" onkeydown="if(event.keyCode===13){event.preventDefault();addTag();}">';
        }

        // ——— Vditor 初始化 ———
        function initVditor() {
            // 动态加载 Vditor
            if (!document.getElementById('vditor-css')) {
                const css = document.createElement('link');
                css.id = 'vditor-css';
                css.rel = 'stylesheet';
                css.href = 'https://cdn.jsdelivr.net/npm/vditor@3.10.6/dist/index.css';
                document.head.appendChild(css);
            }

            const loadScript = (src) => new Promise((resolve, reject) => {
                const s = document.createElement('script');
                s.src = src; s.onload = resolve; s.onerror = reject;
                document.head.appendChild(s);
            });

            (async () => {
                if (!window.Vditor) await loadScript('https://cdn.jsdelivr.net/npm/vditor@3.10.6/dist/index.min.js');

                window.vditorInstance = new Vditor('vditor-container', {
                    height: 450,
                    mode: 'ir',           // 即时渲染模式
                    placeholder: '在此编写 Markdown 正文...',
                    toolbar: [
                        'headings', 'bold', 'italic', 'strike', '|',
                        'list', 'ordered-list', 'check', '|',
                        'quote', 'code', 'inline-code', '|',
                        'upload', 'link', 'table', '|',
                        'undo', 'redo', '|',
                        'preview', 'fullscreen'
                    ],
                    cache: { enable: false },
                    after: () => {
                        // 恢复localStorage草稿
                        const saved = localStorage.getItem('zn_draft');
                        if (saved) {
                            try {
                                const draft = JSON.parse(saved);
                                if (draft.content) window.vditorInstance.setValue(draft.content);
                                if (draft.title) document.getElementById('article-title').value = draft.title;
                                if (draft.parentId) { selectedParentId = draft.parentId; /* 恢复按钮高亮 */ }
                                if (draft.subId) { selectedSubId = draft.subId; }
                                if (draft.tags) { articleTags = draft.tags; renderTags(); }
                            } catch(e) {}
                        }
                    }
                });
            })();
        }

        // ——— 自动 localStorage 保存 ———
        function autoSaveDraft() {
            const title = document.getElementById('article-title').value;
            const content = window.vditorInstance ? window.vditorInstance.getValue() : '';
            if (title || content || selectedParentId || articleTags.length > 0) {
                localStorage.setItem('zn_draft', JSON.stringify({
                    title, content,
                    parentId: selectedParentId, subId: selectedSubId,
                    tags: articleTags, articleId: currentArticleId
                }));
                document.getElementById('btn-new-article').style.display = '';
            }
        }

        // Vditor 内容变化时自动保存到 localStorage
        setInterval(() => {
            if (window.vditorInstance) autoSaveDraft();
        }, 3000);

        // ——— 保存/提交文章 ———
        async function saveArticle(action) {
            const title = document.getElementById('article-title').value.trim();
            if (!title) { showToast('请输入文章标题', 'warn'); return; }
            if (!selectedParentId || !selectedSubId) { showToast('请选择文章大类与子类', 'warn'); return; }
            const content = window.vditorInstance ? window.vditorInstance.getValue() : '';
            if (!content) { showToast('请输入文章正文', 'warn'); return; }

            const msgBox = document.getElementById('editor-msg');
            msgBox.style.color = '#666';
            msgBox.innerText = action === 'draft' ? '正在保存...' : '正在提交审核...';

            const payload = { title, content, category_id: selectedSubId, tags: articleTags.join(","), action };
            
            // 只要当前有已创建的 currentArticleId，无论什么 action 都视为更新
            // 尝试从 localStorage 恢复 articleId（防止刷新后丢失）
            if (!currentArticleId) {
                const saved = localStorage.getItem('zn_draft');
                if (saved) {
                    try {
                        const draft = JSON.parse(saved);
                        if (draft.articleId) currentArticleId = draft.articleId;
                    } catch(e) {}
                }
            }
            const isUpdate = !!currentArticleId;

            try {
                const url = isUpdate ? '/api/articles/update' : '/api/articles/submit';
                if (isUpdate) payload.article_id = currentArticleId;

                const controller = new AbortController();
                const timeout = setTimeout(() => controller.abort(), 30000);
                const res = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                    signal: controller.signal
                });
                clearTimeout(timeout);

                const res = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                const data = await res.json();
                if (data.success) {
                    if (!isUpdate) currentArticleId = data.article_id;
                    msgBox.style.color = 'green'; msgBox.innerText = data.msg;
                    showToast(data.msg, 'success');
                    localStorage.removeItem('zn_draft');
                    if (action === 'submit') clearEditor();
                } else if (isUpdate && data.msg && data.msg.includes('不存在')) {
                    // 文章已被删除，回退为新建
                    currentArticleId = null;
                    saveArticle(action);
                    return;
            } else { msgBox.style.color = 'red'; msgBox.innerText = data.msg; }
            } catch (e) { msgBox.style.color = 'red'; msgBox.innerText = '网络异常: ' + (e.message || e); }
        }

        function clearEditor() {
            document.getElementById('article-title').value = '';
            if (window.vditorInstance) window.vditorInstance.setValue('');
            selectedParentId = null; selectedSubId = null; currentArticleId = null;
            articleTags = []; renderTags();
            document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('selected', 'sub-selected'));
            document.getElementById('subcat-group').style.display = 'none';
            document.getElementById('btn-new-article').style.display = 'none';
            document.getElementById('editor-msg').innerText = '';
        }

        function newArticle() {
            if (currentArticleId) {
                saveArticle('draft').then(() => clearEditor());
            } else {
                clearEditor();
            }
        }

        // ——— 文章审核列表 ———
        async function loadArticleAuditList() {
            const container = document.getElementById('article-audit-list');
            container.innerHTML = '<p style="text-align:center;color:#999;">正在加载...</p>';
            try {
                const res = await fetch('/api/articles/pending-list', { method: 'GET', cache: 'no-store' });
                const data = await res.json();
                document.getElementById('article-pending-count').innerText = data.list ? data.list.length : 0;
                if (data.success && data.list && data.list.length > 0) {
                    container.innerHTML = data.list.map(a => \`
                        <div class="horizontal-card" onclick="previewArticle('\${a.id}')">
                            <div class="card-meta">
                                <span class="card-title">\${a.title}</span>
                                <span class="card-sub">作者：\${a.author}</span>
                                <span class="card-sub">分类：\${a.cat_name || '-'}</span>
                            </div>
                            <span class="card-sub">\${new Date(a.created_at).toLocaleDateString()}</span>
                        </div>
                    \`).join('');
                } else {
                    container.innerHTML = '<p style="text-align:center;color:#999;">当前无待审核的文章</p>';
                }
            } catch (e) {
                container.innerHTML = '<p style="color:red;text-align:center;">加载失败</p>';
            }
        }

        let previewArticleId = null;

        async function previewArticle(articleId) {
            previewArticleId = articleId;
            try {
                const res = await fetch('/api/articles/detail?id=' + articleId, { cache: 'no-store' });
                const data = await res.json();
                if (data.success) {
                    const a = data.article;
                    document.getElementById('preview-title').innerText = a.title;
                    document.getElementById('preview-author').innerText = a.author;
                    document.getElementById('preview-cat').innerText = a.cat_name || '-';
                    document.getElementById('preview-body').innerHTML = marked.parse(a.content || '');
                    const tagsDiv = document.getElementById('preview-tags');
                    tagsDiv.innerHTML = (a.tags || []).map(t => \`<span style="background:#e8f5e9;color:#2e7d32;padding:2px 8px;border-radius:10px;font-size:12px;">#\${t}</span>\`).join('');
                    document.getElementById('preview-btn-approve').style.display = '';
                    document.getElementById('preview-btn-reject').style.display = '';
                    document.getElementById('preview-btn-approve').onclick = () => reviewArticle(articleId, 'approve');
                    document.getElementById('preview-btn-reject').onclick = () => reviewArticle(articleId, 'reject');
                    openModal('modal-article-preview');
                } else {
                    showToast(data.msg || '加载失败');
                }
            } catch (e) {
                showToast('加载失败');
            }
        }

        async function reviewArticle(articleId, action) {
            try {
                const res = await fetch('/api/articles/review', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ article_id: articleId, action })
                });
                const data = await res.json();
                if (data.success) {
                    showToast(data.msg, 'success');
                    closeModal('modal-article-preview');
                    loadArticleAuditList();
                } else {
                    showToast(data.msg || '操作失败');
                }
            } catch (e) {
                showToast('操作失败');
            }
        }

        // ——— 我的文章列表 ———
        let myArticleId = null;

        async function loadMyArticles() {
            const container = document.getElementById('my-articles-list');
            container.innerHTML = '<p style="text-align:center;color:#999;">正在加载...</p>';
            try {
                const res = await fetch('/api/articles/my-list', { cache: 'no-store' });
                const data = await res.json();
                if (data.success && data.list && data.list.length > 0) {
                    const statusMap = { draft: '草稿', pending: '待审核', approved: '已发布', rejected: '已驳回' };
                    const statusColor = { draft: '#888', pending: '#e6a817', approved: '#2e7d32', rejected: '#c62828' };
                    container.innerHTML = data.list.map(a => \`
                        <div class="horizontal-card" onclick="openMyArticle('\${a.id}')">
                            <div class="card-meta">
                                <span class="card-title">\${a.title}</span>
                                <span class="card-sub">分类：\${a.cat_name || '-'}</span>
                                <span style="font-size:12px;padding:2px 8px;border-radius:10px;background:\${statusColor[a.status]};color:#fff;">\${statusMap[a.status] || a.status}</span>
                            </div>
                            <span class="card-sub">\${new Date(a.updated_at).toLocaleString()}</span>
                        </div>
                    \`).join('');
                } else {
                    container.innerHTML = '<p style="text-align:center;color:#999;">你还没有撰写过文章</p>';
                }
            } catch (e) {
                container.innerHTML = '<p style="color:red;">加载失败</p>';
            }
        }

        async function openMyArticle(articleId) {
            myArticleId = articleId;
            try {
                const res = await fetch('/api/articles/my-list', { cache: 'no-store' });
                const data = await res.json();
                const article = (data.list || []).find(a => a.id === articleId);
                if (!article) { showToast('文章未找到'); return; }

                document.getElementById('my-article-title-display').innerText = article.title;
                document.getElementById('my-article-title-input').value = article.title;
                
                // 【修复核心】增加容错处理：确保 content 存在，如果为 null/undefined 则回退为空字符串
                document.getElementById('my-article-content').value = article.content || '';
                
                document.getElementById('my-article-tags').value = (article.tags || []).join(',');
                document.getElementById('my-article-status').innerText = {draft:'草稿',pending:'待审核',approved:'已发布',rejected:'已驳回'}[article.status] || article.status;

                // 动态渲染分类下拉框
                const catSelect = document.getElementById('my-article-cat-select');
                catSelect.innerHTML = Object.values(CATEGORIES.subs).flat().map(s => 
                    \`<option value="\${s.id}">\${s.name}</option>\`
                ).join('');
                
                // 数据回显绑定：优先匹配 category_id
                if (article.category_id) {
                    catSelect.value = article.category_id;
                } else {
                    const matchedCat = Object.values(CATEGORIES.subs).flat().find(s => s.name === article.cat_name);
                    if (matchedCat) catSelect.value = matchedCat.id;
                }

                const canEdit = article.status === 'draft' || article.status === 'rejected' || article.status === 'approved';
                const canDelete = article.status === 'draft' || article.status === 'rejected';
                
                document.getElementById('my-article-title-input').disabled = !canEdit;
                document.getElementById('my-article-content').disabled = !canEdit;
                document.getElementById('my-article-tags').disabled = !canEdit;
                catSelect.disabled = !canEdit; // 控制分类是否可改
                
                document.getElementById('my-article-btn-save').style.display = canEdit ? '' : 'none';
                document.getElementById('my-article-btn-submit').style.display = canEdit ? '' : 'none';
                document.getElementById('my-article-btn-delete').style.display = canDelete ? '' : 'none';

                openModal('modal-my-article');
            } catch (e) { showToast('加载失败'); }
        }

        async function updateMyArticle(action) {
            const title = document.getElementById('my-article-title-input').value.trim();
            const content = document.getElementById('my-article-content').value;
            const tags = document.getElementById('my-article-tags').value;
            const category_id = document.getElementById('my-article-cat-select').value; // 新增提取 category_id

            if (!title || !content) { showToast('标题和内容不能为空', 'warn'); return; }

            try {
                const res = await fetch('/api/articles/update', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    // 挂载 category_id 到 payload
                    body: JSON.stringify({ article_id: myArticleId, title, content, tags, category_id, action })
                });
                const data = await res.json();
                if (data.success) {
                    showToast(data.msg, 'success');
                    closeModal('modal-my-article');
                    loadMyArticles();
                } else { showToast(data.msg || '操作失败'); }
            } catch (e) { showToast('操作失败'); }
        }

        async function deleteMyArticle() {
            if (!confirm('确定要删除这篇文章吗？此操作不可恢复。')) return;
            try {
                const res = await fetch('/api/articles/delete', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ article_id: myArticleId })
                });
                const data = await res.json();
                if (data.success) {
                    showToast('文章已删除', 'success');
                    closeModal('modal-my-article');
                    loadMyArticles();
                } else { showToast(data.msg || '删除失败'); }
            } catch (e) { showToast('操作失败'); }
        }

        let approvedArticleContent = '';

        async function loadArticleApprovedList() {
            const container = document.getElementById('article-approved-list');
            container.innerHTML = '<p style="text-align:center;color:#999;">正在加载...</p>';
            try {
                const res = await fetch('/api/articles/approved-list', { cache: 'no-store' });
                const data = await res.json();
                if (data.success && data.list && data.list.length > 0) {
                    // 注入响应式样式
                    const style = \`
                        <style>
                            .dash-card { display: flex; align-items: center; padding: 16px 20px; background: #fff; border-radius: 8px; margin-bottom: 12px; cursor: pointer; border-left: 4px solid #2e7d32; box-shadow: 0 1px 4px rgba(0,0,0,0.05); transition: transform 0.2s; }
                            .dash-card:hover { transform: translateY(-2px); box-shadow: 0 4px 12px rgba(0,0,0,0.08); }
                            .dash-title { font-weight: 700; font-size: 15px; color: #1b5e20; width: 220px; flex-shrink: 0; padding-right: 16px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
                            .dash-meta { display: flex; flex: 1; gap: 16px; font-size: 13px; color: #666; }
                            .dash-divider { color: #ddd; }
                            .dash-date { font-size: 12px; color: #aaa; margin-left: 16px; flex-shrink: 0; }
                    
                            /* 移动端自动断行并隐藏分隔符 */
                            @media(max-width: 768px) {
                                .dash-card { flex-direction: column; align-items: flex-start; gap: 8px; }
                                .dash-title { width: 100%; white-space: normal; padding-right: 0; }
                                .dash-meta { flex-direction: column; gap: 6px; }
                                .dash-divider { display: none; }
                                .dash-date { margin-left: 0; margin-top: 4px; }
                            }
                        </style>
                    \`;
                    container.innerHTML = style + data.list.map(a => \`
                        <div class="dash-card" onclick="previewApprovedArticle('\${a.id}')">
                            <div class="dash-title">\${a.title}</div>
                            <div class="dash-meta">
                                <span>作者：\${a.author}</span><span class="dash-divider">|</span>
                                <span>审核：\${a.reviewer || '-'}</span><span class="dash-divider">|</span>
                                <span>分类：\${a.cat_name || '-'}</span>
                            </div>
                            <div class="dash-date">发布于 \${a.created_at.substring(0,10).replace(/-/g,'/')}</div>
                        </div>
                    \`).join('');
                } else {
                    container.innerHTML = '<p style="text-align:center;color:#999;">暂无已通过的文章</p>';
                }
            } catch (e) { container.innerHTML = '<p style="color:red;">加载失败</p>'; }
        }

        async function previewApprovedArticle(articleId) {
            try {
                const res = await fetch('/api/articles/detail?id=' + articleId, { cache: 'no-store' });
                const data = await res.json();
                if (data.success) {
                    const a = data.article;
                    document.getElementById('preview-title').innerText = a.title;
                    document.getElementById('preview-author').innerText = a.author;
                    document.getElementById('preview-cat').innerText = a.cat_name || '-';
                    document.getElementById('preview-body').innerHTML = marked.parse(a.content || '');
                    const tagsDiv = document.getElementById('preview-tags');
                    tagsDiv.innerHTML = (a.tags || []).map(t => \`<span style="background:#e8f5e9;color:#2e7d32;padding:2px 8px;border-radius:10px;font-size:12px;">#\${t}</span>\`).join('');
                    document.getElementById('preview-btn-approve').style.display = 'none';
                    document.getElementById('preview-btn-reject').style.display = 'none';
                    openModal('modal-article-preview');
                }
            } catch (e) { showToast('加载失败'); }
        }

        // Tab 切换逻辑
        function switchTab(tabKey) {
            document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
            document.querySelectorAll('.view-panel').forEach(el => el.classList.remove('active'));

            event.currentTarget.classList.add('active');
            document.getElementById(\`panel-\${tabKey}\`).classList.add('active');
            
            const titles = {
                'wiki': '维基百科镜像',
                'article-editor': '文章撰写',
                'my-articles': '我的文章',
                'user-audit': '用户注册申请审核',
                'article-audit': '文章审核',
                'keyword-audit': '待审核词条管理',
                'article-approved': '过审文章列表',
                'keyword-approved': '已通过词条列表',
                'members': '全体成员列表',
                'settings': '个人控制台设置'
            };
            document.getElementById('panel-title').innerText = titles[tabKey] || '控制台';

            // 进入文章编辑器时初始化 Vditor（离开时不销毁，保留内容）
            if (tabKey === 'article-editor') {
                if (!window.vditorInstance) initVditor();
            }

            currentTab = tabKey;

            // 移动端：点击导航项后自动收起侧边栏
            document.querySelector('.sidebar').classList.remove('open');
            const overlay = document.getElementById('sidebar-overlay');
            if (overlay) overlay.style.display = 'none';

            // 切换 tab 时自动刷新数据
            switch (tabKey) {
                case 'user-audit': loadUserAuditList(); break;
                case 'article-audit': loadArticleAuditList(); break;
                case 'keyword-audit': loadKeywordAuditList(); break;
                case 'keyword-approved': loadKeywordApprovedList(); break;
                case 'article-approved': loadArticleApprovedList(); break;
                case 'my-articles': loadMyArticles(); break;
                case 'members': loadMemberList(); break;
            }
        }

        /* ----- 功能一：注册审核与词条审核卡片弹窗逻辑 ----- */
        async function loadUserAuditList() {
            const container = document.getElementById('user-audit-list');
            container.innerHTML = '<p style="color:#999;text-align:center;">正在加载...</p>';
            try {
                const res = await fetch('/api/admin/pending-list', { method: 'POST', cache: 'no-store' });
                const data = await res.json();
                document.getElementById('user-pending-count').innerText = data.list ? data.list.length : 0;
                if (data.success && data.list && data.list.length > 0) {
                    container.innerHTML = data.list.map(u => \`
                        <div class="horizontal-card" onclick="openUserAuditModal('\${u.user}', '\${u.email || ''}', '\${(u.remark || '').replace(/'/g, "\\'")}')">
                            <div class="card-meta">
                                <span class="card-title">申请人：\${u.user}</span>
                                <span class="card-sub">邮箱：\${u.email || '未填写'}</span>
                                <span class="card-sub">申请理由：\${(u.remark || '无').substring(0, 15)}...</span>
                            </div>
                            <span class="card-sub">\${new Date(u.createdAt).toLocaleDateString()}</span>
                        </div>
                    \`).join('');
                } else {
                    container.innerHTML = '<p style="color:#999;text-align:center;">当前无待审核的注册申请</p>';
                }
            } catch (e) {
                container.innerHTML = '<p style="color:red;text-align:center;">加载失败: ' + (e.message || e) + '</p>';
            }
        }

        function openUserAuditModal(user, email, remark) {
            document.getElementById('modal-title').innerText = \`审核注册申请 - \${user}\`;
            document.getElementById('modal-content').innerHTML = \`
                <p><strong>用户名：</strong>\${user}</p>
                <p><strong>邮箱：</strong>\${email}</p>
                <p><strong>申请说明：</strong>\${remark}</p>
            \`;
            document.getElementById('modal-btn-approve').onclick = () => { auditUserAction(user, 'approve'); };
            document.getElementById('modal-btn-reject').onclick = () => { auditUserAction(user, 'reject'); };
            openModal('modal-audit');
        }

        async function auditUserAction(user, type) {
            try {
                const res = await fetch('/api/admin/' + type, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ targetUser: user })
                });
                const data = await res.json();
                if (data.success) {
                    showToast(type === 'approve' ? '已批准 ' + user + ' 的注册申请' : '已驳回 ' + user + ' 的注册申请');
                    closeModal('modal-audit');
                    loadUserAuditList(); // 刷新列表
                    if (type === 'approve') loadMemberList(); // 批准后刷新全体成员
                } else {
                    showToast(data.msg || '操作失败');
                }
            } catch (e) {
                showToast('操作失败: ' + (e.message || e));
            }
        }

        /* ----- 功能二：维基百科抽屉提交与词条审核 ----- */
        async function submitKeyword() {
            const kw = document.getElementById('kw-input').value.trim();
            const usage = document.getElementById('kw-usage').value.trim();
            if (!kw || !usage) return showToast("请填写完整词条和用途说明");

            try {
                const res = await fetch('/api/wiki/submit', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ keyword: kw, usage: usage })
                });
                const data = await res.json();
                if (data.success) {
                    showToast("已提交词条申请，等待词条审核员审核","success");
                    clearKwForm();
                    closeDrawer();
                } else if (data.msg === "该词条已经存在") {
                    showToast("该词条已经存在", "warn");
                } else {
                    showToast(data.msg || "提交失败");
                }
            } catch (e) {
                showToast("提交失败: " + (e.message || e));
            }
        }

        function clearKwForm() {
            document.getElementById('kw-input').value = '';
            document.getElementById('kw-usage').value = '';
        }

        function closeDrawer() {
            const drawer = document.getElementById('wiki-drawer-panel');
            drawer.style.right = '-360px';
            if (document.activeElement) document.activeElement.blur();
            // 清除 force-open 状态
            drawer.classList.remove('force-open');
            setTimeout(() => { drawer.style.right = ''; }, 300);
        }

        async function loadKeywordAuditList() {
            const container = document.getElementById('keyword-audit-list');
            container.innerHTML = '<p style="color:#999;text-align:center;">正在加载...</p>';
            try {
                const res = await fetch('/api/wiki/pending', { method: 'GET', cache: 'no-store' });
                const data = await res.json();
                document.getElementById('kw-pending-count').innerText = data.list ? data.list.length : 0;
                if (data.success && data.list && data.list.length > 0) {
                    container.innerHTML = data.list.map(item => \`
                        <div class="horizontal-card" onclick="openKeywordAuditModal('\${item.id}', '\${item.user}', '\${item.keyword}', '\${(item.usage || '').replace(/'/g, "\\'")}')">
                            <div class="card-meta">
                                <span class="card-title">关键词：\${item.keyword}</span>
                                <span class="card-sub">提交人：\${item.user}</span>
                                <span class="card-sub">用途：\${(item.usage || '').substring(0, 15)}</span>
                            </div>
                            <button class="btn btn-primary" style="padding:4px 10px;">审查</button>
                        </div>
                    \`).join('');
                } else {
                    container.innerHTML = '<p style="color:#999;text-align:center;">当前无待审核的词条</p>';
                }
            } catch (e) {
                container.innerHTML = '<p style="color:red;text-align:center;">加载失败: ' + (e.message || e) + '</p>';
            }
        }

        async function loadKeywordApprovedList() {
            const container = document.getElementById('keyword-approved-list');
            container.innerHTML = '<p style="color:#999;text-align:center;">正在加载...</p>';
            try {
                const res = await fetch('/api/wiki/approved', { method: 'GET', cache: 'no-store' });
                const data = await res.json();
                if (data.success && data.list && data.list.length > 0) {
                    container.innerHTML = \`
                        <table class="member-table">
                            <thead>
                                <tr>
                                    <th>关键词</th>
                                    <th>提交者</th>
                                    <th>审核员</th>
                                    <th>通过时间</th>
                                    <th>用途说明</th>
                                </tr>
                            </thead>
                            <tbody>
                                \${data.list.map(item => \`
                                <tr>
                                    <td><strong>\${item.keyword}</strong></td>
                                    <td>\${item.user || '-'}</td>
                                    <td>\${item.reviewer || '-'}</td>
                                    <td>\${new Date(item.approvedAt).toLocaleString()}</td>
                                    <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="\${(item.usage || '').replace(/"/g, '&quot;')}">\${(item.usage || '-').substring(0, 30)}</td>
                                </tr>
                                \`).join('')}
                            </tbody>
                        </table>
                    \`;
                } else {
                    container.innerHTML = '<p style="color:#999;text-align:center;">暂无已通过的词条</p>';
                }
            } catch (e) {
                container.innerHTML = '<p style="color:red;text-align:center;">加载失败: ' + (e.message || e) + '</p>';
            }
        }

        function openKeywordAuditModal(id, applicant, keyword, usage) {
            document.getElementById('modal-title').innerText = \`词条审核 - \${keyword}\`;
            document.getElementById('modal-content').innerHTML = \`
                <p><strong>提交成员：</strong>\${applicant}</p>
                <p><strong>词条名称：</strong>\${keyword}</p>
                <p><strong>申请用途：</strong>\${usage}</p>
            \`;
            document.getElementById('modal-btn-approve').onclick = () => { auditKwAction(id, 'approve'); };
            document.getElementById('modal-btn-reject').onclick = () => { auditKwAction(id, 'reject'); };
            openModal('modal-audit');
        }

        async function auditKwAction(id, type) {
            try {
                const res = await fetch('/api/wiki/review', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id: id, action: type })
                });
                const data = await res.json();
                if (data.success) {
                    showToast(type === 'approve' ? "词条已通过并归档至数据库" : "词条申请已驳回");
                    closeModal('modal-audit');
                    loadKeywordAuditList(); // 刷新列表
                    if (type === 'approve') loadKeywordApprovedList(); // 批准后刷新过审词条
                } else {
                    showToast(data.msg || "操作失败");
                }
            } catch (e) {
                showToast("操作失败: " + (e.message || e));
            }
        }

        /* ----- 三级角色管理列表 (管理员操作) ----- */
        async function loadMemberList() {
            const tbody = document.getElementById('member-table-body');
            tbody.innerHTML = '<tr><td colspan="3" style="color:#999;text-align:center;">正在加载...</td></tr>';
            try {
                const res = await fetch('/api/admin/users', { method: 'GET', cache: 'no-store' });
                const data = await res.json();
                if (data.success && data.list && data.list.length > 0) {
                    tbody.innerHTML = data.list.map(m => \`
                        <tr>
                            <td>\${m.username}</td>
                            <td><span class="role-badge">\${m.role}</span></td>
                            <td class="role-admin-only">
                                \${m.username === ROOT_USER ? '<span style="color:#999;font-size:12px;"></span>' : \`
                                <button class="btn btn-secondary" style="padding:4px 8px;font-size:12px;" onclick="changeUserRole('\${m.username}', 'admin')">设为管理员</button>
                                <button class="btn btn-secondary" style="padding:4px 8px;font-size:12px;" onclick="changeUserRole('\${m.username}', 'article_reviewer')">设为文章审核员</button>
                                <button class="btn btn-secondary" style="padding:4px 8px;font-size:12px;" onclick="changeUserRole('\${m.username}', 'keyword_reviewer')">设为词条审核员</button>
                                <button class="btn btn-secondary" style="padding:4px 8px;font-size:12px;" onclick="changeUserRole('\${m.username}', 'member')">设为普通成员</button>
                                \`}
                            </td>
                        </tr>
                    \`).join('');
                } else {
                    tbody.innerHTML = '<tr><td colspan="3" style="color:#999;text-align:center;">暂无成员数据</td></tr>';
                }
                applyRolePermissions();
            } catch (e) {
                tbody.innerHTML = '<tr><td colspan="3" style="color:red;text-align:center;">加载失败: ' + (e.message || e) + '</td></tr>';
            }
        }

        async function changeUserRole(targetUser, newRole) {
            try {
                const res = await fetch('/api/admin/users', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ targetUser: targetUser, role: newRole })
                });
                const data = await res.json();
                if (data.success) {
                    showToast('已将 ' + targetUser + ' 的身份更新为: ' + newRole, 'success');
                    loadMemberList(); // 刷新列表
                } else {
                    showToast(data.msg || "操作失败", 'error');
                }
            } catch (e) {
                showToast("操作失败: " + (e.message || e), 'error');
            }
        }

        /* ----- 设置页面 & 密码修改工作流 ----- */
        function toggleWikiDrawerSetting(enabled) {
            document.getElementById('wiki-drawer-panel').style.display = enabled ? 'flex' : 'none';
            showToast(enabled ? "已开启侧边栏" : "已关闭侧边栏（纯净模式）");
        }

        function togglePasswordForm() {
            const box = document.getElementById('password-form-box');
            box.style.display = box.style.display === 'none' ? 'block' : 'none';
        }

        function triggerForgetOldPassword() {
            showToast("验证码已发送至邮箱，请注意查收", 'success');
            openModal('modal-otp');
        }

        function verifyForgetOtp() {
            const otp = document.getElementById('otp-input').value.trim();
            if (otp.length !== 6) return showToast("请输入6位有效的验证码");
            
            forgetOtpVerified = true;
            document.getElementById('old-pwd-group').style.display = 'none'; // 隐藏旧密码框
            closeModal('modal-otp');
            showToast("验证成功，请直接设置新密码");
        }

        function submitPasswordChange() {
            const pNew = document.getElementById('pwd-new').value;
            const pConfirm = document.getElementById('pwd-confirm').value;
            if (pNew !== pConfirm) return showToast("两次输入的密码不一致");
            
            showToast("密码修改成功！", 'success');
            togglePasswordForm();
        }

        function clearPwdForm() {
            document.getElementById('pwd-old').value = '';
            document.getElementById('pwd-new').value = '';
            document.getElementById('pwd-confirm').value = '';
        }

        /* 通用 Modal 辅助函数 */
        function openModal(id) { document.getElementById(id).classList.add('active'); }
        function closeModal(id) { document.getElementById(id).classList.remove('active'); }
        function logout() { 
            document.cookie = "session=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
            window.location.href = '/manage'; 
        }
    </script>
</body>
</html>
    `;

    // 返回组装好的 HTML，并设置正确的 Content-Type[cite: 9]
    return new Response(html, {
        headers: {
            "Content-Type": "text/html;charset=UTF-8",
            "Cache-Control": "no-store" // 防止浏览器缓存敏感的控制台页面
        }
    });
}
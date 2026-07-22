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
    </style>
</head>
<body>

    <div id="toast" class="toast"></div>

    <!-- 左侧导航 -->
    <aside class="sidebar">
        <div>
            <div class="brand">🌱 平台控制中心</div>
            <ul class="nav-list">
                <li class="nav-item active" onclick="switchTab('wiki')">🌐 维基百科</li>
                <li class="nav-item role-admin-only" onclick="switchTab('user-audit')">📝 注册审核 <span id="user-pending-count" class="role-badge">0</span></li>
                <li class="nav-item role-reviewer-only" onclick="switchTab('keyword-audit')">🔍 词条审核 <span id="kw-pending-count" class="role-badge">0</span></li>
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
            <h3 id="panel-title">维基百科镜像代理</h3>
        </header>

        <!-- 1. 维基百科面板 -->
        <section id="panel-wiki" class="view-panel active" style="padding:0;">
            <div class="wiki-container">
                <iframe id="wiki-frame" class="wiki-iframe" src="https://wiki.findingstar.top"></iframe>
                <div class="wiki-trigger-zone"></div>
                <!-- 侧边抽屉 -->
                <div id="wiki-drawer-panel" class="wiki-drawer">
                    <h4>提交新词条词条申请</h4>
                    <div class="form-group">
                        <label>您要提交的关键词：</label>
                        <input type="text" id="kw-input" class="form-control" placeholder="例如：农业物联网">
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

        function showToast(msg) {
            const toast = document.getElementById('toast');
            toast.innerText = msg;
            toast.style.display = 'block';
            setTimeout(() => { toast.style.display = 'none'; }, 2500);
        }

        // 页面初始化：权限受控渲染
        window.addEventListener('DOMContentLoaded', () => {
            applyRolePermissions();
            loadUserAuditList();
            loadKeywordAuditList();
            loadMemberList();
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
        }

        // Tab 切换逻辑
        function switchTab(tabKey) {
            document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
            document.querySelectorAll('.view-panel').forEach(el => el.classList.remove('active'));

            event.currentTarget.classList.add('active');
            document.getElementById(\`panel-\${tabKey}\`).classList.add('active');
            
            const titles = {
                'wiki': '维基百科镜像代理',
                'user-audit': '用户注册申请审核',
                'keyword-audit': '待审核词条管理',
                'members': '全体成员列表',
                'settings': '个人控制台设置'
            };
            document.getElementById('panel-title').innerText = titles[tabKey] || '控制台';
        }

        /* ----- 功能一：注册审核与词条审核卡片弹窗逻辑 ----- */
        async function loadUserAuditList() {
            const container = document.getElementById('user-audit-list');
            container.innerHTML = '<p style="color:#999;text-align:center;">正在加载...</p>';
            try {
                const res = await fetch('/api/admin/pending-list', { method: 'POST' });
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
                    showToast("已提交词条申请，等待词条审核员审核");
                    clearKwForm();
                    closeDrawer();
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
            setTimeout(() => { drawer.style.right = ''; }, 300);
        }

        async function loadKeywordAuditList() {
            const container = document.getElementById('keyword-audit-list');
            container.innerHTML = '<p style="color:#999;text-align:center;">正在加载...</p>';
            try {
                const res = await fetch('/api/wiki/pending', { method: 'GET' });
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
                const res = await fetch('/api/admin/users', { method: 'GET' });
                const data = await res.json();
                if (data.success && data.list && data.list.length > 0) {
                    tbody.innerHTML = data.list.map(m => \`
                        <tr>
                            <td>\${m.username}</td>
                            <td><span class="role-badge">\${m.role}</span></td>
                            <td class="role-admin-only">
                                \${m.username === ROOT_USER ? '<span style="color:#999;font-size:12px;"></span>' : \`
                                <button class="btn btn-secondary" style="padding:4px 8px;font-size:12px;" onclick="changeUserRole('\${m.username}', 'keyword_reviewer')">设为词条审核员</button>
                                <button class="btn btn-secondary" style="padding:4px 8px;font-size:12px;" onclick="changeUserRole('\${m.username}', 'admin')">设为管理员</button>
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
                    showToast('已将 ' + targetUser + ' 的身份更新为: ' + newRole);
                    loadMemberList(); // 刷新列表
                } else {
                    showToast(data.msg || "操作失败");
                }
            } catch (e) {
                showToast("操作失败: " + (e.message || e));
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
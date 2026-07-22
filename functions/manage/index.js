// 主路由入口：统一分发 GET（页面）与 POST（接口）请求
export async function onRequest(context) {
    const { request, env } = context;
    const url = new URL(request.url);
    const pathname = url.pathname;

    // POST API 请求
    if (request.method === "POST") {
        if (pathname.endsWith("/api/send-code")) return handleSendCode(request, env);
        if (pathname.endsWith("/api/register")) return handleRegister(request, env);
        if (pathname.endsWith("/api/login")) return handleLogin(request, env);
        if (pathname.endsWith("/api/admin/pending-list")) return handleGetPendingUsers(request, env);
        if (pathname.endsWith("/api/admin/approve")) return handleApproveUser(request, env);
        if (pathname.endsWith("/api/admin/reject")) return handleRejectUser(request, env);
    }

    // GET 请求处理：渲染登录/注册 UI 界面
    if (request.method === "GET") {
        if (pathname === "/dashboard") {
            // 校验是否登录，未登录直接踢回首页
            const userCtx = await checkSession(request, env);
            if (!userCtx) return Response.redirect(url.origin + "/", 302);
            // 渲染控制台，并将用户上下文注入进去
            return renderDashboardPage(userCtx);
        }
        // 默认返回登录页
        return renderAuthPage();
    }

    return new Response("Method Not Allowed", { status: 405 });
}

// 通用邮箱归一化与校验函数
function cleanAndValidateEmail(rawEmail) {
    if (!rawEmail) return { valid: false, email: "" };
    
    // 归一化：去空格、转小写、替换全角字符和中文句号
    const email = rawEmail
        .trim()
        .toLowerCase()
        .replace(/＠/g, "@")
        .replace(/．/g, ".")
        .replace(/。/g, ".");

    // 使用不依赖 \s 反斜杠转义的兼容正则，防止模板字符串渲染错误
    const isValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && !email.includes(' ');
    
    return { valid: isValid, email };
}

// 前端渲染
export async function renderAuthPage() {
  const html = `
  <!DOCTYPE html>
  <html lang="zh-CN">
  <head>
      <meta charset="UTF-8">
      <title>系统管理中心 - 注册与登录</title>
      <meta name="viewport" content="width=device-width,initial-scale=1.0">
      <style>
          * { margin:0; padding:0; box-sizing:border-box; }
          
          body { 
              height:100vh; 
              font-family:"Helvetica Neue",Arial,sans-serif; 
              background:#f1f8f1; 
              display:flex; 
              align-items:center; 
              justify-content:center; 
              color:#333; 
              overflow:hidden;
              position:relative;
          }

          /* 左上角圆形几何体 */
          body::before { 
              content:""; 
              position:absolute; 
              width:400px; 
              height:400px; 
              background:#a5d6a7; 
              border-radius:50%; 
              top:-120px; 
              left:-120px; 
              opacity:.35; 
          }

          /* 右下角旋转圆角几何体 */
          body::after { 
              content:""; 
              position:absolute; 
              width:350px; 
              height:350px; 
              background:#81c784; 
              border-radius:20%; 
              bottom:-100px; 
              right:-100px; 
              transform:rotate(30deg); 
              opacity:.25; 
          }

          /* 居中卡片容器 */
          .container { 
              position:relative; 
              width:90%; 
              max-width:420px; 
              background:white; 
              padding:40px; 
              border-radius:12px; 
              box-shadow:0 8px 20px rgba(0,0,0,.12); 
              z-index:10; 
          }

          /* Tab 选项卡样式 */
          .tabs { display:flex; margin-bottom:24px; border-bottom:1px solid #eee; }
          .tab { flex:1; text-align:center; padding:10px; cursor:pointer; font-weight:bold; color:#777; transition:.2s; }
          .tab.active { color:#2e7d32; border-bottom:2px solid #2e7d32; }

          .form-group { margin-bottom:16px; text-align:left; }
          label { display:block; margin-bottom:6px; font-size:14px; color:#555; }
          
          input, textarea { 
              width:100%; 
              padding:14px; 
              background:#fff;
              border:1px solid #ccc; 
              border-radius:8px; 
              font-size:16px; 
              outline:none; 
              color:#333;
              transition:.2s;
          }
          input:focus, textarea:focus { border-color:#2e7d32; }

          /* 登录方式切换单选框样式 */
          .method { display:none; margin-bottom:16px; margin-top:-6px; }
          .method label { margin-right:20px; font-size:14px; color:#555; cursor:pointer; }
          .method input[type="radio"] { width: auto; display: inline-block; margin-right: 4px; }

            .code-row { display:flex; gap:8px; }
            .code-row input { flex:1; }
            .send-btn { 
                width:120px; 
                margin-top:0; 
                padding:12px; 
                font-size:13px; 
                background:#388e3c; 
                color:white; 
                border:none; 
                border-radius:8px; 
                cursor:pointer; 
            }

          button.submit-btn { 
              margin-top:10px; 
              width:100%; 
              padding:14px; 
              border:none; 
              border-radius:8px; 
              background:#2e7d32; 
              color:white; 
              font-size:16px; 
              cursor:pointer; 
              transition:.3s; 
          }
          button:hover { background:#1b5e20; }
          button:disabled { background:#a5d6a7; cursor:not-allowed; }

          .toggle-form { display:none; }
          .toggle-form.active { display:block; }
          #info-box { margin-top:15px; text-align:center; font-size:14px; min-height:20px; }

            /* 审核列表卡片样式 */
            .user-card { border:1px solid #eee; background:#fafafa; border-radius:8px; padding:12px; margin-bottom:10px; text-align:left; }
            .user-card p { font-size:13px; color:#666; margin-top:4px; line-height:1.4; }
            .btn-group { display:flex; gap:8px; margin-top:10px; }
            .approve-btn { flex:1; padding:8px; font-size:13px; background:#2e7d32; color:white; border:none; border-radius:6px; cursor:pointer; }
            .reject-btn { flex:1; padding:8px; font-size:13px; background:#c62828; color:white; border:none; border-radius:6px; cursor:pointer; }

            /* 淡出 Toast 弹窗样式 */
            .toast {
                position: fixed;
                top: 30px;
                left: 50%;
                transform: translateX(-50%) translateY(-20px);
                background: rgba(211, 47, 47, 0.9);
                color: white;
                padding: 12px 24px;
                border-radius: 8px;
                font-size: 14px;
                box-shadow: 0 4px 12px rgba(0,0,0,0.15);
                z-index: 9999;
                opacity: 0;
                pointer-events: none;
                transition: opacity 0.4s ease, transform 0.4s ease;
            }
            .toast.show {
                opacity: 1;
                transform: translateX(-50%) translateY(0);
            }
      </style>
  </head>
  <body>

    <!-- 弹窗挂载点 -->
    <div id="toast" class="toast"></div>

  <div class="container">
      <div class="tabs">
          <div class="tab active" id="tab-login" onclick="switchTab('login')">用户登录</div>
          <div class="tab" id="tab-reg" onclick="switchTab('reg')">新用户注册</div>
      </div>

      <!-- 登录表单 -->
      <div id="form-login" class="toggle-form active">
          <div class="form-group">
              <label>用户名/电子邮箱</label>
              <input type="text" id="login-identifier" placeholder="请输入用户名或电子邮箱" oninput="toggleLoginMode()">
          </div>

          <!-- 动态显示的登录方式选择 -->
          <div id="emailMethod" class="method">
              <label>
                  <input type="radio" name="method" id="radio-pwd" checked onclick="changeMethod('password')"> 密码登录
              </label>
              <label>
                  <input type="radio" name="method" id="radio-code" onclick="changeMethod('code')"> 验证码登录
              </label>
          </div>

          <div id="passwordBox" class="form-group">
              <input type="password" id="login-pass" placeholder="请输入密码">
          </div>
          
          <div id="codeBox" class="form-group" style="display:none;">
              <div class="code-row">
                  <input type="text" id="login-code" placeholder="6位验证码">
                  <button class="send-btn" id="btn-login-send-code" onclick="sendEmailCode('login')">发送验证码</button>
              </div>
          </div>
          <button class="submit-btn" id="btn-login" onclick="handleAuth('login')">立即登录</button>
      </div>

      <!-- 注册表单 -->
      <div id="form-reg" class="toggle-form">
          <div class="form-group">
              <label>设置用户名</label>
              <input type="text" id="reg-user" placeholder="整个响当当的大名吧">
          </div>
          <div class="form-group">
              <label>设置密码</label>
              <input type="password" id="reg-pass" placeholder="需同时包含大小写字母、数字和特殊字符">
          </div>
          <div class="form-group">
                <label>电子邮箱</label>
                <input type="email" id="reg-email" placeholder="请输入有效的电子邮箱">
            </div>
            <div class="form-group">
                <label>邮箱验证码</label>
                <div class="code-row">
                    <input type="text" id="reg-code" placeholder="6位数字验证码">
                    <button class="send-btn" id="btn-send-code" onclick="sendEmailCode()">发送验证码</button>
                </div>
          </div>
          <div class="form-group">
                <label>注册申请说明</label>
                <textarea id="reg-remark" rows="2" placeholder="请填写申请加入的理由"></textarea>
          </div>
          <button class="submit-btn" id="btn-reg" onclick="handleAuth('register')">提交注册</button>
      </div>

      <div id="info-box"></div>
  </div>

  <script>
        let currentUserRole = "member";

        // Toast 淡出弹窗控制逻辑
        let toastTimer = null;
        function showToast(message) {
            const toast = document.getElementById('toast');
            toast.innerText = message;
            toast.classList.add('show');

            if (toastTimer) clearTimeout(toastTimer);
            toastTimer = setTimeout(() => {
                toast.classList.remove('show');
            }, 2500); // 2.5 秒后自动淡出隐藏
        }

        // 密码强度检测函数：必须同时包含大写字母、小写字母、数字和特殊字符
        function isStrongPassword(pass) {
            return /[A-Z]/.test(pass) && /[a-z]/.test(pass) && /[0-9]/.test(pass) && /[^A-Za-z0-9]/.test(pass);
        }

      function switchTab(type) {
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.toggle-form').forEach(f => f.classList.remove('active'));
            
            document.getElementById('tab-' + type).classList.add('active');
            document.getElementById('form-' + type).classList.add('active');
            document.getElementById('info-box').innerText = "";

            if(type === 'admin') loadPendingUsers();
        }

        let loginType = "password";

        // 监听输入框，是邮箱则展开验证码框
        function toggleLoginMode() {
            const val = document.getElementById('login-identifier').value.trim();
            const emailMethod = document.getElementById('emailMethod');
            
            if (val.includes('@')) {
                emailMethod.style.display = 'block';
            } else {
                emailMethod.style.display = 'none';
                // 不是邮箱时，强制退回密码登录模式
                document.getElementById('radio-pwd').checked = true;
                changeMethod('password');
            }
        }

        // 切换密码/验证码登录的UI处理
        function changeMethod(type) {
            loginType = type;
            const passwordBox = document.getElementById('passwordBox');
            const codeBox = document.getElementById('codeBox');

            if (type === 'password') {
                passwordBox.style.display = 'block';
                codeBox.style.display = 'none';
                document.getElementById('login-code').value = ''; // 清空可能残留的验证码
            } else {
                passwordBox.style.display = 'none';
                codeBox.style.display = 'block';
                document.getElementById('login-pass').value = ''; // 清空可能残留的密码
            }
        }

        // 发送邮箱验证码逻辑
        function parseEmail(inputVal) {
            if (!inputVal) return { valid: false, email: "" };
            const clean = inputVal.trim().toLowerCase().replace(/＠/g, "@").replace(/．/g, ".").replace(/。/g, ".");
            // 避开 \\s 转义问题的通用正则
            const isValid = /^[^@ ]+@[^@ ]+\.[^@ ]+$/.test(clean);
            return { valid: isValid, email: clean };
        }

        // 发送邮箱验证码逻辑
        let countdown = 0;
        async function sendEmailCode(actionType = 'register') {
            const emailId = actionType === 'login' ? 'login-identifier' : 'reg-email';
            const btnId = actionType === 'login' ? 'btn-login-send-code' : 'btn-send-code';

            const rawVal = document.getElementById(emailId).value;
            const { valid, email } = parseEmail(rawVal);
            const btn = document.getElementById(btnId);

            if (!valid) {
                showToast("请输入正确的邮箱地址");
                return;
            }

            btn.disabled = true;
            try {
                const res = await fetch('/api/send-code', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, action: actionType })
                });
                const data = await res.json();
                if (data.success) {
                    showToast("验证码已发送至邮箱，请查收，有效期 5 分钟");
                    countdown = 60;
                    const timer = setInterval(() => {
                        countdown--;
                        btn.innerText = countdown + "s 后重发";
                        if (countdown <= 0) {
                            clearInterval(timer);
                            btn.innerText = "发送验证码";
                            btn.disabled = false;
                        }
                    }, 1000);
                } else {
                    showToast(data.msg || "发送失败");
                    btn.disabled = false;
                }
            } catch(e) {
                showToast("网络异常，无法发送验证码");
                btn.disabled = false;
            }
        }

      // 提交登录与注册表单
      async function handleAuth(action) {
          const infoBox = document.getElementById('info-box');
          const btn = document.getElementById(action === 'login' ? 'btn-login' : 'btn-reg');
          let payload = {};

          if (action === 'login') {
                const identifier = document.getElementById('login-identifier').value.trim();
                const pass = document.getElementById('login-pass').value.trim();
                const code = document.getElementById('login-code').value.trim();
                
                if (!identifier) {
                    infoBox.style.color = "red";
                    infoBox.innerText = "请输入用户名或电子邮箱";
                    return;
                }

                // 根据当前的 loginType 进行对应的拦截
                if (loginType === 'password' && !pass) {
                    infoBox.style.color = "red";
                    infoBox.innerText = "请输入密码";
                    return;
                }
                if (loginType === 'code' && !code) {
                    infoBox.style.color = "red";
                    infoBox.innerText = "请输入邮箱验证码";
                    return;
                }
                
                // 按需组装 payload，避免密码和验证码被同时误传
                payload = { 
                    identifier, 
                    pass: loginType === 'password' ? pass : undefined, 
                    code: loginType === 'code' ? code : undefined 
                };
          }

          // 注册时触发密码强度判定
          if (action === 'register') {
                const user = document.getElementById('reg-user').value.trim();
                const pass = document.getElementById('reg-pass').value.trim();
                const email = document.getElementById('reg-email').value.trim();
                const code = document.getElementById('reg-code').value.trim();
                const remark = document.getElementById('reg-remark').value.trim();

                if (!user || !pass || !email || !code || !remark) {
                    infoBox.style.color = "red";
                    infoBox.innerText = "请完整填写所有五项注册信息";
                    return;
                }

                if (!isStrongPassword(pass)) {
                    showToast("密码复杂度不够，需同时包含大小写字母、数字及特殊符号");
                    return;
                }

                payload = { user, pass, email, code, remark };
          }
          
          btn.disabled = true;
          infoBox.style.color = "#666"; 
          infoBox.innerText = action === 'login' ? "正在验证身份..." : "正在提交注册申请...";

          try {
              const res = await fetch(window.location.origin + \`/api/\${action}\`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
              });
              const data = await res.json();

              if(res.ok && data.success) {
                  infoBox.style.color = "green";
                  infoBox.innerText = data.msg;
                  
                  if(action === 'register') {
                        setTimeout(() => { switchTab('login'); btn.disabled = false; }, 1500);
                    } else {
                        // 登录成功判断角色
                        if(data.role === 'admin') {
                            document.getElementById('tab-admin').style.display = 'block';
                            showToast("管理员登录成功，正在进入控制台...");
                        } else {
                            showToast("登录成功，正在进入控制台...");
                            setTimeout(() => { window.location.href = '/dashboard'; }, 1000);
                        }
                    }
              } else {
                  infoBox.style.color = "red";
                  infoBox.innerText = data.msg || "请求失败";
                  btn.disabled = false;
              }
          } catch(e) {
              infoBox.style.color = "red";
              infoBox.innerText = "网络异常或服务端报错";
              btn.disabled = false;
          }
      }

      // 加载待审核用户列表
        async function loadPendingUsers() {
            const container = document.getElementById('pending-list');
            container.innerHTML = "正在拉取名单...";
            try {
                const res = await fetch('/api/admin/pending-list', { method: 'POST' });
                const data = await res.json();
                if(data.success && data.list.length > 0) {
                    container.innerHTML = data.list.map(u => \`
                        <div class="user-card">
                            <strong>用户名：\${u.user}</strong>
                            <p><strong>注册邮箱：</strong>\${u.email || '未填写'}</p>
                            <p><strong>申请表单信息：</strong>\${u.remark || '无'}</p>
                            <p><strong>申请时间：</strong>\${new Date(u.createdAt).toLocaleString()}</p>
                            <div class="btn-group">
                                <button class="approve-btn" onclick="reviewUser('\${u.user}', 'approve')">批准通过</button>
                                <button class="reject-btn" onclick="reviewUser('\${u.user}', 'reject')">拒绝通过</button>
                            </div>
                        </div>
                    \`).join('');
                } else {
                    container.innerHTML = "<p style='color:#999; text-align:center;'>当前无待审核的注册申请</p>";
                }
            } catch(e) {
                container.innerHTML = "加载失败";
            }
        }


        // 执行审核操作：批准或拒绝
        async function reviewUser(targetUser, action) {
            try {
                const res = await fetch(\`/api/admin/\${action}\`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ targetUser })
                });
                const data = await res.json();
                if(data.success) {
                    showToast(action === 'approve' ? "已批准该用户注册" : "已拒绝该注册申请");
                    loadPendingUsers();
                } else {
                    showToast(data.msg || "操作失败");
                }
            } catch(e) {
                showToast("操作失败");
            }
        }
  </script>
  </body>
  </html>
  `;
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}

// ---------------- 后端 API 与 KV 数据交互 ----------------

// SHA-256 密码加密
async function hashPassword(password) {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// 校验密码强度的服务端后备函数
function checkPasswordStrength(pass) {
    const hasUpper = /[A-Z]/.test(pass);
    const hasLower = /[a-z]/.test(pass);
    const hasNumber = /[0-9]/.test(pass);
    const hasSpecial = /[^A-Za-z0-9]/.test(pass);
    return hasUpper && hasLower && hasNumber && hasSpecial;
}

// 管理员身份校验中间件辅助函数
async function checkAdmin(request, env) {
    const cookie = request.headers.get("Cookie");
    if (!cookie) return false;
    const match = cookie.match(/session=([^;]+)/);
    if (!match) return false;
    const sessionId = match[1];

    // Session 仅作凭证，动态查询最新 role 
    const sessionDataStr = await env.USER_DB.get(`session:${sessionId}`);
    if (!sessionDataStr) return false;
    try {
        const sessionData = JSON.parse(sessionDataStr);
        // 使用 session 中绑定的 user 再次查询数据库，防止缓存了旧权限
        const userDataRaw = await env.USER_DB.get(`user:${sessionData.user}`);
        if (!userDataRaw) return false;
        const user = JSON.parse(userDataRaw);
        return user.role === "admin";
    } catch (e) {
        return false;
    }
}

// 通用身份校验与数据读取
async function checkSession(request, env) {
    const cookie = request.headers.get("Cookie");
    if (!cookie) return null;
    const match = cookie.match(/session=([^;]+)/);
    if (!match) return null;
    const sessionId = match[1];

    const sessionDataStr = await env.USER_DB.get(`session:${sessionId}`);
    if (!sessionDataStr) return null;
    try {
        const sessionData = JSON.parse(sessionDataStr);
        const userDataRaw = await env.USER_DB.get(`user:${sessionData.user}`);
        if (!userDataRaw) return null;
        const user = JSON.parse(userDataRaw);
        return { username: sessionData.user, role: user.role };
    } catch (e) {
        return null;
    }
}

// 发送邮箱验证码处理逻辑
async function handleSendCode(request, env) {
    try {
        const KV = env.USER_DB;
        if (!KV) return Response.json({ success: false, msg: "未绑定 USER_DB 数据库" }, { status: 500 });

        const { email, action } = await request.json();
        if (!email || !/^[^@ ]+@[^@ ]+\.[^@ ]+$/.test(email)) {
            return Response.json({ success: false, msg: "邮箱格式不正确" }, { status: 400 });
        }

        // 发送接口 IP 频率限制 (1分钟最多5次)
        const ip = request.headers.get("cf-connecting-ip") || "unknown";
        const ipLimitKey = `limit:send_ip:${ip}`;
        const ipSendStats = await KV.get(ipLimitKey);

        if (ipSendStats) {
            const count = parseInt(ipSendStats);
            if (count >= 5) {
                return Response.json({ success: false, msg: "当前IP发送频率过高，请 1 分钟后再试" }, { status: 429 });
            }
            await KV.put(ipLimitKey, (count + 1).toString(), { expirationTtl: 60 });
        } else {
            await KV.put(ipLimitKey, "1", { expirationTtl: 60 }); // IP维度防刷
        }

        // 验证码发送频率限制（防刷、防邮箱轰炸）
        const limitKey = `limit:code:${email}`;
        const limited = await KV.get(limitKey);
        if (limited) {
            return Response.json({ success: false, msg: "发送过于频繁，请 60 秒后再试" }, { status: 429 });
        }

        if (action === 'login') {
            const mappedUser = await KV.get(`email:${email}`);
            if (!mappedUser) {
                return Response.json({ success: false, msg: "该邮箱尚未注册或申请" }, { status: 404 });
            }
        }

        // 生成 6 位随机数字验证码
        // 使用 Web Crypto API 生成密码学安全的随机数
        const randArray = new Uint32Array(1);
        crypto.getRandomValues(randArray);
        const code = (randArray[0] % 900000 + 100000).toString();  // % 900000 确保在 0~899999 之间，加上 100000 即 100000~999999

        // 验证码用途隔离（区分 register 与 login，避免相互覆盖）
        const actionType = action || 'register';
        await KV.put(`code:${actionType}:${email}`, code, { expirationTtl: 300 });
        await KV.put(limitKey, "1", { expirationTtl: 60 });

        if (env.RESEND_API_KEY) {
            await fetch('https://api.resend.com/emails', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${env.RESEND_API_KEY}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    from: 'System <onboarding@resend.dev>',
                    to: [email],
                    subject: '验证码',
                    html: `<p>您的验证码为：<strong>${code}</strong>，有效期 5 分钟。</p>`
                })
            });
        }

        return Response.json({ success: true, msg: "验证码已发送" });
    } catch (e) {
        return Response.json({ success: false, msg: "发送验证码异常" }, { status: 500 });
    }
}

// 提交注册申请
async function handleRegister(request, env) {
    try {
        const KV = env.USER_DB; 
        if (!KV) return Response.json({ success: false, msg: "未绑定 USER_DB 数据库" }, { status: 500 });

        const { user, pass, email, code, remark } = await request.json();

        if (!user || !pass) return Response.json({ success: false, msg: "用户名或密码不能为空" }, { status: 400 });
        if (!email) return Response.json({ success: false, msg: "邮箱不能为空" }, { status: 400 });
        if (!code) return Response.json({ success: false, msg: "验证码不能为空" }, { status: 400 });
        if (!remark) return Response.json({ success: false, msg: "备注不能为空" }, { status: 400 });

        // 禁止注册管理员级别的敏感保留用户名
        const reservedNames = ['admin', 'administrator', 'root', 'system', 'sys', 'supervisor', 'admin123'];
        if (reservedNames.includes(user.toLowerCase())) {
            return Response.json({ success: false, msg: "该用户名包含系统保留字，不允许注册" }, { status: 400 });
        }

        // 二次校验密码强度
        if (!checkPasswordStrength(pass)) {
            return Response.json({ success: false, msg: "密码强度不足，请重新设置" }, { status: 400 });
        }

        // 校验邮箱验证码正确性
        const savedCode = await KV.get(`code:register:${email}`);
        if (!savedCode || savedCode !== code) {
            return Response.json({ success: false, msg: "验证码错误或已过期" }, { status: 400 });
        }

        // 用户名查重 + 邮箱查重
        const userKey = `user:${user}`;
        const existingUser = await KV.get(userKey);
        if (existingUser) return Response.json({ success: false, msg: "该用户名已被注册或申请中" }, { status: 400 });

        const existingEmail = await KV.get(`email:${email}`);
        if (existingEmail) return Response.json({ success: false, msg: "该邮箱已被注册或申请中" }, { status: 400 });

        const hashedPass = await hashPassword(pass);
        
        // 默认为 pending 状态，写入表单备注
        await KV.put(userKey, JSON.stringify({
            password: hashedPass,
            email: email, // 记录邮箱供后续反查
            role: "member",
            status: "pending", // pending: 待审核, approved: 已批准
            remark: remark || "",
            createdAt: new Date().toISOString()
        }));

        // 建立邮箱到用户名的映射，便于邮箱登录时反查
        await KV.put(
            `email:${email}`,
            user
        );

        // 成功注册后销毁已使用的注册验证码
        await KV.delete(`code:register:${email}`);

        return Response.json({ success: true, msg: "注册申请已提交！请等待管理员审核后再登录" });
    } catch (e) {
        return Response.json({ success: false, msg: "服务器错误" }, { status: 500 });
    }
}

// 用户登录验证
async function handleLogin(request, env) {
    try {
        const KV = env.USER_DB;
        if (!KV) return Response.json({ success: false, msg: "未绑定 USER_DB 数据库" }, { status: 500 });

        const { identifier, pass, code } = await request.json();
        let userKey = "";
        let targetEmail = "";
        let actualUsername = identifier;

        // 判定登录标识是邮箱还是用户名
        if (identifier.includes('@')) {
            targetEmail = identifier;
            const mappedUser = await KV.get(`email:${targetEmail}`);
            if (!mappedUser) return Response.json({ success: false, msg: "该邮箱尚未注册" }, { status: 404 });
            userKey = `user:${mappedUser}`;
            actualUsername = mappedUser; // 抽取真实的用户名用于风控记录
        } else {
            userKey = `user:${identifier}`;
        }

        // 登录风控前置校验：查询 IP 和 Username 是否处于冻结期
        const ip = request.headers.get("cf-connecting-ip") || "unknown";
        const ipFailKey = `login_fail:ip:${ip}`;
        const userFailKey = `login_fail:user:${actualUsername}`;

        const checkLockout = async (key) => {
            const data = await KV.get(key);
            if (!data) return { locked: false, remainingMs: 0 };
            const parsed = JSON.parse(data);
            if (parsed.lockedUntil > Date.now()) {
                return { locked: true, remainingMs: parsed.lockedUntil - Date.now() };
            }
            return { locked: false, remainingMs: 0 };
        };

        const ipLock = await checkLockout(ipFailKey);
        const userLock = await checkLockout(userFailKey);

        if (ipLock.locked || userLock.locked) {
            // 取 IP 和 账号两者中更长的冻结时间来提示用户
            const maxRemainMs = Math.max(ipLock.remainingMs || 0, userLock.remainingMs || 0);
            const remainMins = Math.ceil(maxRemainMs / 60000);
            return Response.json({ success: false, msg: `失败次数过多，出于安全保护，请 ${remainMins} 分钟后再试` }, { status: 429 });
        }

        const recordFail = async (key) => {
            const dataStr = await KV.get(key);
            let count = 1;
            let lockedUntil = 0;
            
            if (dataStr) {
                const parsed = JSON.parse(dataStr);
                if (Date.now() > parsed.lockedUntil) {
                    count = parsed.count + 1; 
                } else {
                    return; // 若处于锁定期则直接返回
                }
            }
            
            if (count >= 5) {
                // 指数级运算：第5次错误封禁 1 分钟，第6次 2 分钟，第7次 4 分钟...
                const banMinutes = Math.pow(2, count - 5);
                lockedUntil = Date.now() + banMinutes * 60 * 1000;
                
                // TTL设定：封禁时间结束后，记录在数据库多保留 30 分钟作为缓冲期
                // 如果30分钟内没有再次输错，之前的错误计数将自动清零失效
                const ttl = (banMinutes * 60) + 1800; 
                await KV.put(key, JSON.stringify({ count, lockedUntil }), { expirationTtl: ttl });
            } else {
                // 尚未达到 5 次连错，在 10 分钟内积累错误次数，超时未达标则自动清零
                await KV.put(key, JSON.stringify({ count, lockedUntil: 0 }), { expirationTtl: 600 });
            }
        };

        // 拉取用户原始数据
        const userDataRaw = await KV.get(userKey);
        if (!userDataRaw) return Response.json({ success: false, msg: "用户不存在" }, { status: 404 });
        
        const userData = JSON.parse(userDataRaw);

        // 验证身份（优先校验验证码，若没传验证码则校验密码）
        if (code) {
            if (!targetEmail) targetEmail = userData.email; 
            const savedCode = await KV.get(`code:login:${targetEmail}`);
            
            // 邮箱验证码错误次数限制
            const codeFailKey = `verify_fail_count:${targetEmail}`;
            if (!savedCode || savedCode !== code) {
                let failCount = parseInt(await KV.get(codeFailKey) || "0") + 1;
                if (failCount >= 5) {
                    await KV.delete(`code:login:${targetEmail}`); // 废弃该验证码
                    await KV.delete(codeFailKey);
                    return Response.json({ success: false, msg: "验证码错误次数超限，当前验证码已失效，请重新发送" }, { status: 401 });
                }
                await KV.put(codeFailKey, failCount.toString(), { expirationTtl: 300 }); // 与验证码存活期一致
                return Response.json({ success: false, msg: `验证码错误或已过期 (剩余尝试次数: ${5 - failCount})` }, { status: 401 });
            }
            await KV.delete(codeFailKey); // 成功通过验证码后，清除错误计数器
            await KV.delete(`code:login:${targetEmail}`); // 立即销毁验证码
        } else if (pass) {
            const hashedPass = await hashPassword(pass);
            if (userData.password !== hashedPass) {
                await Promise.all([recordFail(ipFailKey), recordFail(userFailKey)]);
                return Response.json({ success: false, msg: "密码错误" }, { status: 401 });
            }
        } else {
            return Response.json({ success: false, msg: "必须提供密码或验证码" }, { status: 400 });
        }

        // 拦截未通过审核的用户登录
        if (userData.status === "pending") {
            return Response.json({ success: false, msg: "您的注册申请正在审核中，请等待管理员批准" }, { status: 403 });
        }

        if (userData.status === "rejected") {
            return Response.json({ success: false, msg: "您的注册申请已被管理员驳回" }, { status: 403 });
        }

        // 登录成功时，重置并清除密码错误冻结计数
        await Promise.all([KV.delete(ipFailKey), KV.delete(userFailKey)]);

        // 登录成功：生成 Session 并通过 Set-Cookie 安全下发给浏览器
        const sessionId = crypto.randomUUID();

        // Session 现在只负责记录“你是谁”，不再缓存静态权限
        await KV.put(
            `session:${sessionId}`,
            JSON.stringify({
                user: actualUsername  // 仅保存实际的唯一用户名
            }),
            { expirationTtl: 3600 } 
        );

        return new Response(JSON.stringify({ 
            success: true, 
            msg: "登录成功！", 
            role: userData.role || "member" 
        }), {
            headers: {
                "Content-Type": "application/json",
                "Set-Cookie": `session=${sessionId}; HttpOnly; Secure; SameSite=Strict; Path=/`
            }
        });
    } catch (e) {
        return Response.json({ success: false, msg: "服务器错误" }, { status: 500 });
    }
}

// 管理员拉取待审核名单
async function handleGetPendingUsers(request, env) {
    try {
        // 增加管理员身份权限校验拦截
        if (!(await checkAdmin(request, env))) {
            return Response.json({ success: false, msg: "权限不足，拒绝访问" }, { status: 403 });
        }

        const KV = env.USER_DB;
        const listRes = await KV.list({ prefix: "user:" });
        const pendingList = [];

        for (const key of listRes.keys) {
            const raw = await KV.get(key.name);
            if (raw) {
                const data = JSON.parse(raw);
                if (data.status === "pending") {
                    pendingList.push({
                        user: key.name.replace("user:", ""),
                        email: data.email,
                        remark: data.remark,
                        createdAt: data.createdAt
                    });
                }
            }
        }
        return Response.json({ success: true, list: pendingList });
    } catch (e) {
        return Response.json({ success: false, list: [] });
    }
}

// 管理员通过审核
async function handleApproveUser(request, env) {
    try {
        // 增加管理员身份权限校验拦截
        if (!(await checkAdmin(request, env))) {
            return Response.json({ success: false, msg: "权限不足，拒绝访问" }, { status: 403 });
        }

        const KV = env.USER_DB;
        const { targetUser } = await request.json();
        const userKey = `user:${targetUser}`;
        
        const raw = await KV.get(userKey);
        if (!raw) return Response.json({ success: false, msg: "未找到该用户数据" });

        const userData = JSON.parse(raw);
        userData.status = "approved"; // 更新状态为已通过
        
        await KV.put(userKey, JSON.stringify(userData));
        return Response.json({ success: true, msg: "已批准该用户注册" });
    } catch (e) {
        return Response.json({ success: false, msg: "操作失败" });
    }
}

// 管理员拒绝驳回申请
async function handleRejectUser(request, env) {
    try {
        // 增加管理员身份权限校验拦截
        if (!(await checkAdmin(request, env))) {
            return Response.json({ success: false, msg: "权限不足，拒绝访问" }, { status: 403 });
        }

        const KV = env.USER_DB;
        const { targetUser } = await request.json();
        const userKey = `user:${targetUser}`;
        
        const raw = await KV.get(userKey);
        if (!raw) return Response.json({ success: false, msg: "未找到该用户数据" });

        // 直接从数据库清除该用户的申请记录（或标记为 rejected）
        const userData = JSON.parse(raw);
        await KV.delete(userKey);
        if (userData.email) {
            await KV.delete(`email:${userData.email}`); // 驳回时同步清理绑定的邮箱映射
        }

        return Response.json({ success: true, msg: "已驳回该申请记录" });
    } catch (e) {
        return Response.json({ success: false, msg: "操作失败" }, { status: 500 });
    }
}
// 主路由入口：统一分发 GET（页面）与 POST（接口）请求
export async function onRequest(context) {
    const { request, env } = context;
    const url = new URL(request.url);
    const pathname = url.pathname;

    // 📌 POST 请求处理：注册与登录 API
    if (request.method === "POST") {
        if (pathname.endsWith("/api/register")) {
            return handleRegister(request, env);
        }
        if (pathname.endsWith("/api/login")) {
            return handleLogin(request, env);
        }
    }

    // 📌 GET 请求处理：渲染登录/注册 UI 界面
    if (request.method === "GET") {
        return renderAuthPage();
    }

    return new Response("Method Not Allowed", { status: 405 });
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
          .tab:hover { color:#2e7d32; }

          .form-group { margin-bottom:16px; text-align:left; }
          label { display:block; margin-bottom:6px; font-size:14px; color:#555; }
          
          input { 
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
          input:focus { border-color:#2e7d32; }

          button { 
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
              <label>用户名</label>
              <input type="text" id="login-user" placeholder="请输入用户名">
          </div>
          <div class="form-group">
              <label>密码</label>
              <input type="password" id="login-pass" placeholder="请输入密码">
          </div>
          <button id="btn-login" onclick="handleAuth('login')">立即登录</button>
      </div>

      <!-- 注册表单 -->
      <div id="form-reg" class="toggle-form">
          <div class="form-group">
              <label>设置用户名</label>
              <input type="text" id="reg-user" placeholder="整个响当当的大名吧">
          </div>
          <div class="form-group">
              <label>设置密码</label>
              <input type="password" id="reg-pass" placeholder="需要同时包含大小写字母、数字和特殊字符">
          </div>
          <button id="btn-reg" onclick="handleAuth('register')">提交注册</button>
      </div>

      <div id="info-box"></div>
  </div>

  <script>
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
            const hasUpper = /[A-Z]/.test(pass);
            const hasLower = /[a-z]/.test(pass);
            const hasNumber = /[0-9]/.test(pass);
            const hasSpecial = /[^A-Za-z0-9]/.test(pass);
            return hasUpper && hasLower && hasNumber && hasSpecial;
        }

      function switchTab(type) {
          document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
          document.querySelectorAll('.toggle-form').forEach(f => f.classList.remove('active'));
          if(type === 'login') {
              document.getElementById('tab-login').classList.add('active');
              document.getElementById('form-login').classList.add('active');
          } else {
              document.getElementById('tab-reg').classList.add('active');
              document.getElementById('form-reg').classList.add('active');
          }
          document.getElementById('info-box').innerText = "";
      }

      // 真实请求 KV 后端 API
      async function handleAuth(action) {
          const infoBox = document.getElementById('info-box');
          const user = document.getElementById(action === 'login' ? 'login-user' : 'reg-user').value.trim();
          const pass = document.getElementById(action === 'login' ? 'login-pass' : 'reg-pass').value.trim();
          const btn = document.getElementById(action === 'login' ? 'btn-login' : 'btn-reg');

          if(!user || !pass) { 
              infoBox.style.color = "red"; 
              infoBox.innerText = "请完整填写用户名和密码"; 
              return; 
          }

          // 注册时触发密码强度判定
          if (action === 'register' && !isStrongPassword(pass)) {
              showToast("您的密码复杂度不够，请重新设置");
              return;
          }
          
          btn.disabled = true;
          infoBox.style.color = "#666"; 
          infoBox.innerText = action === 'login' ? "正在验证身份..." : "正在创建账号...";

          try {
              // 使用相对路径请求当前模块下的 API
              const res = await fetch(\`/api/\${action}\`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ user, pass })
              });
              const data = await res.json();

              if(res.ok && data.success) {
                  infoBox.style.color = "green";
                  infoBox.innerText = data.msg;
                  
                  if(action === 'register') {
                      setTimeout(() => {
                          switchTab('login');
                          document.getElementById('login-user').value = user;
                          btn.disabled = false;
                      }, 1200);
                  } else {
                      // 登录成功后可根据需要自行调整成功后的跳转逻辑
                      setTimeout(() => { alert("登录成功！"); }, 500);
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

// 注册处理逻辑（写入 KV）
async function handleRegister(request, env) {
    try {
        const KV = env.USER_DB;
        if (!KV) {
            return Response.json({ success: false, msg: "未绑定 USER_KV 数据库" }, { status: 500 });
        }

        const { user, pass } = await request.json();
        if (!user || !pass) {
            return Response.json({ success: false, msg: "用户名或密码不能为空" }, { status: 400 });
        }

        // 服务端二次校验密码强度，防止越过前端提交
        if (!checkPasswordStrength(pass)) {
            return Response.json({ success: false, msg: "您的密码复杂度不够，请重新设置" }, { status: 400 });
        }

        const userKey = `user:${user}`;
        
        // 查询数据库判断用户是否存在
        const existingUser = await KV.get(userKey);
        if (existingUser) {
            return Response.json({ success: false, msg: "该用户名已被注册" }, { status: 400 });
        }

        // 哈希密码并持久化存入 KV
        const hashedPass = await hashPassword(pass);
        await KV.put(userKey, JSON.stringify({
            password: hashedPass,
            createdAt: new Date().toISOString()
        }));

        return Response.json({ success: true, msg: "注册成功！即将切换至登录" });
    } catch (e) {
        return Response.json({ success: false, msg: "服务器错误" }, { status: 500 });
    }
}

// 登录处理逻辑（读取 KV 并比对）
async function handleLogin(request, env) {
    try {
        const KV = env.USER_DB;
        if (!KV) {
            return Response.json({ success: false, msg: "未绑定 USER_KV 数据库" }, { status: 500 });
        }

        const { user, pass } = await request.json();
        if (!user || !pass) {
            return Response.json({ success: false, msg: "用户名或密码不能为空" }, { status: 400 });
        }

        const userKey = `user:${user}`;
        const userDataRaw = await KV.get(userKey);

        if (!userDataRaw) {
            return Response.json({ success: false, msg: "用户名或密码错误" }, { status: 401 });
        }

        const userData = JSON.parse(userDataRaw);
        const hashedPass = await hashPassword(pass);

        if (userData.password !== hashedPass) {
            return Response.json({ success: false, msg: "用户名或密码错误" }, { status: 401 });
        }

        return Response.json({ success: true, msg: "验证通过，登录成功！" });
    } catch (e) {
        return Response.json({ success: false, msg: "服务器错误" }, { status: 500 });
    }
}
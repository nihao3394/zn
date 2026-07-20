export async function onRequestGet(context) {
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

          .toggle-form { display:none; }
          .toggle-form.active { display:block; }
          #info-box { margin-top:15px; text-align:center; font-size:14px; min-height:20px; }
      </style>
  </head>
  <body>
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
          <button onclick="handleAuth('login')">立即登录</button>
      </div>

      <!-- 注册表单 -->
      <div id="form-reg" class="toggle-form">
          <div class="form-group">
              <label>设置用户名</label>
              <input type="text" id="reg-user" placeholder="字母或数字组合">
          </div>
          <div class="form-group">
              <label>设置密码</label>
              <input type="password" id="reg-pass" placeholder="强密码格式">
          </div>
          <button onclick="handleAuth('register')">提交注册</button>
      </div>

      <div id="info-box"></div>
  </div>

  <script>
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

      async function handleAuth(action) {
          const infoBox = document.getElementById('info-box');
          const user = document.getElementById(action === 'login' ? 'login-user' : 'reg-user').value;
          const pass = document.getElementById(action === 'login' ? 'login-pass' : 'reg-pass').value;

          if(!user || !pass) { infoBox.style.color = "red"; infoBox.innerText = "请完整填写各项内容"; return; }
          infoBox.style.color = "#666"; infoBox.innerText = "正在处理...";

          console.log(\`发起 \${action} 请求: \`, { user, pass });
          
          setTimeout(() => {
              infoBox.style.color = "green";
              infoBox.innerText = action === 'login' ? "登录成功！" : "注册成功！";
          }, 800);
      }
  </script>
  </body>
  </html>
  `;
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}
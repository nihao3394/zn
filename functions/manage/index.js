// 注册与登录界面
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
              background:#131c15; 
              display:flex; 
              align-items:center; 
              justify-content:center; 
              color:#e0e0e0; 
              overflow:hidden;
              position:relative;
          }

          /*左上角深绿圆形几何体 */
          body::before { 
              content:""; 
              position:absolute; 
              width:420px; 
              height:420px; 
              background:#1e3b25; 
              border-radius:50%; 
              top:-130px; 
              left:-130px; 
              opacity:.75; 
          }

          /*右下角旋转圆角几何体 */
          body::after { 
              content:""; 
              position:absolute; 
              width:380px; 
              height:380px; 
              background:#1e3b25; 
              border-radius:28%; 
              bottom:-110px; 
              right:-110px; 
              transform:rotate(30deg); 
              opacity:.75; 
          }

          /*居中卡片容器（提升 z-index 浮于几何体之上） */
          .container { 
              position:relative; 
              width:90%; 
              max-width:400px; 
              background:#1a1e1c; 
              padding:32px 30px; 
              border-radius:12px; 
              box-shadow:0 8px 25px rgba(0,0,0,0.4); 
              z-index:10; 
          }

          .tabs { display:flex; margin-bottom:22px; border-bottom:1px solid #2e3832; }
          .tab { flex:1; text-align:center; padding:10px; cursor:pointer; font-weight:bold; color:#888; transition:.2s; }
          .tab.active { color:#4caf50; border-bottom:2px solid #4caf50; }
          .tab:hover { color:#a5d6a7; }

          .form-group { margin-bottom:16px; }
          label { display:block; margin-bottom:6px; font-size:14px; color:#aaa; }
          
          input { 
              width:100%; 
              padding:12px 14px; 
              background:#262b29; 
              border:1px solid #38423c; 
              border-radius:6px; 
              outline:none; 
              font-size:14px; 
              color:#fff; 
              transition:.2s;
          }
          input:focus { border-color:#4caf50; background:#2c3330; }

          button { 
              width:100%; 
              padding:12px; 
              background:#2e7d32; 
              color:white; 
              border:none; 
              border-radius:6px; 
              cursor:pointer; 
              font-size:16px; 
              margin-top:10px; 
              font-weight:500;
              transition:.3s; 
          }
          button:hover { background:#1b5e20; }

          .toggle-form { display:none; }
          .toggle-form.active { display:block; }
          #info-box { margin-top:14px; text-align:center; font-size:14px; min-height:20px; }
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

          if(!user || !pass) { infoBox.style.color="#ff6b6b"; infoBox.innerText="请完整填写各项内容"; return; }
          infoBox.style.color="#aaa"; infoBox.innerText="正在处理...";

          console.log(\`发起 \${action} 请求: \`, { user, pass });
          
          setTimeout(() => {
              infoBox.style.color = "#81c784";
              infoBox.innerText = action === 'login' ? "登录成功！" : "注册成功！";
          }, 800);
      }
  </script>
  </body>
  </html>
  `;
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}
export async function onRequest(context) {
    const { request, next, env } = context;
    const url = new URL(request.url);
    const pathname = url.pathname;

    const SECRET_PATH = env.SECRET_PATH;
    if (request.method==="GET" && SECRET_PATH && (pathname === `/${SECRET_PATH}` || pathname === `/${SECRET_PATH}/`)) {
        return new Response(getGateHtml(), {
            headers: { "Content-Type": "text/html; charset=utf-8" }
        });
    }

    // 校验 gate_pass Cookie 与 Session
    if (pathname === "/manage" || pathname.startsWith("/manage/")) {
        const cookieHeader = request.headers.get("Cookie") || "";
        const match = cookieHeader.match(/gate_pass=([^;]+)/);

        // 没有 Cookie，直接伪装成 404
        if (!match) {
            return new Response("404 Not Found", { status: 404 });
        }

        const session = match[1];
        const KV = env.RATE_LIMIT_KV;

        // KV 未绑定或 Session 无效，同样报 404
        if (!KV) {
        return new Response("404 Not Found", { status: 404 });
        }

        const exists = await KV.get(`session:${session}`);
        if (!exists) {
            return new Response("404 Not Found", { status: 404 });
        }

        // 校验通过，放行进入 /manage/ 面板
        return next();
    } 
    
    return next();
}

function getGateHtml() {
    return `
    <!DOCTYPE html>
    <html lang="zh-CN">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width,initial-scale=1.0">
        <title>Knowledge Gateway</title>
        <style>
            * { margin:0; padding:0; box-sizing:border-box; }
            body { height:100vh; font-family:"Helvetica Neue",Arial,sans-serif; background:#f1f8f1; display:flex; align-items:center; justify-content:center; color:#333; overflow:hidden;}
            body::before { content:""; position:absolute; width:400px; height:400px; background:#a5d6a7; border-radius:50%; top:-120px; left:-120px; opacity:.35; }
            body::after { content:""; position:absolute; width:350px; height:350px; background:#81c784; border-radius:20%; bottom:-100px; right:-100px; transform:rotate(30deg); opacity:.25; }
            .container { position:relative; width:90%; max-width:420px; z-index:10; }
            .card { background:white; padding:40px; border-radius:12px; box-shadow:0 8px 20px rgba(0,0,0,.12); text-align:center; }
            .logo { width:70px; height:70px; margin:0 auto 20px; background:#2e7d32; border-radius:50%; display:flex; align-items:center; justify-content:center; color:white; font-size:30px; }
            h1 { color:#2e7d32; font-size:28px; margin-bottom:10px; }
            input { width:100%; padding:14px; border:1px solid #ccc; border-radius:8px; font-size:16px; outline:none; }
            input:focus { border-color:#2e7d32; }
            button { margin-top:20px; width:100%; padding:14px; border:none; border-radius:8px; background:#2e7d32; color:white; font-size:16px; cursor:pointer; transition:.3s; }
            button:hover { background:#1b5e20; }
            .footer { margin-top:25px; font-size:12px; color:#777; }
            #msg-box { margin-top: 15px; font-size: 14px; min-height: 20px; }
        </style>
    </head>
    <body>
    <div class="container">
        <div class="card">
            <div class="logo">◇</div>
            <h1>Knowledge Gateway</h1>
            <div style="margin-bottom:20px;"></div>
            <input type="password" id="token-input" placeholder="请输入口令" onkeydown="if(event.keyCode==13) verifyToken()">
            <button id="gate-btn" onclick="verifyToken()">验证口令</button>
            <div id="msg-box"></div>
            <div class="footer">Authorized Members Only</div>
        </div>
    </div>

    <script>
        async function verifyToken() {
            const token = document.getElementById('token-input').value;
            const msgBox = document.getElementById('msg-box');
            const btn = document.getElementById('gate-btn');

            if(!token) { msgBox.style.color = "red"; msgBox.innerText = "请输入口令"; return; }
            btn.disabled = true; msgBox.style.color = "#666"; msgBox.innerText = "正在验证口令...";

            try {
                const res = await fetch('/api/verify-token', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ token })
                });
                const data = await res.json();

                if(res.ok && data.success) {
                    msgBox.style.color = "green"; msgBox.innerText = data.msg;
                    setTimeout(() => { window.location.href = '/manage/'; }, 1000);
                } else {
                    msgBox.style.color = "red"; msgBox.innerText = data.msg || "密钥错误"; btn.disabled = false;
                }
            } catch(e) {
                msgBox.style.color = "red"; msgBox.innerText = "网络异常"; btn.disabled = false;
            }
        }
    </script>
    </body>
    </html>
    `;
}
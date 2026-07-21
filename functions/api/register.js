// 后端注册接口逻辑处理
// Cloudflare Pages Functions 标准入口
export async function onRequestPost(context) {

    const { request, env } = context;

    return handleRegister(request, env);

}

export async function handleRegister(request, env) {
    try {
        const KV = env.USER_DB; 
        if (!KV) return Response.json({ success: false, msg: "未绑定 USER_DB 数据库" }, { status: 500 });

        const { user, pass, email, code, remark } = await request.json();

        if (!user || !pass) return Response.json({ success: false, msg: "用户名或密码不能为空" }, { status: 400 });
        if (!email) return Response.json({ success: false, msg: "邮箱不能为空" }, { status: 400 });
        if (!code) return Response.json({ success: false, msg: "验证码不能为空" }, { status: 400 });
        if (!remark) return Response.json({ success: false, msg: "备注不能为空" }, { status: 400 });

        // 保留用户名检查
        const reservedNames = ['admin', 'administrator', 'root', 'system', 'sys', 'supervisor', 'admin123'];
        if (reservedNames.includes(user.toLowerCase())) {
            return Response.json({ success: false, msg: "该用户名包含系统保留字，不允许注册" }, { status: 400 });
        }

        // 密码强度校验辅助函数
        function checkPasswordStrength(p) {
            return /[A-Z]/.test(p) && /[a-z]/.test(p) && /[0-9]/.test(p) && /[^A-Za-z0-9]/.test(p);
        }

        if (!checkPasswordStrength(pass)) {
            return Response.json({ success: false, msg: "密码强度不足，需同时包含大小写字母、数字及特殊符号" }, { status: 400 });
        }

        // 校验验证码
        const savedCode = await KV.get(`code:register:${email}`);
        if (!savedCode || savedCode !== code) {
            return Response.json({ success: false, msg: "验证码错误或已过期" }, { status: 400 });
        }

        // 检查用户名是否已存在
        const userKey = `user:${user}`;
        const existingUser = await KV.get(userKey);
        if (existingUser) return Response.json({ success: false, msg: "该用户名已被注册或申请中" }, { status: 400 });

        // 用户名格式校验：支持中文、英文、数字、下划线，长度 2-20
        if(!/^[\p{L}\p{N}_]{2,20}$/u.test(user)){  // \p{L}	所有语言文字(letter)，包含中文、英文、日文等；  \p{N}	数字
            return Response.json(
                {
                    success:false,
                    msg:"用户名只能包含文字、数字和下划线，长度2-20位"
                },
                {status:400}
            );
        }

        // 检查邮箱是否已绑定
        const existingEmail = await KV.get(`email:${email}`);
        if (existingEmail) return Response.json({ success: false, msg: "该邮箱已被注册或申请中" }, { status: 400 });

        // 密码哈希加密
        async function hashPassword(password) {
            const encoder = new TextEncoder();
            const data = encoder.encode(password);
            const hashBuffer = await crypto.subtle.digest('SHA-256', data);
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        }

        const hashedPass = await hashPassword(pass);
        
        // 写入数据库（初始状态为 pending 待审核）
        await KV.put(userKey, JSON.stringify({
            password: hashedPass,
            email: email, 
            role: "member",
            status: "pending", 
            remark: remark || "",
            createdAt: new Date().toISOString()
        }));

        // 邮箱映射
        await KV.put(`email:${email}`, user);

        // 销毁已使用的验证码
        await KV.delete(`code:register:${email}`);

        return Response.json({ success: true, msg: "注册申请已提交！请等待管理员审核后再登录" });
    } catch (e) {
        console.error("REGISTER ERROR:", e);
        return Response.json({ success:false, msg:e.message },{ status:500 });
    }
}
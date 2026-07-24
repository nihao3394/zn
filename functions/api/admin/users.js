/*
用途：GET 获取全体成员列表 / PUT 修改用户角色
KV：env.USER_DB
鉴权：checkAdmin（复用 index.js 逻辑或从 middleware 注入）
*/

/*
// GET /api/admin/users  → 返回所有 user:* 记录（脱敏：不含密码）
// PUT /api/admin/users → { targetUser, role } → 更新 role 字段
*/

export async function onRequest(context) {
    const { request, env } = context;
    if (request.method === "GET") return handleGetUsers(request, env);
    if (request.method === "PUT") return handleUpdateRole(request, env);
    return new Response("Method Not Allowed", { status: 405 });
}

// ——— 管理员鉴权（内联） ———
async function checkAdmin(request, env) {
    const cookie = request.headers.get("Cookie") || "";
    const match = cookie.match(/session=([^;]+)/);
    if (!match) return false;
    const KV = env.USER_DB;
    if (!KV) return false;
    const sessRaw = await KV.get(`session:${match[1]}`);
    if (!sessRaw) return false;
    try {
        const sess = JSON.parse(sessRaw);
        const userRaw = await KV.get(`user:${sess.user}`);
        if (!userRaw) return false;
        const user = JSON.parse(userRaw);
        return user.role === "admin";
    } catch (e) {
        return false;
    }
}

// ——— GET：拉取全体成员列表 ———
async function handleGetUsers(request, env) {
    try {
        // 全体成员列表：所有已登录用户可查看
        const cookie = request.headers.get("Cookie") || "";
        const match = cookie.match(/session=([^;]+)/);
        if (!match) {
            return Response.json({ success: false, msg: "未登录" }, { status: 401 });
        }
        const sessRaw = await env.USER_DB.get(`session:${match[1]}`);
        if (!sessRaw) {
            return Response.json({ success: false, msg: "登录已过期" }, { status: 401 });
        }

        const KV = env.USER_DB;
        const listRes = await KV.list({ prefix: "user:" });
        const memberList = [];

        for (const key of listRes.keys) {
            const raw = await KV.get(key.name);
            if (raw) {
                const data = JSON.parse(raw);
                if (data.status === "approved") {
                    memberList.push({
                        username: key.name.replace("user:", ""),
                        role: data.role || "member"
                    });
                }
            }
        }
        return Response.json({ success: true, list: memberList });
    } catch (e) {
        return Response.json({ success: false, list: [], msg: "获取成员列表异常" }, { status: 500 });
    }
}

// ——— PUT：修改用户角色 ———
async function handleUpdateRole(request, env) {
    try {
        if (!(await checkAdmin(request, env))) {
            return Response.json({ success: false, msg: "权限不足" }, { status: 403 });
        }

        const { targetUser, role } = await request.json();
        if (!targetUser || !role) {
            return Response.json({ success: false, msg: "参数缺失" }, { status: 400 });
        }

        // 元用户保护：ROOT_USER 的身份不可被任何人修改
        if (env.ROOT_USER && targetUser === env.ROOT_USER) {
            return Response.json({ success: false, msg: "元用户身份不可修改" }, { status: 403 });
        }

        const validRoles = ["admin", "keyword_reviewer", "article_reviewer", "member"];
        if (!validRoles.includes(role)) {
            return Response.json({ success: false, msg: "无效的角色类型" }, { status: 400 });
        }

        const KV = env.USER_DB;
        const userKey = `user:${targetUser}`;
        const raw = await KV.get(userKey);
        if (!raw) {
            return Response.json({ success: false, msg: "用户不存在" }, { status: 404 });
        }

        const userData = JSON.parse(raw);
        userData.role = role;
        await KV.put(userKey, JSON.stringify(userData));
        await KV.put("system:mutation_version", String(Date.now())); // 更新系统版本号

        return Response.json({ success: true, msg: `已将 ${targetUser} 的身份更新为 ${role}` });
    } catch (e) {
        return Response.json({ success: false, msg: "操作失败" }, { status: 500 });
    }
}
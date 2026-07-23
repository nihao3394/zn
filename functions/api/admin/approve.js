// POST /api/admin/approve
export async function onRequestPost(context) {
    const { request, env } = context;

    try {
        if (!(await checkAdmin(request, env))) {
            return Response.json({ success: false, msg: "权限不足，拒绝访问" }, { status: 403 });
        }

        const KV = env.USER_DB;
        const { targetUser } = await request.json();
        if (!targetUser) {
            return Response.json({ success: false, msg: "目标用户参数缺失" }, { status: 400 });
        }

        const userKey = `user:${targetUser}`;
        const raw = await KV.get(userKey);
        if (!raw) return Response.json({ success: false, msg: "未找到该用户数据" }, { status: 404 });

        const userData = JSON.parse(raw);
        userData.status = "approved";
        await KV.put(userKey, JSON.stringify(userData));
        await KV.put("system:mutation_version", String(Date.now()));

        return Response.json({ success: true, msg: "已批准该用户注册" });
    } catch (e) {
        return Response.json({ success: false, msg: "操作失败" }, { status: 500 });
    }
}

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
    } catch (e) { return false; }
}
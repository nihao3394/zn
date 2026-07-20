// 管理员拉取待审核名单
async function handleGetPendingUsers(request, env) {
    try {
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
                        email: data.email || "",
                        remark: data.remark || "",
                        createdAt: data.createdAt || new Date().toISOString()
                    });
                }
            }
        }
        return Response.json({ success: true, list: pendingList });
    } catch (e) {
        return Response.json({ success: false, list: [], msg: "获取待审核列表异常" }, { status: 500 });
    }
}

// 管理员通过审核
async function handleApproveUser(request, env) {
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
        userData.status = "approved"; // 更新状态为已批准
        
        await KV.put(userKey, JSON.stringify(userData));
        return Response.json({ success: true, msg: "已批准该用户注册" });
    } catch (e) {
        return Response.json({ success: false, msg: "操作失败" }, { status: 500 });
    }
}

// 管理员拒绝驳回申请
async function handleRejectUser(request, env) {
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
        // 直接从 KV 中清理该用户的注册申请记录及邮箱映射
        await KV.delete(userKey);
        if (userData.email) {
            await KV.delete(`email:${userData.email}`);
        }

        return Response.json({ success: true, msg: "已驳回该申请记录" });
    } catch (e) {
        return Response.json({ success: false, msg: "操作失败" }, { status: 500 });
    }
}
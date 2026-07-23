// GET /api/wiki/approved → 返回已通过词条列表（所有身份可见）

export async function onRequestGet(context) {
    const { request, env } = context;

    try {
        // ——— 只需登录即可查看（不限身份） ———
        const cookie = request.headers.get("Cookie") || "";
        const match = cookie.match(/session=([^;]+)/);
        if (!match) {
            return Response.json({ success: false, msg: "未登录" }, { status: 401 });
        }

        const userKV = env.USER_DB;
        if (!userKV) {
            return Response.json({ success: false, msg: "数据库未绑定" }, { status: 500 });
        }

        const sessRaw = await userKV.get(`session:${match[1]}`);
        if (!sessRaw) {
            return Response.json({ success: false, msg: "登录已过期" }, { status: 401 });
        }

        const sess = JSON.parse(sessRaw);
        const userRaw = await userKV.get(`user:${sess.user}`);
        if (!userRaw) {
            return Response.json({ success: false, msg: "用户不存在" }, { status: 404 });
        }
        const user = JSON.parse(userRaw);
        if (user.status !== "approved") {
            return Response.json({ success: false, msg: "账号未通过审核" }, { status: 403 });
        }

        // ——— 读取聚合列表 ———
        const wikiKV = env.WIKI_DB;
        if (!wikiKV) {
            return Response.json({ success: false, msg: "WIKI_DB 数据库未绑定" }, { status: 500 });
        }

        const listRaw = await wikiKV.get("keyword:approved:list");
        const approvedList = listRaw ? JSON.parse(listRaw) : [];

        return Response.json({ success: true, list: approvedList });
    } catch (e) {
        return Response.json({ success: false, list: [], msg: "获取过审词条异常" }, { status: 500 });
    }
}
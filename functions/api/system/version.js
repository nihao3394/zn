// GET /api/system/version → 返回当前数据版本号（单次 KV 读）

export async function onRequestGet(context) {
    const { request, env } = context;

    try {
        const KV = env.USER_DB;
        if (!KV) {
            return Response.json({ version: 0 });
        }
        const ver = await KV.get("system:mutation_version");
        return Response.json({ version: parseInt(ver || "0") });
    } catch (e) {
        return Response.json({ version: 0 });
    }
}
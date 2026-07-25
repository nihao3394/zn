export async function onRequestGet(context) {
    const { env } = context;
    try {
        const chatKV = env.CHATTING_DB;
        if (!chatKV) return Response.json({ success: false, list: [] });
        const listRaw = await chatKV.get("chat:messages");
        return Response.json({ success: true, list: listRaw ? JSON.parse(listRaw) : [] });
    } catch (e) {
        return Response.json({ success: false, list: [] });
    }
}
// POST /api/upload
// 接收图片上传，存入 R2，返回图片 URL

export async function onRequestPost(context) {
    const { request, env } = context;

    try {
        // 1. 鉴权：检查 session
        const cookie = request.headers.get("Cookie") || "";
        const match = cookie.match(/session=([^;]+)/);
        if (!match) {
            return Response.json({ success: false, msg: "未登录" }, { status: 401 });
        }

        const userKV = env.USER_DB;
        if (!userKV) {
            return Response.json({ success: false, msg: "USER_DB 未绑定" }, { status: 500 });
        }

        const sessRaw = await userKV.get(`session:${match[1]}`);
        if (!sessRaw) {
            return Response.json({ success: false, msg: "登录已过期" }, { status: 401 });
        }

        try {
            JSON.parse(sessRaw);
        } catch (e) {
            return Response.json({ success: false, msg: "会话无效" }, { status: 401 });
        }

        // 2. 检查 R2 绑定
        const r2 = env.IMAGE_BUCKET;
        if (!r2) {
            return Response.json({ success: false, msg: "R2 未绑定" }, { status: 500 });
        }

        // 3. 解析 multipart form data（Vditor 默认字段名是 "file[]"）
        const formData = await request.formData();
        const files = formData.getAll("file[]");
        const uploadFile = files.length > 0 ? files[0] : formData.get("file");

        if (!uploadFile || !(uploadFile instanceof File)) {
            return Response.json({ success: false, msg: "未收到图片文件" }, { status: 400 });
        }

        // 4. 校验文件类型和大小
        const allowedTypes = ["image/png", "image/jpeg", "image/gif", "image/webp", "image/svg+xml", "image/bmp"];
        if (!allowedTypes.includes(uploadFile.type)) {
            return Response.json({ success: false, msg: "不支持的图片格式，仅支持 PNG/JPEG/GIF/WebP/SVG/BMP" }, { status: 400 });
        }

        const MAX_SIZE = 10 * 1024 * 1024; // 10 MB
        if (uploadFile.size > MAX_SIZE) {
            return Response.json({ success: false, msg: "图片大小不能超过 10MB" }, { status: 400 });
        }

        // 5. 生成唯一文件名
        const ext = uploadFile.name.split(".").pop().toLowerCase() || "png";
        const safeExt = ["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp"].includes(ext) ? ext : "png";
        const timestamp = Date.now();
        const random = crypto.randomUUID().split("-")[0];
        const key = `${timestamp}-${random}.${safeExt}`;

        // 6. 存入 R2
        await r2.put(key, uploadFile.stream(), {
            httpMetadata: {
                contentType: uploadFile.type,
            },
        });

        // 7. 构造公开 URL
        // 优先使用自定义域名（在 Cloudflare Dashboard → Settings → Variables 中设置 IMAGE_BASE_URL）
        // 未设置时回退到 /images/ 路由（由 functions/images/[[path]].js 代理）
        const baseUrl = env.IMAGE_BASE_URL
            ? env.IMAGE_BASE_URL.replace(/\/+$/, "")
            : "/images";
        const publicUrl = `${baseUrl}/${key}`;

        return Response.json({
            success: true,
            imageUrl: publicUrl,
            key: key,
        });
    } catch (e) {
        return Response.json(
            { success: false, msg: "上传失败: " + (e.message || e) },
            { status: 500 }
        );
    }
}

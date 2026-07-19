// 以下为worker部署代码
export default {
  async fetch(request, env, ctx) {
    // 获取用户访问地址
    const url = new URL(request.url);

    // 获取路径
    const path = url.pathname;

    // 首页测试
    if(path==="/"){
      return new Response("Worker is running");
    } 

    const allowPaths=[
      "/wiki",
      "/wiki/",
      "/w",
      "/w/",
      "/static/",
      "/upload/",
      "/wikidata/"
    ];

    let allowed=false;

    for(const p of allowPaths){
      if(path.startsWith(p)){
        allowed=true;
        break;
      }
    }

    if(!allowed){
      return new Response("Forbidden",{status:403});
    }

    // 动态分发目标域名 (修复图片和 Wikidata 路由)
    let targetHost = "https://zh.wikipedia.org";
    let targetPath = path;

    if (path.startsWith("/upload/")) {
      targetHost = "https://upload.wikimedia.org";
      targetPath = path.replace("/upload", ""); // 移除前缀，还原真实路径
    } else if (path.startsWith("/wikidata/")) {
      targetHost = "https://www.wikidata.org";
      targetPath = path.replace("/wikidata", ""); // 移除前缀，还原真实路径
    }

    // 拼接最终的 URL，必须带上 url.search
    const targetUrl = targetHost + targetPath + url.search;

    // 清洗请求头（伪装成原站内部请求，防止被维基百科防盗链拦截）
    const newHeaders = new Headers(request.headers);
    newHeaders.set("Host", new URL(targetHost).host); 

    // 修正防盗链 Referer 和 Origin
    if (newHeaders.has("Referer")) {
      try {
        const refUrl = new URL(newHeaders.get("Referer"));
        refUrl.host = new URL(targetHost).host;
        newHeaders.set("Referer", refUrl.toString());
      } catch {
        newHeaders.delete("Referer");
      }
    }
    if (newHeaders.has("Origin")) {
      newHeaders.set("Origin", targetHost);
    }

    // 移除可能导致浏览器跨域拒绝的安全验证头
    newHeaders.delete("Sec-Fetch-Site");
    newHeaders.delete("Sec-Fetch-Mode");
    newHeaders.delete("Sec-Fetch-Dest");

    if (!newHeaders.has("User-Agent")) {
      newHeaders.set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");
    }

    // 请求目标网站
    const response = await fetch(targetUrl, {
      method: request.method,
      headers: newHeaders,
      body: request.method !== "GET" && request.method !== "HEAD" ? request.body : undefined
    });

    // 清洗响应头（必须移除 CSP 限制，否则浏览器拒绝执行反代域名的脚本和样式）
    const modifiedHeaders = new Headers(response.headers);
    modifiedHeaders.delete("Content-Security-Policy");
    modifiedHeaders.delete("Content-Security-Policy-Report-Only");
    modifiedHeaders.delete("X-Frame-Options");

    const contentType = response.headers.get("content-type") || "";

    // 重写 HTML 及 JS 和 CSS
    const isTextContent = contentType.includes("text/html") || 
                          contentType.includes("application/javascript") || 
                          contentType.includes("text/javascript") || 
                          contentType.includes("x-javascript") || 
                          contentType.includes("text/css");

    if (isTextContent) {
      let text = await response.text();

      // 全局替换官方域名，强制浏览器后续的所有加载请求全部走 Worker
      text = text.replaceAll("https://zh.wikipedia.org", "");
      text = text.replaceAll("//zh.wikipedia.org", "");
      text = text.replaceAll("//upload.wikimedia.org", "/upload");
      text = text.replaceAll("https://upload.wikimedia.org", "/upload");
      text = text.replaceAll("//www.wikidata.org", "/wikidata");

      // 确保返回清洗后的响应头
      return new Response(text, {
        status: response.status,
        statusText: response.statusText,
        headers: modifiedHeaders
      });
    }

    // 图片、字体等二进制资源，直接带上新响应头返回
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: modifiedHeaders
    });
  }
};
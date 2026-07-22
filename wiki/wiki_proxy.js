// 以下为worker部署代码
export default {
  async fetch(request, env, ctx) {
    // 获取用户访问地址
    const url = new URL(request.url);

    // 获取路径
    const path = url.pathname;

    // 智能路径放行
    const parts = path.split('/').filter(Boolean);
    const firstPart = parts[0]; // 提取第一级目录 (如 "zh", "en", "portal", "w")

    // 动态分发目标域名 (修复图片和 Wikidata 路由)
    let targetHost = "https://www.wikipedia.org";
    let targetPath = path;

    // 正则匹配路径开头的语言代码，例如 /en/wiki/ 其中的 en
    const langMatch = path.match(/^\/([a-z]{2,3})(-[a-z]+)?(\/.*)?$/);

    if (firstPart === "upload") {
      targetHost = "https://upload.wikimedia.org";
      targetPath = path.replace("/upload", "");
    } else if (firstPart === "wikidata") {
      targetHost = "https://www.wikidata.org";
      targetPath = path.replace("/wikidata", "");
    } else if (firstPart === "portal" || firstPart === "static" || firstPart === "w") {
      // 公共静态资源目录：优先通过 Referer 识别当前页面所属的语种站
      targetHost = "https://www.wikipedia.org";
      
      const referer = request.headers.get("Referer");
      if (referer) {
        try {
          const refUrl = new URL(referer);
          if (refUrl.host === url.host) {
            const refParts = refUrl.pathname.split('/').filter(Boolean);
            const refFirstPart = refParts[0];
            // 如果来源页带有语言前缀，资源请求同步跟随该语言域名
            if (refFirstPart && !['w', 'static', 'upload', 'wikidata', 'portal', 'wiki'].includes(refFirstPart) && refFirstPart.length <= 8) {
              targetHost = `https://${refFirstPart}.wikipedia.org`;
            }
          }
        } catch (e) {}
      }
    } else if (firstPart && !['wiki'].includes(firstPart) && firstPart.length <= 8) {
      // 显式声明的语言代码路径
      targetHost = `https://${firstPart}.wikipedia.org`;
      targetPath = path.substring(firstPart.length + 1) || "/";
    } else {
      // 隐式相对路径 (如点击了无前缀的 /wiki/Article)
      const referer = request.headers.get("Referer");
      if (referer) {
        try {
          const refUrl = new URL(referer);
          if (refUrl.host === url.host) {
            const refParts = refUrl.pathname.split('/').filter(Boolean);
            const refFirstPart = refParts[0];
            if (refFirstPart && !['w', 'static', 'upload', 'wikidata', 'portal', 'wiki'].includes(refFirstPart) && refFirstPart.length <= 8) {
              targetHost = `https://${refFirstPart}.wikipedia.org`;
            }
          }
        } catch (e) {}
      }
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

    // 如果原站发出重定向，将其重定向地址也重写为代理路径，防止逃逸
    if (modifiedHeaders.has("Location")) {
      let loc = modifiedHeaders.get("Location");
      loc = loc.replace(/https?:\/\/([a-z0-9-]+)\.wikipedia\.org/g, '/$1');
      loc = loc.replace(/\/\/([a-z0-9-]+)\.wikipedia\.org/g, '/$1');
      modifiedHeaders.set("Location", loc);
    }

    // 重写 HTML 及 JS 和 CSS
    const contentType = response.headers.get("content-type") || "";
    const isTextContent = contentType.includes("text/html") || 
                          contentType.includes("application/javascript") || 
                          contentType.includes("text/javascript") || 
                          contentType.includes("x-javascript") || 
                          contentType.includes("text/css");

    if (isTextContent) {
        let text = await response.text();

        // 全局替换官方域名，强制浏览器后续的所有加载请求全部走 Worker
        text = text.replace(/https?:\/\/([a-z0-9-]+)\.wikipedia\.org/g, '/$1');
        text = text.replace(/\/\/([a-z0-9-]+)\.wikipedia\.org/g, '/$1');

        text = text.replaceAll("//upload.wikimedia.org", "/upload");
        text = text.replaceAll("https://upload.wikimedia.org", "/upload");
        text = text.replaceAll("//www.wikidata.org", "/wikidata");
        text = text.replaceAll("https://www.wikidata.org", "/wikidata");

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
import os
import re
import requests

# 使用方法：终端输入：C:\Users\WJX\AppData\Local\Programs\Python\Python310\python.exe -u "E:\WJX\C_Training\zn\wiki\wiki_download\批量下载wiki网页的简易工具.py"

# 想要下载的维基百科词条列表
titles = ["生态环境", "微生物", "土壤", "土壤微生物学"]
output_dir = "./wiki_pages"
os.makedirs(output_dir, exist_ok=True)

# 维基百科 API 要求提供一个合理的 User-Agent 否则可能会被 403 拒绝
headers = {
    "User-Agent": "MyWebProjectBot/1.0 (contact: your_email@example.com) Requests/2.0",
    "Accept-Language": "zh-hans,zh-cn;q=0.9"
}

for title in titles:
    print(f"正在下载词条: {title}...")
    # 中文维基百科的 REST API 干净 HTML 接口
    url = f"https://zh.wikipedia.org/api/rest_v1/page/html/{requests.utils.quote(title)}"

    try:
        response = requests.get(url, headers=headers)
        if response.status_code == 200:
            html_content = response.text

            # 将 HTML 中所有的维基图片域名，替换为未来的 Cloudflare 代理路径
            # 这样国内用户访问静态页面时，图片就能通过部署域名加载
            html_content = html_content.replace(
                '//upload.wikimedia.org', '/api/proxy-image?url=https://upload.wikimedia.org'
            )

            # 在 <head> 标签后注入一个美化表格和字体的基础 CSS 样式
            # 如果要完美还原，也可以注入官方链接：<link rel="stylesheet" href="https://zh.wikipedia.org/w/load.php?modules=site.styles">
            custom_style = """
            <style>
                body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; line-height: 1.6; color: #202122; padding: 20px; max-width: 1200px; margin: 0 auto; }
                table.wikitable { border-collapse: collapse; margin: 1em 0; width: 100%; background-color: #f8f9fa; color: #222; }
                table.wikitable th, table.wikitable td { border: 1px solid #a2a9b1; padding: 0.4em 0.6em; }
                table.wikitable th { background-color: #eaecf0; text-align: left; font-weight: bold; }
                .mw-empty-elt { display: none; } /* 隐藏空元素 */
                </style>
            """
            html_content = html_content.replace('<head>', f'<head>{custom_style}')

            # 保存为本地静态文件
            filename = f"{title}.html"
            with open(os.path.join(output_dir, filename), "w", encoding="utf-8") as f:
                f.write(html_content)
            print(f"成功保存: {filename}")
        else:
            print(f"下载失败 {title}, 状态码: {response.status_code}")
    except Exception as e:
        print(f"请求出错 {title}: {e}")
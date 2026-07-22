/*
用途：POST /api/wiki/submit
请求体：{ keyword, usage }
KV：env.WIKI_DB（新 KV 命名空间）
Key：keyword:pending:{username}
Value：{ keyword, usage, user: currentUsername, createdAt } 
*/
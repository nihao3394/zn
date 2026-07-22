/*
用途：GET /api/wiki/pending
KV：env.WIKI_DB
遍历 keyword:pending:* → 返回待审核列表
鉴权：admin 或 keyword_reviewer 
*/
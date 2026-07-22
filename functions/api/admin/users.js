/*
用途：GET 获取全体成员列表 / PUT 修改用户角色
KV：env.USER_DB
鉴权：checkAdmin（复用 index.js 逻辑或从 middleware 注入）
*/

/*
// GET /api/admin/users  → 返回所有 user:* 记录（脱敏：不含密码）
// PUT /api/admin/users → { targetUser, role } → 更新 role 字段
*/
/*
用途：POST /api/wiki/review
请求体：{ id, action: "approve"|"reject" }
批准 → 从 keyword:pending:{user} 移到 keyword:approved:{id}
驳回 → 删除 keyword:pending:{user}
*/
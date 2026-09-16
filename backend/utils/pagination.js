function paginationParams(req, defaults = {}) {
  const page = Math.max(Number.parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || defaults.limit || 25, 1), defaults.max || 100);
  return { page, limit, skip: (page - 1) * limit };
}
function paginationMeta(page, limit, total) {
  return { page, limit, total, totalPages: Math.ceil(total / limit), hasNextPage: page * limit < total, hasPrevPage: page > 1 };
}
module.exports = { paginationParams, paginationMeta };

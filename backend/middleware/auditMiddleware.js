const AuditLog = require("../models/AuditLog");
function sanitizeBody(body = {}) {
  const blocked = new Set(["password", "confirmPassword", "token", "resetToken", "authorization", "apiKey"]);
  return Object.fromEntries(Object.entries(body).filter(([key]) => !blocked.has(key)).slice(0, 30));
}
function auditRequest(req, res, next) {
  const methods = new Set(["POST", "PUT", "PATCH", "DELETE"]);
  if (methods.has(req.method)) {
    res.on("finish", () => {
      if (!req.user) return;
      const parts = req.originalUrl.split("?")[0].split("/").filter(Boolean);
      const resource = parts[1] || "api";
      const last = parts[parts.length - 1];
      const recordId = /^[a-f\d]{24}$/i.test(last) ? last : null;
      AuditLog.create({
        actor: req.user._id,
        method: req.method,
        path: req.originalUrl.split("?")[0],
        action: `${req.method} ${resource}`,
        resource,
        recordId,
        statusCode: res.statusCode,
        ip: req.ip || req.headers["x-forwarded-for"] || "",
        metadata: { body: sanitizeBody(req.body) },
      }).catch((error) => console.error("Audit log error:", error.message));
    });
  }
  next();
}
module.exports = auditRequest;

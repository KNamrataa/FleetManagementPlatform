const User = require("../models/User");
const DailyReportLog = require("../models/DailyReportLog");
const { buildAnalytics } = require("../services/analyticsService");
const { sendRoleReport, runDailyReports } = require("../jobs/dailyAnalyticsReportJob");

const roleOf = req => String(req.user?.role || req.user?.user?.role || "").toUpperCase();
const dashboardPaths = {
  FLEET_MANAGER: "/fleet-manager",
  FINANCE_MANAGER: "/finance-manager",
  MAINTENANCE_MANAGER: "/maintenance-manager",
  TRIP_MANAGER: "/trip-manager",
  DISPATCHER: "/trip-manager",
  VIEWER: "/management",
  SUPER_ADMIN: "/super-admin",
};
async function summary(req, res) {
  try {
    const role = roleOf(req);
    const analytics = await buildAnalytics({ startDate: req.query.startDate, endDate: req.query.endDate, role });
    res.json({ success: true, analytics });
  } catch (error) {
    res.status(error.status || 500).json({ success: false, message: error.status ? error.message : "Unable to build dashboard analytics." });
  }
}
async function history(req, res) {
  try {
    const role = roleOf(req);
    const ownRole = role === "SUPER_ADMIN" || role === "VIEWER" ? "EXECUTIVE" : role === "DISPATCHER" ? "TRIP_MANAGER" : role;
    const page = Math.max(1, Number.parseInt(req.query.page || "1", 10) || 1);
    const limit = Math.min(50, Math.max(1, Number.parseInt(req.query.limit || "10", 10) || 10));
    const filter = { recipient: req.user?._id || req.user?.id, reportType: ownRole };
    const [data, total] = await Promise.all([
      DailyReportLog.find(filter).sort({ reportDate: -1, createdAt: -1 }).skip((page - 1) * limit).limit(limit).select("-summary").lean(),
      DailyReportLog.countDocuments(filter),
    ]);
    res.json({ success: true, data, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
  } catch (error) {
    res.status(500).json({ success: false, message: "Unable to load report history." });
  }
}
async function sendMyReport(req, res) {
  try {
    const role = roleOf(req);
    if (!["FLEET_MANAGER", "FINANCE_MANAGER", "MAINTENANCE_MANAGER", "TRIP_MANAGER", "DISPATCHER", "VIEWER", "SUPER_ADMIN"].includes(role)) {
      return res.status(403).json({ success: false, message: "Your role is not eligible for manager analytics reports." });
    }
    const userId = req.user?._id || req.user?.id || req.user?.userId;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Your session could not be matched to a user account. Sign out and sign in again." });
    }
    const user = await User.findById(userId).select("fullName email role isActive accountStatus").lean();
    if (!user?.email || user.isActive === false || user.accountStatus === "INACTIVE") {
      return res.status(400).json({ success: false, message: "An active account with an email address is required." });
    }
    const result = await sendRoleReport(user, role, new Date(), true);
    if (result.status !== "SENT") {
      const reason = result.errorMessage || "The email provider did not confirm delivery.";
      return res.status(502).json({
        success: false,
        report: result,
        message: `Report email was not sent to ${user.email}. ${reason}`,
      });
    }
    return res.status(200).json({
      success: true,
      report: result,
      message: `Daily report accepted for delivery to ${user.email}.`,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || "Unable to send report." });
  }
}
async function runAll(req, res) {
  try {
    if (roleOf(req) !== "SUPER_ADMIN") return res.status(403).json({ success: false, message: "Only Super Admin can trigger all manager reports." });
    const result = await runDailyReports(new Date(), { force: true });
    res.json({ success: true, result });
  } catch (error) {
    res.status(500).json({ success: false, message: "Unable to run daily reports." });
  }
}
module.exports = { summary, history, sendMyReport, runAll };

const User = require("../models/User");
const DailyReportLog = require("../models/DailyReportLog");
const { buildAnalytics } = require("../services/analyticsService");
const { sendAnalyticsReportEmail } = require("../services/analyticsReportEmailService");

const ROLE_GROUPS = [
  { type: "FLEET_MANAGER", roles: ["FLEET_MANAGER"], path: "/fleet-manager" },
  { type: "FINANCE_MANAGER", roles: ["FINANCE_MANAGER"], path: "/finance-manager" },
  { type: "MAINTENANCE_MANAGER", roles: ["MAINTENANCE_MANAGER"], path: "/maintenance-manager" },
  { type: "TRIP_MANAGER", roles: ["TRIP_MANAGER", "DISPATCHER"], path: "/trip-manager" },
  { type: "EXECUTIVE", roles: ["VIEWER", "SUPER_ADMIN"], path: "/management" },
];
const reportDateKey = date => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
const isActive = user => user && user.email && user.isActive !== false && user.accountStatus !== "INACTIVE";

async function sendRoleReport(user, role, date = new Date(), force = false, analyticsCache = null) {
  const group = ROLE_GROUPS.find(item => item.roles.includes(role)) || ROLE_GROUPS[4];
  const reportType = group.type;
  const reportDate = reportDateKey(date);
  const existing = await DailyReportLog.findOne({ reportType, reportDate, recipient: user._id });
  if (!force && existing?.status === "SENT") return { status: "SENT", skipped: true, reportType, reportDate };
  if (!force && existing?.attempts >= 3 && existing?.status === "FAILED") return { status: "FAILED", skipped: true, reportType, reportDate, errorMessage: existing.errorMessage };
  let log = existing;
  if (!log) {
    try {
      log = await DailyReportLog.create(
        { reportType, reportDate, recipient: user._id, recipientEmail: user.email, status: "PENDING", attempts: 0 });
    } catch (error) {
      if (error.code !== 11000) throw error;
      log = await DailyReportLog.findOne({ reportType, reportDate, recipient: user._id });
      if (!force && log?.status === "SENT")
         return { status: "SENT", skipped: true, reportType, reportDate };
    }
  }
  if (!log) throw new Error("Unable to create report delivery record.");
  log.status = "PENDING";
  log.attempts = Number(log.attempts || 0) + 1;
  log.recipientEmail = user.email;
  try {
    const roleForAnalytics = role === "SUPER_ADMIN" || role === "VIEWER" ? role : role;
    let analytics;
    if (analyticsCache) {
      const cacheKey = `${reportDate}:${roleForAnalytics}`;
      if (!analyticsCache.has(cacheKey)) {
        const analyticsPromise = buildAnalytics({ startDate: reportDate, endDate: reportDate, role: roleForAnalytics })
          .catch((error) => {
            analyticsCache.delete(cacheKey);
            throw error;
          });
        analyticsCache.set(cacheKey, analyticsPromise);
      }
      analytics = await analyticsCache.get(cacheKey);
    } else {
      analytics = await buildAnalytics({ startDate: reportDate, endDate: reportDate, role: roleForAnalytics });
    }
    await sendAnalyticsReportEmail({ email: user.email, fullName: user.fullName, reportType, reportDate, analytics, dashboardPath: group.path });
    log.status = "SENT";
    log.sentAt = new Date();
    log.errorMessage = "";
    log.summary = { alerts: analytics.alerts || [], reportRange: analytics.reportRange };
    await log.save();
    return { status: "SENT", reportType, reportDate, recipient: user.email };
  } catch (error) {
    log.status = "FAILED";
    log.errorMessage = String(error?.message || "Email delivery failed").slice(0, 500);
    await log.save();
    console.error(`[Daily analytics report] ${reportType} to ${user.email} failed:`, log.errorMessage);
    return { status: "FAILED", reportType, reportDate, recipient: user.email, errorMessage: log.errorMessage };
  }
}

async function runDailyReports(date = new Date(), { force = false } = {}) {
  const results = [];
  // Analytics are identical for recipients with the same exact role and date.
  // Cache the promise (not only the resolved value) so concurrent recipients
  // share one calculation; delivery logs and email attempts remain per recipient.
  const analyticsCache = new Map();
  const configuredConcurrency = Number.parseInt(process.env.DAILY_ANALYTICS_REPORT_CONCURRENCY || "3", 10);
  const concurrency = Number.isFinite(configuredConcurrency)
    ? Math.min(5, Math.max(1, configuredConcurrency))
    : 3;

  for (const group of ROLE_GROUPS) {
    const users = await User.find({
      role: { $in: group.roles },
      isActive: { $ne: false },
      accountStatus: { $ne: "INACTIVE" },
      email: { $exists: true, $nin: ["", null] },
    }).select("fullName email role isActive accountStatus").lean();
    const groupResults = new Array(users.length);
    let nextIndex = 0;
    const worker = async () => {
      while (true) {
        const index = nextIndex++;
        if (index >= users.length) return;
        groupResults[index] = await sendRoleReport(users[index], users[index].role, date, force, analyticsCache);
      }
    };
    await Promise.all(Array.from({ length: Math.min(concurrency, users.length) }, () => worker()));
    results.push(...groupResults);
  }
  return {
    reportDate: reportDateKey(date),
    total: results.length,
    sent: results.filter(r => r.status === "SENT" && !r.skipped).length,
    skipped: results.filter(r => r.skipped).length,
    failed: results.filter(r => r.status === "FAILED").length,
    retryableFailures: results.filter(r => r.status === "FAILED" && !r.skipped).length,
    results,
  };
}

function istHourAndMinute(date) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(date);
  return { hour: Number(parts.find(p => p.type === "hour")?.value), minute: Number(parts.find(p => p.type === "minute")?.value) };
}
function startDailyAnalyticsReportJob() {
  let lastAttemptedDate = "";
  const check = async () => {
    if (process.env.DAILY_ANALYTICS_REPORTS_ENABLED === "false") return;
    if (require("mongoose").connection.readyState !== 1) return;
    const now = new Date();
    const { hour, minute } = istHourAndMinute(now);
    const today = reportDateKey(now);
    const configuredHour = Number.isInteger(Number(process.env.DAILY_ANALYTICS_REPORT_HOUR_IST)) ? Number(process.env.DAILY_ANALYTICS_REPORT_HOUR_IST) : 8;
    if (hour < configuredHour || lastAttemptedDate === today) return;
    lastAttemptedDate = today;
    try {
      const result = await runDailyReports(now);
      console.log(`[Daily analytics reports] ${today}: ${result.sent} sent, ${result.skipped} skipped, ${result.failed} failed.`);
      if (result.retryableFailures > 0) lastAttemptedDate = "";
    } catch (error) {
      console.error("[Daily analytics reports] Job failed:", error.message);
      lastAttemptedDate = "";
    }
  };
  void check();
  const timer = setInterval(check, 60 * 1000);
  if (typeof timer.unref === "function") timer.unref();
  return timer;
}
module.exports = { startDailyAnalyticsReportJob, runDailyReports, sendRoleReport };

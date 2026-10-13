const https = require("https");

const escapeHtml = value => String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
function sendRequest({ apiKey, payload, timeoutMs = 15000 }) {
  const body = JSON.stringify(payload);
  return new Promise((resolve, reject) => {
    const request = https.request({
      hostname: "api.brevo.com", path: "/v3/smtp/email", method: "POST", timeout: timeoutMs,
      headers: { accept: "application/json", "api-key": apiKey, "content-type": "application/json", "content-length": Buffer.byteLength(body) },
    }, response => {
      let responseBody = "";
      response.setEncoding("utf8");
      response.on("data", chunk => { responseBody += chunk; });
      response.on("end", () => {
        let parsed = {};
        try { parsed = responseBody ? JSON.parse(responseBody) : {}; } catch {}
        if (response.statusCode >= 200 && response.statusCode < 300) return resolve(parsed);
        const error = new Error(parsed.message || parsed.code || `Brevo returned HTTP ${response.statusCode}.`);
        error.statusCode = response.statusCode;
        reject(error);
      });
    });
    request.on("timeout", () => request.destroy(new Error("Analytics report email timed out.")));
    request.on("error", reject);
    request.write(body);
    request.end();
  });
}
async function sendAnalyticsReportEmail({ email, fullName, reportType, reportDate, analytics, dashboardPath }) {
  const apiKey = String(process.env.BREVO_API_KEY || "").trim();
  const senderEmail = String(process.env.BREVO_SENDER_EMAIL || "").trim().toLowerCase();
  const senderName = String(process.env.BREVO_SENDER_NAME || "FleetFlow").trim() || "FleetFlow";
  const recipientEmail = String(email || "").trim().toLowerCase();

  if (!apiKey || !senderEmail) {
    throw new Error("Daily report email is not configured. Set BREVO_API_KEY and BREVO_SENDER_EMAIL in backend/.env, then restart the backend.");
  }
  
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

if (!emailPattern.test(senderEmail)) {
  throw new Error(
    "BREVO_SENDER_EMAIL must contain a valid email address. Configure it in backend/.env."
  );
}

if (!recipientEmail || !emailPattern.test(recipientEmail)) {
  throw new Error(
    "The signed-in manager account does not have a valid email address. Update the account email and try again."
  );
}

  const title = `${reportType.replaceAll("_", " ")} Daily Analytics Report`;
  const metrics = [];
  const add = (label, value) => metrics.push(`<tr><td style="padding:10px;border-bottom:1px solid #e2e8f0">${escapeHtml(label)}</td><td style="padding:10px;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:700">${escapeHtml(value)}</td></tr>`);
  if (analytics.fleet) {
    add("Total vehicles", analytics.fleet.totalVehicles);
    add("Active drivers", analytics.fleet.activeDrivers);
    add("Open maintenance work orders", analytics.fleet.openMaintenanceOrders);
    add("Services overdue", analytics.fleet.overdueServices);
    add("Documents expiring within 30 days", analytics.fleet.documentsExpiringWithin30Days);
  }
  if (analytics.trips) {
    add("Trips created in period", analytics.trips.tripsCreated);
    add("Completed trips in period", analytics.trips.completedInPeriod);
    add("Completed trips marked delayed", analytics.trips.delayedCompletedTrips);
    add("Trips awaiting driver or vehicle", analytics.trips.currentlyUnassigned);
    add("Trip completion rate", `${analytics.trips.completionRate}%`);
  }
  if (analytics.finance) {
    add("Invoice revenue recorded in period", `INR ${Number(analytics.finance.revenue || 0).toLocaleString("en-IN")}`);
    add("Expenses recorded in period", `INR ${Number(analytics.finance.expenses || 0).toLocaleString("en-IN")}`);
    add("Fuel cost in period", `INR ${Number(analytics.finance.fuelCost || 0).toLocaleString("en-IN")}`);
    add("Estimated profit (revenue less tracked expenses and maintenance)", `INR ${Number(analytics.finance.profitEstimate || 0).toLocaleString("en-IN")}`);
    add("Cash received", `INR ${Number(analytics.finance.cashReceived || 0).toLocaleString("en-IN")}`);
    add("Overdue invoices", analytics.finance.overdueInvoices);
  }
  if (analytics.maintenance) {
    add("Open work orders", analytics.maintenance.openWorkOrders);
    add("Overdue services", analytics.maintenance.overdueServices);
    add("Maintenance cost in period", `INR ${Number(analytics.maintenance.maintenanceCost || 0).toLocaleString("en-IN")}`);
    add("Open vehicle issues", analytics.maintenance.openVehicleIssues);
  }
  if (analytics.customer) {
    add("Average driver rating", analytics.customer.averageDriverRating);
    add("Average service rating", analytics.customer.averageServiceRating);
    add("Ratings in period", analytics.customer.ratingsCount);
  }
  const alerts = (analytics.alerts || []).length
    ? `<ul>${analytics.alerts.map(a => `<li style="margin:8px 0"><strong>${escapeHtml(a.severity)}:</strong> ${escapeHtml(a.message)}</li>`).join("")}</ul>`
    : "<p>No high-priority analytics alerts were identified for this report.</p>";
  const origin = String(process.env.FRONTEND_ORIGIN || "http://localhost:5173").replace(/\/$/, "");
  const link = `${origin}${dashboardPath || "/"}`;
  const htmlContent = `<!doctype html><html><body style="margin:0;background:#f8fafc;font-family:Arial,sans-serif;color:#172033"><div style="max-width:720px;margin:28px auto;padding:0 14px"><div style="background:#fff;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden"><div style="padding:22px 26px;background:#111827;color:#fff"><div style="font-size:22px;font-weight:800">Fleet<span style="color:#ef4444">Flow</span></div><div style="margin-top:8px;color:#cbd5e1">Daily Analytics · ${escapeHtml(reportDate)}</div></div><div style="padding:24px 26px"><h2 style="margin:0 0 10px">${escapeHtml(title)}</h2><p>Hello ${escapeHtml(fullName || "Manager")}, here is your FleetFlow summary for the reporting period.</p><table style="width:100%;border-collapse:collapse;margin:20px 0">${metrics.join("")}</table><h3>Items requiring attention</h3>${alerts}<p style="margin-top:24px"><a href="${escapeHtml(link)}" style="display:inline-block;padding:12px 18px;border-radius:9px;background:#dc2626;color:#fff;text-decoration:none;font-weight:700">Open FleetFlow</a></p><p style="font-size:12px;color:#64748b">Automatically generated from FleetFlow records. Metrics are limited to data currently available in the application.</p></div></div></div></body></html>`;
  const textContent = `${title}\nReport date: ${reportDate}\n\n${metrics.map(m => m.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()).join("\n")}\n\nAlerts:\n${(analytics.alerts || []).map(a => `${a.severity}: ${a.message}`).join("\n")}\n\nOpen FleetFlow: ${link}`;
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await sendRequest({ apiKey, payload: { sender: { name: senderName, email: senderEmail }, to: [{ email: recipientEmail, name: fullName || undefined }], subject: `FleetFlow Daily Report — ${title} — ${reportDate}`, htmlContent, textContent } });
    } catch (error) {
      lastError = error;
      const status = Number(error.statusCode || 0);
      if ((status && status < 500 && status !== 408 && status !== 429) || attempt === 3) break;
      await new Promise(resolve => setTimeout(resolve, 700 * attempt));
    }
  }
  throw lastError || new Error("Unable to send analytics report.");
}
module.exports = { sendAnalyticsReportEmail };

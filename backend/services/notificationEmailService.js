const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

function normalizeDashboardLink(link) {
  const frontendOrigin = String(process.env.FRONTEND_ORIGIN || "http://localhost:5173").replace(/\/$/, "");
  const rawLink = String(link || "").trim();

  if (!rawLink) return frontendOrigin;

  if (rawLink.startsWith("/")) {
    return `${frontendOrigin}${rawLink}`;
  }

  try {
    const parsed = new URL(rawLink);
    const allowedOrigin = new URL(frontendOrigin).origin;
    return parsed.origin === allowedOrigin ? parsed.toString() : frontendOrigin;
  } catch {
    return frontendOrigin;
  }
}

function priorityStyles(priority) {
  switch (String(priority || "NORMAL").toUpperCase()) {
    case "URGENT":
      return { label: "Urgent", background: "#fef2f2", border: "#fecaca", text: "#b91c1c" };
    case "HIGH":
      return { label: "High priority", background: "#fff7ed", border: "#fed7aa", text: "#c2410c" };
    case "LOW":
      return { label: "Low priority", background: "#f8fafc", border: "#e2e8f0", text: "#475569" };
    default:
      return { label: "Notification", background: "#eff6ff", border: "#bfdbfe", text: "#1d4ed8" };
  }
}

async function sendNotificationEmail({ email, fullName, title, message, category, priority, link }) {
  const apiKey = process.env.BREVO_API_KEY;
  const senderEmail = process.env.BREVO_SENDER_EMAIL;
  const senderName = process.env.BREVO_SENDER_NAME || "FleetFlow";

  if (!apiKey || !senderEmail) {
    throw new Error("Brevo email configuration is missing.");
  }

  const styles = priorityStyles(priority);
  const safeName = escapeHtml(fullName || "there");
  const safeTitle = escapeHtml(title || "FleetFlow Notification");
  const safeMessage = escapeHtml(message || "You have a new notification in FleetFlow.");
  const safeCategory = escapeHtml(category || "SYSTEM");
  const safePriority = escapeHtml(styles.label);
  const dashboardUrl = normalizeDashboardLink(link);
  const safeDashboardUrl = escapeHtml(dashboardUrl);

  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      accept: "application/json",
      "api-key": apiKey,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      sender: {
        name: senderName,
        email: senderEmail,
      },
      to: [
        {
          email,
          name: fullName || undefined,
        },
      ],
      subject: `FleetFlow: ${title || "New Notification"}`,
      htmlContent: `<!doctype html>
<html>
  <body style="margin:0;background:#f8fafc;font-family:Arial,sans-serif;color:#172033">
    <div style="max-width:620px;margin:32px auto;padding:0 16px">
      <div style="background:#ffffff;border:1px solid #e5eaf0;border-radius:18px;overflow:hidden">
        <div style="padding:22px 28px;border-bottom:1px solid #e5eaf0">
          <div style="font-size:24px;font-weight:800">Fleet<span style="color:#dc2626">Flow</span></div>
        </div>
        <div style="padding:28px">
          <div style="display:inline-block;margin-bottom:14px;padding:6px 10px;border:1px solid ${styles.border};border-radius:999px;background:${styles.background};color:${styles.text};font-size:12px;font-weight:700">
            ${safeCategory} · ${safePriority}
          </div>
          <h2 style="margin:0 0 12px;font-size:24px;line-height:1.3">${safeTitle}</h2>
          <p style="margin:0 0 18px;line-height:1.7">Hello ${safeName},</p>
          <div style="padding:16px 18px;background:#f8fafc;border:1px solid #e5eaf0;border-radius:12px;line-height:1.7">
            ${safeMessage}
          </div>
          <div style="margin-top:24px">
            <a href="${safeDashboardUrl}" style="display:inline-block;padding:12px 18px;background:#dc2626;color:#ffffff;text-decoration:none;border-radius:10px;font-weight:700">View in FleetFlow</a>
          </div>
          <p style="margin:24px 0 0;color:#64748b;font-size:12px;line-height:1.6">
            This email was sent because this notification was created in your FleetFlow account. You can also view it in your dashboard notification center.
          </p>
        </div>
      </div>
    </div>
  </body>
</html>`,
      textContent: `FleetFlow Notification\n\n${title || "New Notification"}\n\nHello ${fullName || "there"},\n\n${message || "You have a new notification in FleetFlow."}\n\nCategory: ${category || "SYSTEM"}\nPriority: ${styles.label}\n\nView in FleetFlow: ${dashboardUrl}`,
    }),
  });

  if (!response.ok) {
    const providerData = await response.json().catch(() => ({}));
    const providerMessage = providerData?.message || `Brevo returned HTTP ${response.status}.`;
    throw new Error(providerMessage);
  }

  return response.json().catch(() => ({}));
}

module.exports = { sendNotificationEmail };

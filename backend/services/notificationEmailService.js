const https = require("https");


function sendBrevoEmail({ apiKey, payload, timeoutMs = 15000, attempts = 3 }) {
  const body = JSON.stringify(payload);

  const attempt = () =>
    new Promise((resolve, reject) => {
      const request = https.request(
        {
          hostname: "api.brevo.com",
          path: "/v3/smtp/email",
          method: "POST",
          timeout: timeoutMs,
          headers: {
            accept: "application/json",
            "api-key": apiKey,
            "content-type": "application/json",
            "content-length": Buffer.byteLength(body),
          },
        },
        (response) => {
          let responseBody = "";

          response.setEncoding("utf8");
          response.on("data", (chunk) => {
            responseBody += chunk;
          });

          response.on("end", () => {
            let parsed = {};
            try {
              parsed = responseBody ? JSON.parse(responseBody) : {};
            } catch {
              parsed = {};
            }

            const status = Number(response.statusCode || 0);

            if (status >= 200 && status < 300) {
              resolve(parsed);
              return;
            }

            const error = new Error(
              parsed?.message || `Brevo returned HTTP ${status}.`
            );
            error.statusCode = status;
            error.providerResponse = parsed;
            reject(error);
          });
        }
      );

      request.on("timeout", () => {
        request.destroy(new Error("Brevo email request timed out."));
      });

      request.on("error", reject);
      request.write(body);
      request.end();
    });

  return (async () => {
    let lastError;

    for (let attemptNumber = 1; attemptNumber <= attempts; attemptNumber += 1) {
      try {
        return await attempt();
      } catch (error) {
        lastError = error;

        const status = Number(error?.statusCode || 0);
        const retryable =
          !status ||
          status === 408 ||
          status === 425 ||
          status === 429 ||
          status >= 500;

        if (!retryable || attemptNumber === attempts) {
          throw error;
        }

        await new Promise((resolve) =>
          setTimeout(resolve, 750 * attemptNumber)
        );
      }
    }

    throw lastError || new Error("Unable to send notification email.");
  })();
}

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

  const response = await sendBrevoEmail({
    apiKey,
    payload: {
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
    },
  });

  return response || {};

}

module.exports = { sendNotificationEmail };

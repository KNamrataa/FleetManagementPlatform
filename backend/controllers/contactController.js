const https = require("https");

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function sendBrevoEmail(payload) {
  const apiKey = String(process.env.BREVO_API_KEY || "").trim();
  if (!apiKey) {
    const error = new Error("Contact email delivery is not configured.");
    error.code = "EMAIL_NOT_CONFIGURED";
    throw error;
  }

  const body = JSON.stringify(payload);
  return new Promise((resolve, reject) => {
    const request = https.request({
      hostname: "api.brevo.com",
      path: "/v3/smtp/email",
      method: "POST",
      timeout: 15000,
      headers: {
        accept: "application/json",
        "api-key": apiKey,
        "content-type": "application/json",
        "content-length": Buffer.byteLength(body),
      },
    }, (response) => {
      let responseBody = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => { responseBody += chunk; });
      response.on("end", () => {
        let result = {};
        try { result = responseBody ? JSON.parse(responseBody) : {}; } catch {}
        if (response.statusCode >= 200 && response.statusCode < 300) {
          return resolve(result);
        }
        const error = new Error(result.message || `Brevo returned HTTP ${response.statusCode}.`);
        error.statusCode = response.statusCode;
        reject(error);
      });
    });

    request.on("timeout", () => request.destroy(new Error("Contact email delivery timed out.")));
    request.on("error", reject);
    request.write(body);
    request.end();
  });
}

async function submitContactMessage(req, res) {
  const name = String(req.body?.name || "").trim();
  const email = String(req.body?.email || "").trim().toLowerCase();
  const subject = String(req.body?.subject || "").trim();
  const message = String(req.body?.message || "").trim();

  if (!name || !email || !subject || !message) {
    return res.status(400).json({ success: false, message: "Please complete all fields." });
  }

  if (name.length > 100 || email.length > 254 || subject.length > 150 || message.length > 5000) {
    return res.status(400).json({
      success: false,
      message: "One or more fields exceed the allowed length.",
    });
  }

  if (!EMAIL_PATTERN.test(email)) {
    return res.status(400).json({ success: false, message: "Please enter a valid email address." });
  }

  const senderEmail = String(process.env.BREVO_SENDER_EMAIL || "").trim().toLowerCase();
  const senderName = String(process.env.BREVO_SENDER_NAME || "FleetFlow").trim() || "FleetFlow";
  // Defaults to the contact email already displayed on the home page. Override in backend/.env for deployment.
  const receiverEmail = String(process.env.CONTACT_RECEIVER_EMAIL || "info@shnoor.com").trim().toLowerCase();

  if (!process.env.BREVO_API_KEY || !EMAIL_PATTERN.test(senderEmail) || !EMAIL_PATTERN.test(receiverEmail)) {
    console.error("Contact form email configuration is incomplete. Check BREVO_API_KEY, BREVO_SENDER_EMAIL and CONTACT_RECEIVER_EMAIL.");
    return res.status(503).json({
      success: false,
      message: "Contact service is temporarily unavailable. Please try again later.",
    });
  }

  const safeName = escapeHtml(name);
  const safeEmail = escapeHtml(email);
  const safeSubject = escapeHtml(subject);
  const safeMessage = escapeHtml(message).replace(/\r?\n/g, "<br>");
  const emailPayload = {
    sender: { name: senderName, email: senderEmail },
    to: [{ email: receiverEmail }],
    replyTo: { email, name },
    subject: `FleetFlow Contact Us: ${subject.replace(/[\r\n]+/g, " ").slice(0, 180)}`,
    textContent: `New FleetFlow Contact Us message\n\nName: ${name}\nEmail: ${email}\nSubject: ${subject}\n\nMessage:\n${message}`,
    htmlContent: `<!doctype html><html><body style="font-family:Arial,sans-serif;color:#172033"><h2>New FleetFlow Contact Us Message</h2><p><strong>Name:</strong> ${safeName}</p><p><strong>Email:</strong> ${safeEmail}</p><p><strong>Subject:</strong> ${safeSubject}</p><p><strong>Message:</strong></p><p>${safeMessage}</p></body></html>`,
  };

  try {
    // Notify the FleetFlow support inbox first.
    await sendBrevoEmail(emailPayload);

    // Send a separate acknowledgement email to the address entered by the visitor.
    // replyTo on the notification above only controls replies from support; it does
    // not send an email to the visitor, so an explicit second message is required.
    const autoReplyPayload = {
      sender: { name: senderName, email: senderEmail },
      to: [{ email, name }],
      replyTo: { email: receiverEmail, name: senderName },
      subject: "We received your message - FleetFlow",
      textContent:
        `Hello ${name},\n\n` +
        "Thank you for contacting FleetFlow. We have received your message and our team will review it. " +
        "If we need more information, we will reply to this email.\n\n" +
        "For your reference, your submitted subject was: " + subject + "\n\n" +
        "Regards,\nFleetFlow Support",
      htmlContent: `<!doctype html><html><body style="font-family:Arial,sans-serif;color:#172033;line-height:1.6">` +
        `<h2>Thank you for contacting FleetFlow, ${safeName}.</h2>` +
        `<p>We have received your message and our team will review it.</p>` +
        `<p>If we need more information, we will reply to this email.</p>` +
        `<p><strong>Your subject:</strong> ${safeSubject}</p>` +
        `<p>Regards,<br>FleetFlow Support</p></body></html>`,
    };

    try {
      await sendBrevoEmail(autoReplyPayload);
    } catch (autoReplyError) {
      // The support team has already received the inquiry. Do not report the whole
      // submission as failed (which may cause duplicate support emails on retry).
      console.error("Contact form acknowledgement email failed:", autoReplyError.message);
      return res.status(200).json({
        success: true,
        message: "Your message was sent to our team, but we could not send the confirmation email. Our team will get back to you.",
        confirmationEmailSent: false,
      });
    }

    return res.status(200).json({
      success: true,
      message: "Your message was sent successfully. A confirmation email has been sent to your email address.",
      confirmationEmailSent: true,
    });
  } catch (error) {
    // Keep provider credentials and internal response details out of public API responses.
    console.error("Contact form email delivery failed:", error.message);
    return res.status(502).json({
      success: false,
      message: "We could not send your message right now. Please try again later.",
    });
  }
}

module.exports = { submitContactMessage };

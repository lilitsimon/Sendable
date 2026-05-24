import { checkRateLimit, getClientIp } from "./_rateLimit.js";

function setCorsHeaders(req, res) {
  const origin = req.headers.origin;
  const configuredOrigins = (process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  const isChromeExtension = typeof origin === "string" && origin.startsWith("chrome-extension://");
  const isExplicitlyAllowed = configuredOrigins.length > 0 && configuredOrigins.includes(origin);

  if (origin && (isChromeExtension || isExplicitlyAllowed)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }

  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

async function parseRequestBody(req) {
  if (req.body && typeof req.body === "object") {
    return req.body;
  }

  const rawBody = await new Promise((resolve, reject) => {
    let data = "";

    req.on("data", (chunk) => {
      data += chunk;
    });

    req.on("end", () => resolve(data));
    req.on("error", reject);
  });

  return rawBody ? JSON.parse(rawBody) : {};
}

function isValidEmail(email) {
  return typeof email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/u.test(email.trim());
}

async function forwardToWebhook(payload) {
  const webhookUrl = process.env.WELCOME_EMAIL_WEBHOOK_URL;

  if (!webhookUrl) {
    return false;
  }

  const headers = {
    "Content-Type": "application/json"
  };

  if (process.env.WELCOME_EMAIL_WEBHOOK_TOKEN) {
    headers.Authorization = `Bearer ${process.env.WELCOME_EMAIL_WEBHOOK_TOKEN}`;
  }

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers,
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error("Welcome capture webhook rejected the request.");
  }

  return true;
}

export default async function handler(req, res) {
  setCorsHeaders(req, res);

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed." });
    return;
  }

  const rateCheck = checkRateLimit(getClientIp(req), { max: 5, windowMs: 60_000 });
  if (!rateCheck.ok) {
    res.setHeader("Retry-After", String(rateCheck.retryAfter));
    res.status(429).json({ error: "Too many requests. Please slow down." });
    return;
  }

  try {
    const body = await parseRequestBody(req);
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";

    if (!isValidEmail(email)) {
      res.status(400).json({ error: "A valid email address is required." });
      return;
    }

    const payload = {
      email,
      newsletter: Boolean(body.newsletter),
      termsAccepted: Boolean(body.termsAccepted),
      source: body.source || "extension_welcome",
      createdAt: new Date().toISOString(),
      userAgent: req.headers["user-agent"] || "",
      origin: req.headers.origin || ""
    };

    const forwarded = await forwardToWebhook(payload);

    console.log("[sendable-welcome-email]", JSON.stringify(payload));

    res.status(200).json({
      ok: true,
      tracked: true,
      forwarded
    });
  } catch (error) {
    console.error("[sendable-welcome-email-error]", error);
    res.status(500).json({ error: "Couldn't track this signup right now." });
  }
}

const store = new Map();

export function getClientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) {
    return forwarded.split(",")[0].trim();
  }
  return req.socket?.remoteAddress || "unknown";
}

export function checkRateLimit(ip, { windowMs = 60_000, max = 30 } = {}) {
  const now = Date.now();
  const entry = store.get(ip);

  if (!entry || now - entry.start >= windowMs) {
    store.set(ip, { start: now, count: 1 });
    return { ok: true };
  }

  if (entry.count >= max) {
    const retryAfter = Math.ceil((entry.start + windowMs - now) / 1000);
    return { ok: false, retryAfter };
  }

  entry.count += 1;
  return { ok: true };
}

export class AccountError extends Error {
  constructor(status, message, code = "INVALID_REQUEST") { super(message); this.status = status; this.code = code; }
}

export function sameOrigin(req) {
  if (req.method !== "POST") return;
  let origin;
  try { origin = new URL(req.headers.origin); } catch { throw new AccountError(403, "Обнови страницата и опитай отново."); }
  if (origin.host !== req.headers.host || !["https:", "http:"].includes(origin.protocol)) throw new AccountError(403, "Неразрешен източник.");
}

export async function jsonBody(req) {
  if (req.headers["content-type"]?.split(";")[0].trim() !== "application/json") throw new AccountError(415, "Изпрати заявката във формат JSON.");
  let body = req.body;
  if (body === undefined) {
    const chunks = []; let size = 0;
    for await (const chunk of req) {
      size += Buffer.byteLength(chunk);
      if (size > 8192) throw new AccountError(413, "Заявката е прекалено голяма.");
      chunks.push(Buffer.from(chunk));
    }
    body = Buffer.concat(chunks).toString();
  }
  if (Buffer.isBuffer(body)) body = body.toString();
  if (typeof body === "string") {
    if (Buffer.byteLength(body) > 8192) throw new AccountError(413, "Заявката е прекалено голяма.");
    try { body = JSON.parse(body); } catch { throw new AccountError(400, "Невалидна заявка."); }
  }
  if (!body || typeof body !== "object" || Array.isArray(body) || Buffer.byteLength(JSON.stringify(body)) > 8192) throw new AccountError(400, "Невалидна заявка.");
  return body;
}

export function privateResponse(res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("Vercel-CDN-Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  return (status, data) => { res.statusCode = status; res.end(JSON.stringify(data)); };
}

export const field = (value, label, max = 80) => {
  if (typeof value !== "string" || value.trim().length < 2 || value.trim().length > max || /[\u0000-\u001f\u007f]/.test(value)) throw new AccountError(400, `Провери полето „${label}“.`);
  return value.trim();
};

import { randomUUID, randomBytes } from "node:crypto";
import { AccountError, field, jsonBody, privateResponse, sameOrigin } from "./account-http.js";
import { accountDate } from "../shared/account-date.js";
import { sessionHash } from "./ride-alerts.js";

const ACTIVE = "('waiting', 'accepted', 'arrived', 'in_progress')";
const driverActive = `EXISTS (SELECT 1 FROM rivo_member_rides r JOIN rivo_member_sessions s ON s.id = r.driver_id WHERE s.account_id = $1 AND r.status IN ${ACTIVE})`;
const profile = row => ({ id: row.id, name: row.display_name, email: row.email });
const application = row => row ? ({ accountId: row.account_id, status: row.status, revision: row.revision,
  legalName: row.legal_name, phone: row.phone, vehicleModel: row.vehicle_model, vehiclePlate: row.vehicle_plate,
  certificateNumber: row.certificate_number, permitNumber: row.permit_number,
  permitValidUntil: new Date(row.permit_valid_until).toISOString().slice(0, 10), note: row.review_note,
  updatedAt: row.updated_at }) : null;

export function createAccounts({ query, resolveIdentity, reviewerEmails = [] }) {
  const reviewers = new Set(reviewerEmails.map(x => x.trim().toLowerCase()).filter(Boolean));
  const isReviewer = account => reviewers.has(account.email.toLowerCase());
  async function accountFor(req) {
    const identity = await resolveIdentity(req);
    if (!identity) return null;
    const [existing] = await query("SELECT * FROM rivo_accounts WHERE auth_subject = $1 AND email = $2", [identity.subject, identity.email]);
    if (existing) return { ...existing, auth_session_hash: sessionHash(req), auth_expires_at: identity.expiresAt };
    // Identity comes only from the provider's verified session, never request JSON.
    const [row] = await query(`INSERT INTO rivo_accounts (id, auth_subject, email) VALUES ($1, $2, $3)
      ON CONFLICT (auth_subject) DO UPDATE SET email = EXCLUDED.email RETURNING *`, [randomUUID(), identity.subject, identity.email]);
    return { ...row, auth_session_hash: sessionHash(req), auth_expires_at: identity.expiresAt };
  }
  async function participantFor(req) {
    const account = await accountFor(req);
    if (!account) return null;
    if (!account.display_name) throw new AccountError(403, "Първо попълни името си в профила.", "PROFILE_REQUIRED");
    const role = new URL(req.url, "http://localhost").searchParams.get("role");
    if (!["customer", "driver"].includes(role)) throw new AccountError(400, "Избери пътник или шофьор.");
    const [app] = role === "driver" ? await query("SELECT * FROM rivo_driver_applications WHERE account_id = $1", [account.id]) : [];
    if (role === "driver" && !app) throw new AccountError(403, "Подай кандидатура за шофьор от профила.", "DRIVER_APPLICATION_REQUIRED");
    const [existing] = await query("SELECT * FROM rivo_member_sessions WHERE account_id = $1 AND role = $2", [account.id, role]);
    const [row] = existing && existing.display_name === account.display_name && existing.vehicle_model === (app?.vehicle_model || null) && existing.vehicle_plate === (app?.vehicle_plate || null) ? [existing] : await query(`INSERT INTO rivo_member_sessions
      (id, token_hash, gate_hash, role, display_name, vehicle_type, vehicle_model, vehicle_plate, expires_at, account_id)
      VALUES ($1, $2, 'email-account-only', $3, $4, $5, $6, $7, '2000-01-01', $8)
      ON CONFLICT (account_id, role) WHERE account_id IS NOT NULL DO UPDATE SET display_name = EXCLUDED.display_name,
      vehicle_model = EXCLUDED.vehicle_model, vehicle_plate = EXCLUDED.vehicle_plate RETURNING *`,
    [randomUUID(), randomBytes(32).toString("hex"), role, account.display_name, role === "driver" ? "city" : null, app?.vehicle_model || null, app?.vehicle_plate || null, account.id]);
    return { ...row, auth_session_hash: account.auth_session_hash, auth_expires_at: account.auth_expires_at, can_accept: role === "driver" && app.status === "approved" && new Date(app.permit_valid_until).toISOString().slice(0, 10) >= accountDate() };
  }
  return { accountFor, participantFor, isReviewer, async handle(req, res) {
    const send = privateResponse(res);
    try {
      if (!query) throw new AccountError(503, "Профилите още се настройват.");
      if (!["GET", "POST"].includes(req.method)) throw new AccountError(405, "Неподдържано действие.");
      sameOrigin(req);
      const action = new URL(req.url, "http://localhost").searchParams.get("action") || "profile";
      const account = await accountFor(req);
      if (!account) throw new AccountError(401, "Влез с имейла си.", "SESSION_REQUIRED");
      const body = req.method === "POST" ? await jsonBody(req) : null;
      if (action === "profile" && req.method === "GET") {
        const [app] = await query("SELECT * FROM rivo_driver_applications WHERE account_id = $1", [account.id]);
        return send(200, { profile: profile(account), application: application(app), canReview: isReviewer(account) });
      }
      if (action === "profile" && req.method === "POST") {
        const name = field(body.name, "Твоето име");
        const [row] = await query(`WITH updated AS (UPDATE rivo_accounts SET display_name = $2, updated_at = now() WHERE id = $1 RETURNING *)
          , participants AS (UPDATE rivo_member_sessions SET display_name = $2 WHERE account_id = $1) SELECT * FROM updated`, [account.id, name]);
        return send(200, { profile: profile(row) });
      }
      if (action === "apply" && req.method === "POST") {
        if (!account.display_name) throw new AccountError(400, "Първо запази името си.");
        if (body.licensed !== true) throw new AccountError(400, "Потвърди, че си действащ лицензиран таксиметров шофьор.");
        const phone = field(body.phone, "Телефон", 20);
        if (!/^\+?[\d ()-]{8,20}$/.test(phone) || phone.replace(/\D/g, "").length < 8 || phone.replace(/\D/g, "").length > 15) throw new AccountError(400, "Провери телефона за връзка.");
        if (!/^\d{4}-\d{2}-\d{2}$/.test(body.permitValidUntil || "") || !Number.isFinite(new Date(body.permitValidUntil).getTime()) || new Date(body.permitValidUntil).toISOString().slice(0, 10) !== body.permitValidUntil || body.permitValidUntil < accountDate()) throw new AccountError(400, "Разрешението трябва да е валидно.");
        const values = [account.id, field(body.legalName, "Име по документи"), phone, field(body.vehicleModel, "Автомобил"), field(body.vehiclePlate, "Регистрационен номер", 20).toUpperCase(), field(body.certificateNumber, "Удостоверение", 80), field(body.permitNumber, "Разрешение", 80), body.permitValidUntil];
        const [row] = await query(`INSERT INTO rivo_driver_applications (account_id, legal_name, phone, vehicle_model, vehicle_plate, certificate_number, permit_number, permit_valid_until)
          SELECT $1, $2, $3, $4, $5, $6, $7, $8::date WHERE NOT ${driverActive}
          ON CONFLICT (account_id) DO UPDATE SET status = 'pending', revision = rivo_driver_applications.revision + 1,
          legal_name = EXCLUDED.legal_name, phone = EXCLUDED.phone, vehicle_model = EXCLUDED.vehicle_model, vehicle_plate = EXCLUDED.vehicle_plate,
          certificate_number = EXCLUDED.certificate_number, permit_number = EXCLUDED.permit_number, permit_valid_until = EXCLUDED.permit_valid_until,
          review_note = '', updated_at = now() WHERE NOT ${driverActive} RETURNING *`, values);
        if (!row) throw new AccountError(409, "Приключи активния курс, преди да променяш кандидатурата.");
        return send(200, { application: application(row) });
      }
      if (["applications", "review"].includes(action)) {
        if (!isReviewer(account)) throw new AccountError(403, "Нямаш достъп до одобренията.");
        if (action === "applications" && req.method === "GET") {
          const rows = await query(`SELECT a.*, u.email FROM rivo_driver_applications a JOIN rivo_accounts u ON u.id = a.account_id ORDER BY a.updated_at DESC LIMIT 100`, []);
          return send(200, { applications: rows.map(row => ({ ...application(row), email: row.email })) });
        }
        if (action === "review" && req.method === "POST") {
          if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.accountId || "")) throw new AccountError(400, "Невалидна кандидатура.");
          if (body.accountId === account.id) throw new AccountError(403, "Кандидатурата ти трябва да бъде прегледана от друг упълномощен човек.");
          if (!["approved", "rejected", "suspended"].includes(body.status) || !Number.isInteger(body.revision)) throw new AccountError(400, "Невалидно решение.");
          if (body.status === "approved" && body.documentsChecked !== true) throw new AccountError(400, "Потвърди ръчната проверка на документите и автомобила.");
          const note = field(body.note, "Бележка от проверката", 500);
          const rows = await query(`WITH previous AS (SELECT * FROM rivo_driver_applications WHERE account_id = $1 FOR UPDATE),
            updated AS (UPDATE rivo_driver_applications a SET status = $2, review_note = $3, revision = a.revision + 1, updated_at = now()
              FROM previous p WHERE a.account_id = p.account_id AND a.revision = $4 AND p.revision = $4
              AND ($2 <> 'approved' OR a.permit_valid_until >= (now() AT TIME ZONE 'Europe/Sofia')::date) RETURNING a.*, p.status AS from_status),
            audit AS (INSERT INTO rivo_driver_reviews (id, account_id, reviewer_id, from_status, to_status, application_revision, note)
              SELECT $5, account_id, $6, from_status, status, $4, $3 FROM updated) SELECT * FROM updated`,
          [body.accountId, body.status, note, body.revision, randomUUID(), account.id]);
          if (!rows[0]) throw new AccountError(409, "Кандидатурата е променена или разрешението е изтекло. Обнови списъка.");
          return send(200, { application: application(rows[0]) });
        }
      }
      throw new AccountError(404, "Действието не е намерено.");
    } catch (error) {
      if (error instanceof AccountError) return send(error.status, { error: error.message, code: error.code });
      console.error("RIVO accounts", error.code || error.name);
      return send(503, { error: "Профилът не е достъпен в момента. Опитай отново." });
    }
  } };
}

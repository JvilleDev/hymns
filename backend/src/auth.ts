import type { Database } from "bun:sqlite";
import type { Express, NextFunction, Request, Response } from "express";
import { createHmac, randomBytes, timingSafeEqual } from "crypto";

// -- Configuración (todo por env; no hay claves por defecto) --
// MASTER_TENANT_ID: tenant maestro (único que edita los cantos y gestiona tenants)
// MASTER_PASSWORD:  contraseña del tenant maestro (sin ella, el maestro no puede entrar)
// TOKEN_SECRET:     secreto para firmar tokens; si falta se genera uno por arranque
//                   (los tokens dejan de valer al reiniciar el backend)
export const MASTER_TENANT_ID = process.env.MASTER_TENANT_ID || "";
const MASTER_PASSWORD = process.env.MASTER_PASSWORD || "";
const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

let TOKEN_SECRET = process.env.TOKEN_SECRET || "";
if (!TOKEN_SECRET) {
  TOKEN_SECRET = randomBytes(32).toString("hex");
  console.warn("[auth] TOKEN_SECRET no definido: se usa un secreto temporal; las sesiones se pierden al reiniciar.");
}
if (!MASTER_TENANT_ID || !MASTER_PASSWORD) {
  console.warn("[auth] MASTER_TENANT_ID/MASTER_PASSWORD no definidos: el tenant maestro no podrá iniciar sesión.");
}

const TENANT_ID_RE = /^[A-Za-z0-9_-]{3,64}$/;

export interface TenantInfo {
  tenantId: string;
  isMaster: boolean;
}

declare global {
  namespace Express {
    interface Request {
      tenant?: TenantInfo;
    }
  }
}

// -- Tokens firmados (HMAC-SHA256), stateless --

const b64 = (s: string | Buffer) => Buffer.from(s).toString("base64url");
const sign = (body: string) => createHmac("sha256", TOKEN_SECRET).update(body).digest("base64url");

export function signToken(info: TenantInfo): string {
  const body = b64(JSON.stringify({ t: info.tenantId, m: info.isMaster, exp: Date.now() + TOKEN_TTL_MS }));
  return `${body}.${sign(body)}`;
}

const safeEqual = (a: string, b: string) => {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
};

export function verifyToken(token: string | undefined | null): TenantInfo | null {
  if (!token) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig || !safeEqual(sig, sign(body))) return null;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString());
    if (typeof p.t !== "string" || typeof p.exp !== "number" || p.exp < Date.now()) return null;
    return { tenantId: p.t, isMaster: !!p.m };
  } catch {
    return null;
  }
}

export const tokenFromRequest = (req: Request): string | null => {
  const h = req.headers.authorization;
  if (!h) return null;
  return h.startsWith("Bearer ") ? h.slice(7) : h;
};

// -- Setup de DB y migración --

export function initAuth(db: Database) {
  db.run(
    `CREATE TABLE IF NOT EXISTS tenants (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      passwordHash TEXT,
      isActive INTEGER NOT NULL DEFAULT 1,
      createdAt INTEGER NOT NULL
    )`,
  );

  // Migración: un tenant por cada clientId que ya tenga datos (sin contraseña hasta que el maestro se la asigne)
  const sources: Array<[string, string]> = [
    ["anuncios", "clientId"],
    ["media", "clientId"],
    ["client_states", "clientId"],
    ["processed_paragraphs", "clientId"],
    ["transcript_lines", "session_id"],
  ];
  const insert = db.query("INSERT OR IGNORE INTO tenants (id, name, passwordHash, isActive, createdAt) VALUES (?, ?, NULL, 1, ?)");
  let created = 0;
  for (const [table, col] of sources) {
    try {
      const rows = db.query(`SELECT DISTINCT ${col} AS id FROM ${table} WHERE ${col} IS NOT NULL AND ${col} != ''`).all() as Array<{ id: string }>;
      for (const r of rows) created += insert.run(r.id, r.id, Date.now()).changes;
    } catch (e) {
      console.error(`[auth] migración de tenants desde ${table} falló:`, e);
    }
  }
  if (MASTER_TENANT_ID) created += insert.run(MASTER_TENANT_ID, "Maestro", Date.now()).changes;
  if (created) console.log(`[auth] ${created} tenant(s) creados en la migración`);
}

// -- Middlewares --

const isActiveTenant = (db: Database, id: string) => {
  if (id === MASTER_TENANT_ID) return true;
  const row = db.query("SELECT isActive FROM tenants WHERE id = ?").get(id) as { isActive: number } | null;
  return !!row && row.isActive === 1;
};

export const makeAuth = (db: Database) => {
  const requireTenant = (req: Request, res: Response, next: NextFunction) => {
    const info = verifyToken(tokenFromRequest(req));
    if (!info || !isActiveTenant(db, info.tenantId)) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    req.tenant = { tenantId: info.tenantId, isMaster: MASTER_TENANT_ID !== "" && info.tenantId === MASTER_TENANT_ID };
    next();
  };

  const requireMaster = (req: Request, res: Response, next: NextFunction) =>
    requireTenant(req, res, () => {
      if (!req.tenant?.isMaster) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
      next();
    });

  // Si hay token válido lo usa; si no, deja pasar (lecturas públicas por tenant ID)
  const optionalTenant = (req: Request, _res: Response, next: NextFunction) => {
    const info = verifyToken(tokenFromRequest(req));
    if (info && isActiveTenant(db, info.tenantId)) {
      req.tenant = { tenantId: info.tenantId, isMaster: MASTER_TENANT_ID !== "" && info.tenantId === MASTER_TENANT_ID };
    }
    next();
  };

  return { requireTenant, requireMaster, optionalTenant };
};

// -- Rutas: login y gestión de tenants --

const attempts = new Map<string, { n: number; reset: number }>();
const tooManyAttempts = (key: string) => {
  const now = Date.now();
  const a = attempts.get(key);
  if (!a || a.reset < now) {
    attempts.set(key, { n: 1, reset: now + 60_000 });
    return false;
  }
  a.n++;
  return a.n > 8;
};

export function registerAuthRoutes(
  app: Express,
  db: Database,
  auth: ReturnType<typeof makeAuth>,
  // Limpieza de datos y conexiones del tenant antes de borrarlo
  onTenantDeleted: (id: string) => void = () => {},
) {
  app.post("/api/auth/login", async (req, res) => {
    const tenantId = String(req.body?.tenantId ?? "").trim();
    const password = String(req.body?.password ?? "");
    if (!tenantId || !password) {
      res.status(400).json({ error: "tenantId y password requeridos" });
      return;
    }
    if (tooManyAttempts(`${req.ip}|${tenantId}`)) {
      res.status(429).json({ error: "Demasiados intentos, espera un minuto" });
      return;
    }

    let ok = false;
    if (MASTER_TENANT_ID && MASTER_PASSWORD && tenantId === MASTER_TENANT_ID) {
      ok = safeEqual(password, MASTER_PASSWORD);
    } else {
      const t = db.query("SELECT passwordHash, isActive FROM tenants WHERE id = ?").get(tenantId) as
        | { passwordHash: string | null; isActive: number }
        | null;
      if (t && t.isActive === 1 && t.passwordHash) ok = await Bun.password.verify(password, t.passwordHash);
      else await Bun.password.verify(password, "$argon2id$v=19$m=65536,t=2,p=1$ZHVtbXlzYWx0ZHVtbXk$0000000000000000000000000000000000000000000").catch(() => false);
    }
    if (!ok) {
      res.status(401).json({ error: "Credenciales inválidas" });
      return;
    }
    const isMaster = MASTER_TENANT_ID !== "" && tenantId === MASTER_TENANT_ID;
    res.json({ token: signToken({ tenantId, isMaster }), tenantId, isMaster });
  });

  app.get("/api/auth/me", auth.requireTenant, (req, res) => {
    const t = db.query("SELECT id, name FROM tenants WHERE id = ?").get(req.tenant!.tenantId) as { id: string; name: string } | null;
    res.json({ tenantId: req.tenant!.tenantId, name: t?.name ?? req.tenant!.tenantId, isMaster: req.tenant!.isMaster });
  });

  // -- Gestión (solo maestro) --
  app.get("/api/tenants", auth.requireMaster, (_req, res) => {
    const rows = db.query("SELECT id, name, passwordHash IS NOT NULL AS hasPassword, isActive, createdAt FROM tenants ORDER BY createdAt DESC").all() as any[];
    res.json(rows.map((r) => ({ ...r, hasPassword: !!r.hasPassword, isActive: !!r.isActive, isMaster: r.id === MASTER_TENANT_ID })));
  });

  app.post("/api/tenants", auth.requireMaster, async (req, res) => {
    const id = String(req.body?.id ?? "").trim();
    const name = String(req.body?.name ?? "").trim() || id;
    const password = String(req.body?.password ?? "");
    if (!TENANT_ID_RE.test(id)) {
      res.status(400).json({ error: "ID inválido (3-64 caracteres: letras, números, - y _)" });
      return;
    }
    if (password && password.length < 6) {
      res.status(400).json({ error: "La contraseña debe tener al menos 6 caracteres" });
      return;
    }
    if (db.query("SELECT 1 FROM tenants WHERE id = ?").get(id)) {
      res.status(409).json({ error: "Ya existe un tenant con ese ID" });
      return;
    }
    const hash = password ? await Bun.password.hash(password) : null;
    db.query("INSERT INTO tenants (id, name, passwordHash, isActive, createdAt) VALUES (?, ?, ?, 1, ?)").run(id, name, hash, Date.now());
    res.json({ id, name, hasPassword: !!hash, isActive: true });
  });

  app.put("/api/tenants/:id", auth.requireMaster, async (req, res) => {
    const id = req.params.id;
    if (!db.query("SELECT 1 FROM tenants WHERE id = ?").get(id)) {
      res.status(404).json({ error: "Tenant no encontrado" });
      return;
    }
    const { name, password, isActive } = req.body ?? {};
    if (typeof name === "string" && name.trim()) db.query("UPDATE tenants SET name = ? WHERE id = ?").run(name.trim(), id);
    if (typeof password === "string" && password) {
      if (password.length < 6) {
        res.status(400).json({ error: "La contraseña debe tener al menos 6 caracteres" });
        return;
      }
      db.query("UPDATE tenants SET passwordHash = ? WHERE id = ?").run(await Bun.password.hash(password), id);
    }
    if (typeof isActive === "boolean") {
      if (id === MASTER_TENANT_ID && !isActive) {
        res.status(400).json({ error: "No se puede desactivar el tenant maestro" });
        return;
      }
      db.query("UPDATE tenants SET isActive = ? WHERE id = ?").run(isActive ? 1 : 0, id);
    }
    res.json({ success: true });
  });

  app.delete("/api/tenants/:id", auth.requireMaster, (req, res) => {
    const id = req.params.id;
    if (id === MASTER_TENANT_ID) {
      res.status(400).json({ error: "No se puede eliminar el tenant maestro" });
      return;
    }
    if (!db.query("SELECT 1 FROM tenants WHERE id = ?").get(id)) {
      res.status(404).json({ error: "Tenant no encontrado" });
      return;
    }
    try {
      onTenantDeleted(id);
      db.query("DELETE FROM tenants WHERE id = ?").run(id);
      res.json({ success: true });
    } catch (e: any) {
      console.error(`[auth] error eliminando tenant ${id}:`, e);
      res.status(500).json({ error: "No se pudo eliminar el tenant" });
    }
  });
}

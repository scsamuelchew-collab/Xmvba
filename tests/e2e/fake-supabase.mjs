// Test-only stand-in for the Supabase HTTP API, backed by a real Postgres
// that has the app's migrations applied. It implements just the slice of
// PostgREST and GoTrue the app uses (plain selects with simple filters, RPC
// calls, /auth/v1/user), and runs every query as the anon/authenticated role
// with the caller's user id set — so Row Level Security and the database
// functions behave exactly as they would on Supabase.
//
// Never point this at anything but a throwaway local database.

import http from "node:http";
import pg from "pg";

const PORT = Number(process.env.FAKE_SUPABASE_PORT ?? 54321);
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const IDENT = /^[a-z_][a-z0-9_]*$/;

function decodeJwt(header) {
  const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return null;
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString());
    return payload.sub ? payload : null;
  } catch {
    return null;
  }
}

async function asCaller(claims, fn) {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query(`set local role ${claims ? "authenticated" : "anon"}`);
    await client.query("select set_config('request.jwt.claim.sub', $1, true)", [claims?.sub ?? ""]);
    const result = await fn(client);
    await client.query("commit");
    return result;
  } catch (e) {
    await client.query("rollback").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

function parseList(v) {
  return v
    .replace(/^\(|\)$/g, "")
    .split(",")
    .map((s) => s.replace(/^"|"$/g, ""));
}

function buildSelect(table, params) {
  if (!IDENT.test(table)) throw Object.assign(new Error(`bad table ${table}`), { status: 404 });
  const values = [];
  const where = [];
  let cols = "*";
  let order = "";
  let limit = "";
  for (const [key, raw] of params) {
    if (key === "select") {
      cols = raw === "*" ? "*" : raw.split(",").map((c) => {
        if (!IDENT.test(c)) throw new Error(`unsupported select ${raw}`);
        return `"${c}"`;
      }).join(",");
    } else if (key === "order") {
      order = " order by " + raw.split(",").map((part) => {
        const [col, dir = "asc", nulls] = part.split(".");
        if (!IDENT.test(col)) throw new Error(`bad order ${raw}`);
        return `"${col}" ${dir === "desc" ? "desc" : "asc"}${nulls === "nullsfirst" ? " nulls first" : nulls === "nullslast" ? " nulls last" : ""}`;
      }).join(",");
    } else if (key === "limit") {
      limit = ` limit ${parseInt(raw, 10)}`;
    } else if (key === "offset") {
      limit += ` offset ${parseInt(raw, 10)}`;
    } else {
      if (!IDENT.test(key)) throw new Error(`bad filter column ${key}`);
      const dot = raw.indexOf(".");
      const op = raw.slice(0, dot);
      const val = raw.slice(dot + 1);
      const col = `"${key}"`;
      const ops = { eq: "=", neq: "<>", gt: ">", gte: ">=", lt: "<", lte: "<=" };
      if (ops[op]) {
        values.push(val);
        where.push(`${col} ${ops[op]} $${values.length}`);
      } else if (op === "in") {
        values.push(parseList(val));
        where.push(`${col}::text = any($${values.length}::text[])`);
      } else if (op === "is") {
        if (!["null", "true", "false"].includes(val)) throw new Error(`bad is ${val}`);
        where.push(`${col} is ${val}`);
      } else {
        throw new Error(`unsupported filter ${key}=${raw}`);
      }
    }
  }
  const sql = `select ${cols} from public."${table}"${where.length ? " where " + where.join(" and ") : ""}${order}${limit}`;
  return { sql: `select coalesce(json_agg(t), '[]'::json) as rows from (${sql}) t`, values };
}

async function rpc(client, fn, args) {
  if (!IDENT.test(fn)) throw Object.assign(new Error(`bad function ${fn}`), { status: 404 });
  const meta = await client.query(
    `select p.proretset, format_type(p.prorettype, null) as rettype
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = $1 limit 1`,
    [fn]
  );
  if (!meta.rows[0]) throw Object.assign(new Error(`Could not find the function public.${fn}`), { status: 404, code: "PGRST202" });
  const names = Object.keys(args);
  for (const n of names) if (!IDENT.test(n)) throw new Error(`bad arg ${n}`);
  const values = names.map((n) => {
    const v = args[n];
    return v !== null && typeof v === "object" ? JSON.stringify(v) : v;
  });
  const call = `public."${fn}"(${names.map((n, i) => `"${n}" => $${i + 1}`).join(", ")})`;
  const { proretset, rettype } = meta.rows[0];
  if (proretset) {
    const r = await client.query(`select coalesce(json_agg(t), '[]'::json) as v from ${call} t`, values);
    return { body: r.rows[0].v };
  }
  if (rettype === "void") {
    await client.query(`select ${call}`, values);
    return { body: null };
  }
  const r = await client.query(`select to_json(${call}) as v`, values);
  return { body: r.rows[0].v };
}

function send(res, status, body, headers = {}) {
  const payload = body === undefined || body === null ? "" : JSON.stringify(body);
  res.writeHead(status, { "content-type": "application/json", ...headers });
  res.end(payload);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  const claims = decodeJwt(req.headers.authorization);
  let body = "";
  for await (const chunk of req) body += chunk;
  try {
    if (url.pathname === "/auth/v1/user") {
      if (!claims) return send(res, 401, { code: 401, message: "invalid JWT" });
      return send(res, 200, {
        id: claims.sub, aud: "authenticated", role: "authenticated", email: claims.email,
        app_metadata: { provider: "email" }, user_metadata: {}, created_at: new Date(0).toISOString(),
      });
    }
    if (url.pathname === "/auth/v1/logout") return send(res, 204, null);
    if (url.pathname.startsWith("/auth/v1/")) return send(res, 400, { message: "not supported in tests" });

    const rpcMatch = url.pathname.match(/^\/rest\/v1\/rpc\/([^/]+)$/);
    if (rpcMatch && req.method === "POST") {
      const out = await asCaller(claims, (c) => rpc(c, rpcMatch[1], body ? JSON.parse(body) : {}));
      return out.body === null ? send(res, 204, null) : send(res, 200, out.body);
    }
    const tableMatch = url.pathname.match(/^\/rest\/v1\/([^/]+)$/);
    if (tableMatch && (req.method === "GET" || req.method === "HEAD")) {
      const { sql, values } = buildSelect(tableMatch[1], [...url.searchParams.entries()]);
      const rows = await asCaller(claims, async (c) => (await c.query(sql, values)).rows[0].rows);
      if ((req.headers.accept ?? "").startsWith("application/vnd.pgrst.object+json")) {
        if (rows.length !== 1) {
          return send(res, 406, { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned", details: `${rows.length} rows`, hint: null });
        }
        return send(res, 200, rows[0]);
      }
      return send(res, 200, rows);
    }
    return send(res, 404, { message: `not implemented: ${req.method} ${url.pathname}` });
  } catch (e) {
    return send(res, e.status ?? 400, { code: e.code ?? "P0001", message: e.message, details: e.detail ?? null, hint: e.hint ?? null });
  }
});

server.listen(PORT, "127.0.0.1", () => console.log(`fake supabase on http://127.0.0.1:${PORT}`));

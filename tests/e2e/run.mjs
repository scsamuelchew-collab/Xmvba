// End-to-end: real Next.js build + real migrations on a local Postgres,
// driven through a phone-sized browser.
//
//   PGHOST=... PGUSER=... npm run test:e2e      (after `npm run build`)
//
// Users sign in by cookie (a fake session the fake Supabase accepts), so no
// email or Google round-trip is needed.

import { spawn, execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const DB = process.env.TEST_DB ?? "xinmin_lobby_e2e";
const SUPA_PORT = 54321;
const APP_PORT = Number(process.env.APP_PORT ?? 3100);
const APP = `http://127.0.0.1:${APP_PORT}`;
const SHOTS = path.join(ROOT, "tests/.artifacts");
mkdirSync(SHOTS, { recursive: true });

const u = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const procs = [];
let failures = 0;

function log(msg) {
  console.log(msg);
}

async function check(name, fn) {
  try {
    await fn();
    log(`  ✓ ${name}`);
  } catch (e) {
    failures++;
    log(`  ✗ ${name}\n      ${e.message.split("\n").join("\n      ")}`);
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

// ---------------------------------------------------------------- database
const psql = (args) => execFileSync("psql", ["-X", "-q", "-v", "ON_ERROR_STOP=1", ...args], { stdio: ["ignore", "ignore", "inherit"] });
psql(["-d", "postgres", "-c", `drop database if exists ${DB}`, "-c", `create database ${DB}`]);
for (const f of ["supabase/tests/00_supabase_stub.sql", ...execFileSync("sh", ["-c", "ls supabase/migrations/*.sql"], { cwd: ROOT }).toString().trim().split("\n")]) {
  psql(["-d", DB, "-f", path.join(ROOT, f)]);
}
const pgHost = process.env.PGHOST ?? "localhost";
const DATABASE_URL = `postgres://${process.env.PGUSER ?? "postgres"}@/${DB}?host=${encodeURIComponent(pgHost)}&port=${process.env.PGPORT ?? 5432}`;
const db = new pg.Pool({ connectionString: DATABASE_URL });

const names = { 1: "Marcus Lim", 2: "Jason Tan", 3: "Wei Ming Ong", 999: "Organiser" };
await db.query(
  `insert into auth.users (id, email) select ('00000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid, 'p' || n || '@example.com'
   from generate_series(1, 40) n`
);
await db.query(`insert into auth.users (id, email) values ($1, 'organiser@example.com')`, [u(999)]);
await db.query(`update profiles set role = 'admin' where id = $1`, [u(999)]);

/** Runs SQL as a given user, through the same role switch the API uses. */
async function asUser(n, sql, params = []) {
  const c = await db.connect();
  try {
    await c.query("begin");
    await c.query("set local role authenticated");
    await c.query("select set_config('request.jwt.claim.sub', $1, true)", [u(n)]);
    const r = await c.query(sql, params);
    await c.query("commit");
    return r;
  } catch (e) {
    await c.query("rollback");
    throw e;
  } finally {
    c.release();
  }
}
const eventId = (await db.query("select id from events where is_active")).rows[0].id;
const POS = ["setter", "outside_hitter", "opposite", "middle_blocker", "libero", "utility"];
async function registerViaSql(n) {
  await asUser(
    n,
    `select register_player($1, $2, $3, $4, null, null, $5, $6, null, null, false, true, true, null)`,
    [eventId, `Player${n} Koh`, `Player${n}`, `9000${String(n).padStart(4, "0")}`, 2005 + (n % 10), POS[n % 6]]
  );
}

// ---------------------------------------------------------------- servers
function start(cmd, args, env, ready) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { cwd: ROOT, env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"], detached: true });
    procs.push(p);
    let out = "";
    const onData = (d) => {
      out += d;
      if (out.includes(ready)) resolve(p);
    };
    p.stdout.on("data", onData);
    p.stderr.on("data", (d) => {
      out += d;
      process.stderr.write(`[${path.basename(args[0] ?? cmd)}] ${d}`);
    });
    p.on("exit", (code) => reject(new Error(`${cmd} exited ${code}\n${out}`)));
    setTimeout(() => reject(new Error(`${cmd} did not start\n${out}`)), 60000);
  });
}

function cleanup() {
  // Kill whole process groups: `npx next start` spawns the real server as a child.
  for (const p of procs) {
    try {
      process.kill(-p.pid, "SIGTERM");
    } catch {}
  }
}
process.on("exit", cleanup);

await start("node", ["tests/e2e/fake-supabase.mjs"], { DATABASE_URL, FAKE_SUPABASE_PORT: String(SUPA_PORT) }, "fake supabase on");
await start("npx", ["next", "start", "-p", String(APP_PORT), "-H", "127.0.0.1"], {
  NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${SUPA_PORT}`,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "test-anon-key",
  NEXT_PUBLIC_SITE_URL: APP,
}, "Ready");

// ---------------------------------------------------------------- browser
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await context.newPage();
page.on("dialog", (d) => d.accept());
const consoleErrors = [];
page.on("pageerror", (e) => consoleErrors.push(e.message));

function sessionCookie(n) {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const email = n === 999 ? "organiser@example.com" : `p${n}@example.com`;
  const exp = Math.floor(Date.now() / 1000) + 3600 * 24;
  const token = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: u(n), email, role: "authenticated", aud: "authenticated", exp })}.sig`;
  const user = { id: u(n), aud: "authenticated", role: "authenticated", email, app_metadata: {}, user_metadata: {}, created_at: new Date(0).toISOString() };
  const session = { access_token: token, refresh_token: "r", token_type: "bearer", expires_in: 86400, expires_at: exp, user };
  return { name: "sb-127-auth-token", value: "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url"), url: APP };
}

async function signInAs(n) {
  await context.clearCookies();
  if (n !== null) await context.addCookies([sessionCookie(n)]);
}

async function go(p) {
  const res = await page.goto(APP + p, { waitUntil: "networkidle" });
  assert(res.ok() || res.status() === 304, `${p} → HTTP ${res.status()}`);
}

async function shot(name) {
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true });
}

async function noHorizontalScroll(where) {
  const [sw, iw] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
  assert(sw <= iw, `${where}: page is ${sw}px wide on a ${iw}px screen`);
}

/** Visible page text, upper-cased (innerText applies CSS text-transform, so compare case-insensitively). */
async function text() {
  return (await page.locator("body").innerText()).toUpperCase();
}

/** Clicks a submit button and waits for the server action (and any redirect) to land. */
async function submitAndWait(button, expectPath) {
  await Promise.all([
    page.waitForResponse((r) => r.request().method() === "POST", { timeout: 15000 }),
    button.click(),
  ]);
  if (expectPath) {
    await page.waitForURL((url) => expectPath.test(url.pathname + url.search), { waitUntil: "commit", timeout: 15000 });
  }
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(400);
}

let teamId;

try {
  log("Visitor");
  await signInAs(null);
  await check("home shows the event, slots and the three actions", async () => {
    await go("/");
    const t = await text();
    for (const s of ["FIND YOUR TEAM", "21 November 2026", "9:00am–2:00pm", "4-Way Round Robin", "2 Alumni Teams", "Min 10 · Max 12", "Mixed Batches Welcome", "NO TEAM?", "Create a Team", "Join a Team", "I Don’t Have a Team", "Reconnect. Compete. Support the next generation."]) {
      assert(t.toUpperCase().includes(s.toUpperCase()), `missing "${s}"`);
    }
    assert(/2\s*OPEN ALUMNI TEAM SLOTS LEFT/i.test(t), "slot banner should say 2 left");
    await noHorizontalScroll("home");
    await shot("01-home");
  });
  await check("create team requires sign in", async () => {
    await go("/teams/new");
    assert(page.url().includes("/login?next=%2Fteams%2Fnew"), `went to ${page.url()}`);
    assert((await text()).includes("Continue with Google".toUpperCase()), "login page shows Google");
    await shot("02-login");
  });

  log("Captain registers and creates a team");
  await signInAs(1);
  await check("registration form saves a player", async () => {
    await go("/teams/new");
    assert(page.url().includes("/register"), "unregistered captain is sent to registration");
    await page.fill('input[name="full_name"]', names[1]);
    await page.fill('input[name="mobile"]', "9123 4567");
    await page.fill('input[name="grad_year"]', "2008");
    await page.locator("label", { hasText: /^Setter$/ }).click();
    await page.selectOption('select[name="secondary_position"]', "opposite");
    await page.locator("label", { hasText: "No — put me in the Player Pool" }).click();
    await page.fill('textarea[name="note"]', "Usually set, can cover opposite.");
    await noHorizontalScroll("register");
    await shot("03-register");
    await submitAndWait(page.getByRole("button", { name: "Register" }), /^\/teams\/new$/);
  });
  await check("create team shows the slot disclaimer and creates a room", async () => {
    assert((await text()).includes("Creating a team does not secure a competition slot.".toUpperCase()), "disclaimer shown");
    await page.fill('input[name="name"]', "XMS Legends");
    await page.fill('input[name="approx_batch"]', "2008–2011");
    await page.getByLabel("More Setter").click();
    await page.getByLabel("More Middle Blocker").click();
    await page.getByLabel("More Utility / Flexible").click();
    await page.getByLabel("More Utility / Flexible").click();
    await page.fill('textarea[name="description"]', "Mostly 2008–2011 batch but happy for anyone to join.");
    await page.check('input[name="acknowledge"]');
    await shot("04-create-team");
    await submitAndWait(page.getByRole("button", { name: "Create Team Room" }), /\/manage/);
    const m = page.url().match(/\/teams\/([0-9a-f-]{36})\/manage/);
    assert(m, `expected manage page, got ${page.url()}`);
    teamId = m[1];
    const t = await text();
    assert(t.includes("Team room created!".toUpperCase()), "created notice");
    assert(t.includes("/join/".toUpperCase()), "invite link shown");
    await noHorizontalScroll("manage");
    await shot("05-manage-new");
  });
  await check("team room shows captain, count, needs and roster", async () => {
    await go(`/teams/${teamId}`);
    const t = await text();
    for (const s of ["XMS LEGENDS", "Marcus", "1 / 12", "1 Setter", "1 Middle Blocker", "2 Flexible Players", "LOOKING FOR PLAYERS", "OPEN FOR RECRUITMENT", "2008"]) {
      assert(t.toUpperCase().includes(s.toUpperCase()), `missing "${s}"`);
    }
    await shot("06-team-room");
  });

  log("Player requests to join; captain accepts");
  await signInAs(2);
  await check("player registers and requests to join from the team list", async () => {
    await go("/register");
    await page.fill('input[name="full_name"]', names[2]);
    await page.fill('input[name="mobile"]', "8765 4321");
    await page.fill('input[name="grad_year"]', "2009");
    await page.locator("label", { hasText: /^Outside Hitter$/ }).click();
    await page.locator("label", { hasText: "No — put me in the Player Pool" }).click();
    await submitAndWait(page.getByRole("button", { name: "Register" }), /^\/me/);
    await go("/teams");
    await shot("07-team-list");
    await page.getByRole("link", { name: "Join Team" }).first().click();
    await page.waitForURL(/\/teams\/[0-9a-f-]{36}/, { waitUntil: "commit" });
    await page.getByRole("button", { name: "Request to Join" }).waitFor();
    await page.fill('textarea[name="message"]', "Usually play OH but can cover opposite.");
    await submitAndWait(page.getByRole("button", { name: "Request to Join" }));
    const t = await text();
    assert(t.includes("Request sent!".toUpperCase()) || t.includes("Request pending".toUpperCase()), "request confirmation");
    assert(t.includes("1 / 12".toUpperCase()), "request does not add the player automatically");
  });
  await check("anonymous visitors can't see contact numbers", async () => {
    await signInAs(null);
    await go(`/teams/${teamId}`);
    const html = await page.content();
    assert(!html.includes("8765") && !html.includes("9123 4567"), "phone numbers leaked on public page");
    await go("/pool");
    assert(!(await page.content()).includes("8765"), "phone number leaked in pool");
  });
  await signInAs(1);
  await check("captain sees the request with contact and accepts", async () => {
    await go(`/teams/${teamId}/manage`);
    let t = await text();
    assert(t.includes("Join requests (1)".toUpperCase()), "request listed");
    assert(t.includes("8765 4321".toUpperCase()), "captain can see requester's contact");
    await shot("08-join-request");
    await submitAndWait(page.getByRole("button", { name: "Accept" }));
    t = await text();
    assert(t.includes("Join requests (0)".toUpperCase()), "request cleared");
    assert(t.includes("2 / 12".toUpperCase()), "count updated to 2");
  });

  log("Player Pool invitation");
  await signInAs(3);
  await check("free agent registers into the pool", async () => {
    await go("/register");
    await page.fill('input[name="full_name"]', names[3]);
    await page.fill('input[name="mobile"]', "9000 0003");
    await page.fill('input[name="grad_year"]', "2012");
    await page.locator("label", { hasText: /^Middle Blocker$/ }).click();
    await page.locator("label", { hasText: "No — put me in the Player Pool" }).click();
    await submitAndWait(page.getByRole("button", { name: "Register" }), /^\/me/);
    await go("/pool");
    assert((await text()).includes("Wei".toUpperCase()), "free agent visible in pool");
  });
  await signInAs(1);
  await check("captain invites a matching pool player", async () => {
    await go("/pool");
    const card = page.locator("article", { hasText: "Wei" });
    assert((await card.innerText()).includes("Class of 2012"), "card shows year");
    await shot("09-pool-captain");
    await submitAndWait(card.getByRole("button", { name: /Invite to XMS Legends/ }));
    assert((await page.locator("article", { hasText: "Wei" }).innerText()).toUpperCase().includes("INVITED"), "shows invited");
  });
  await signInAs(3);
  await check("player accepts the invitation and leaves the pool", async () => {
    await go("/me");
    const t = await text();
    assert(t.includes("Invitations (1)".toUpperCase()) && t.includes("XMS LEGENDS".toUpperCase()) || t.toUpperCase().includes("XMS LEGENDS"), "invitation shown");
    await shot("10-my-lobby-invite");
    await submitAndWait(page.getByRole("button", { name: "Accept" }).first());
    await go("/pool");
    assert(!(await text()).includes("Wei Ming".toUpperCase()), "player removed from pool");
    await go(`/teams/${teamId}`);
    assert((await text()).includes("3 / 12".toUpperCase()), "roster shows 3");
  });
  await check("player on a team can't request another", async () => {
    await registerViaSql(30);
    const other = (await asUser(30, `select create_team($1, 'Other Team', null, null, true, 1, null) as id`, [eventId])).rows[0].id;
    await go(`/teams/${other}`);
    assert((await text()).includes("You’re already on another team".toUpperCase()), "blocked with explanation");
  });

  log("Submit, approve, confirm");
  for (let n = 4; n <= 10; n++) {
    await registerViaSql(n);
    const r = await asUser(n, `select request_to_join($1, null) as id`, [teamId]);
    await asUser(1, `select respond_join_request($1, true)`, [r.rows[0].id]);
  }
  await signInAs(1);
  await check("captain submits with 10 players", async () => {
    await go(`/teams/${teamId}/manage`);
    assert((await text()).includes("10 / 12".toUpperCase()), "10 players");
    await submitAndWait(page.getByRole("button", { name: "Submit for Approval" }));
    const t = await text();
    assert(t.includes("SUBMITTED — THE ORGANISER IS REVIEWING YOUR TEAM"), "submitted state shown");
    await go(`/teams/${teamId}`);
    assert((await text()).toUpperCase().includes("PENDING ADMIN APPROVAL"), "status pending approval");
  });
  await signInAs(2);
  await check("non-organiser can't open the dashboard", async () => {
    await page.goto(APP + "/admin", { waitUntil: "networkidle" });
    const t = await text();
    assert(t.includes("COULDN’T FIND THAT PAGE") && !t.includes("ORGANISER DASHBOARD"), "admin content hidden");
  });
  await signInAs(999);
  await check("organiser dashboard shows counts and the queue", async () => {
    await go("/admin");
    const t = await text();
    assert(t.includes("Needs your attention (1)".toUpperCase()), "team in queue");
    assert(/REGISTERED PLAYERS/i.test(t), "player count");
    await noHorizontalScroll("admin");
    await shot("11-admin");
  });
  await check("organiser approves & confirms; slot count drops", async () => {
    await go(`/admin/teams/${teamId}`);
    assert((await text()).includes("8765 4321".toUpperCase()), "organiser sees contacts");
    await shot("12-admin-team");
    await submitAndWait(page.getByRole("button", { name: "✅ Approve & Confirm" }));
    assert((await text()).includes("✅ CONFIRMED"), "confirmed status shown");
    await go("/");
    const t = await text();
    assert(/1\s*OPEN ALUMNI TEAM SLOT LEFT/i.test(t), "1 slot left on home page");
    await go(`/teams/${teamId}`);
    assert((await text()).toUpperCase().includes("TEAM CONFIRMED"), "confirmed badge");
    await shot("13-team-confirmed");
  });
  await check("organiser searches players by position and year", async () => {
    await go("/admin/players?pos=setter");
    let t = await text();
    assert(t.includes("Marcus Lim".toUpperCase()), "setter filter finds Marcus");
    await go("/admin/players?year=2012");
    t = await text();
    assert(t.includes("Wei Ming Ong".toUpperCase()) && !t.includes("Marcus Lim".toUpperCase()), "year filter");
  });
  await check("CSV export contains the roster", async () => {
    const res = await page.request.get(APP + "/admin/export");
    assert(res.ok(), `export HTTP ${res.status()}`);
    const csv = await res.text();
    assert(csv.includes("XMS Legends") && csv.includes("Marcus Lim") && csv.includes("Captain"), "roster rows");
  });

  log("Capacity");
  await check("a full team's Join button is disabled", async () => {
    const full = (await asUser(30, `select id from teams where name = 'Other Team'`)).rows[0].id;
    for (let n = 11; n <= 21; n++) {
      await registerViaSql(n);
      const r = await asUser(n, `select request_to_join($1, null) as id`, [full]);
      await asUser(30, `select respond_join_request($1, true)`, [r.rows[0].id]);
    }
    await registerViaSql(22);
    await signInAs(22);
    await go("/teams");
    const card = page.locator("article", { hasText: "Other Team" });
    assert((await card.innerText()).toUpperCase().includes("FULL"), "status Full");
    assert(await card.getByRole("button", { name: "Team full" }).isDisabled(), "disabled button");
    let blocked = false;
    try {
      await asUser(22, `select request_to_join($1, null)`, [full]);
    } catch (e) {
      blocked = /full/i.test(e.message);
    }
    assert(blocked, "database refuses a 13th player");
  });

  log("Every page renders on a phone");
  for (const [n, p] of [[null, "/rules"], [999, "/admin/teams"], [999, "/admin/players"], [999, "/admin/settings"], [1, "/me"], [1, `/teams/${teamId}/manage`]]) {
    await signInAs(n);
    await check(`${p} has no sideways scrolling`, async () => {
      await go(p);
      await noHorizontalScroll(p);
      await shot(`page-${p.replace(/[^a-z0-9]+/gi, "-")}`);
    });
  }

  await check("no client-side errors", async () => {
    assert(consoleErrors.length === 0, consoleErrors.join("\n"));
  });
} finally {
  await browser.close();
  await db.end();
  cleanup();
}

log(failures ? `\n${failures} check(s) failed. Screenshots in tests/.artifacts/` : "\nAll end-to-end checks passed.");
process.exit(failures ? 1 : 0);

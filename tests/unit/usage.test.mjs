// Anonymous usage counts: only known milestone names, JSON only, a per-visitor cap, daily totals, admin-only reads.
import { d1 } from "../helpers/cfmock.mjs";
const F = new URL("../../functions/", import.meta.url).pathname;
const usage = await import(F + "api/usage.js");
let pass = 0, failN = 0; const ok = (c, m) => { if (c) pass++; else { failN++; console.log("FAIL:", m); } };
const env = { DB: d1(), ADMIN_KEY: "k" };
const post = (body, { ip = "1.1.1.1", type = "application/json" } = {}) => usage.onRequestPost({ env, request: new Request("https://fishr.monster/api/usage", { method: "POST", headers: { "content-type": type, "cf-connecting-ip": ip }, body: JSON.stringify(body) }) });
const get = key => usage.onRequestGet({ env, request: new Request("https://fishr.monster/api/usage", { headers: key ? { "x-admin-key": key } : {} }) });

let r = await post({ event: "open" }); ok(r.status === 200, "known milestone accepted");
for (const ev of ["trip1", "trip1", "ask"]) await post({ event: ev }, { ip: "2.2.2.2" });
r = await post({ event: "steal-data" }); ok(r.status === 400, "unknown milestone rejected");
r = await post({ event: { $gt: 1 } }); ok(r.status === 400, "non-text milestone rejected");
r = await post({ event: "open" }, { type: "text/plain" }); ok(r.status === 415, "plain form posts rejected");
r = await get(); ok(r.status === 403, "reading counts needs the admin key");
r = await get("wrong"); ok(r.status === 403, "wrong key refused");
r = await get("k"); let d = await r.json();
ok(r.status === 200 && d.totals.open === 1 && d.totals.trip1 === 2 && d.totals.ask === 1 && d.last30.trip1 === 2, "daily totals add up " + JSON.stringify(d.totals));
// Only totals are stored: no IP, no ID, nothing else.
const cols = env.DB._sql.prepare("PRAGMA table_info(usage_counts)").all().map(c => c.name);
ok(cols.join() === "day,event,n", "the table holds only day, milestone and count: " + cols.join());
// One visitor can't inflate the numbers past 60 reports a day.
for (let i = 0; i < 80; i++) await post({ event: "active" }, { ip: "3.3.3.3" });
d = await (await get("k")).json();
ok(d.totals.active === 60, "per-visitor cap: 80 reports count as 60 " + d.totals.active);
ok(Array.isArray(d.days) && d.days.every(x => x.event === "active") && d.days[0].n === 60, "weekly chart data: daily 'active' totals");
// Since a chosen time, by the hour: only later hours count; the hourly table holds only hour, milestone and count.
const getSince = since => usage.onRequestGet({ env, request: new Request(`https://fishr.monster/api/usage?since=${encodeURIComponent(since)}`, { headers: { "x-admin-key": "k" } }) });
env.DB._sql.prepare("INSERT INTO usage_hourly (hour, event, n) VALUES ('2020-01-01T05', 'open', 7)").run(); // long before
d = await (await getSince(new Date(Date.now() - 36e5).toISOString())).json();
ok(d.since.open === 1 && d.since.trip1 === 2 && d.since.ask === 1 && d.hourlyFrom === "2020-01-01T05", "since an hour ago: this session's counts only " + JSON.stringify(d.since));
d = await (await getSince("2020-01-01T04:30:00Z")).json();
ok(d.since.open === 8, "since before the old hour: it counts too " + d.since.open);
d = await (await get("k")).json();
ok(d.since === undefined, "no since: no since counts");
ok(env.DB._sql.prepare("PRAGMA table_info(usage_hourly)").all().map(c => c.name).join() === "hour,event,n", "hourly table holds only hour, milestone and count");
// No database bound: the app still works.
r = await usage.onRequestPost({ env: {}, request: new Request("https://fishr.monster/api/usage", { method: "POST", headers: { "content-type": "application/json" }, body: '{"event":"open"}' }) });
ok(r.status === 200, "no database: quietly ignored");
console.log(`${pass} passed, ${failN} failed`);

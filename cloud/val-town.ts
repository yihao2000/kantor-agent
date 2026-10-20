// Kantor Agent relay: an HTTP val on Val Town.
// Every Claude Code session (on your Mac or in the cloud) reports itself here,
// and the 3D office reads the list back. The secret key lives in the val's
// environment variable KANTOR_KEY, never in this code.
import { blob } from "https://esm.town/v/std/blob/main.ts";

const KEY = Deno.env.get("KANTOR_KEY") ?? "";
const PREFIX = "kantor_s_";
/** Names you gave and people you sent home, keyed "<sid>:<agent id>". */
const META = "kantor_meta";
type Meta = { names: Record<string, string>; hidden: Record<string, number> };
const readMeta = async (): Promise<Meta> => {
  const m = (await blob.getJSON(META)) ?? {};
  return { names: m.names ?? {}, hidden: m.hidden ?? {} };
};
/** A session that has not reported for this long leaves the office. */
const ALIVE_MS = 30 * 60_000;
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type",
};
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: CORS });
const clip = (v: unknown, n: number) => String(v ?? "").slice(0, n);

export default async function (req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  const url = new URL(req.url);
  if (!KEY) return json({ error: "KANTOR_KEY belum diisi di Env vars val ini" }, 500);
  if (url.searchParams.get("key") !== KEY) return json({ error: "kunci salah" }, 401);
  const now = Date.now();

  if (req.method === "POST") {
    const body = await req.json().catch(() => null);
    if (body?.op === "meta") {
      const key = clip(body.key, 170);
      if (!key) return json({ error: "key kosong" }, 400);
      const meta = await readMeta();
      if (typeof body.name === "string") {
        const name = body.name.trim().slice(0, 24);
        if (name) meta.names[key] = name;
        else delete meta.names[key];
      }
      if (body.hidden === true) meta.hidden[key] = now;
      if (body.hidden === false) delete meta.hidden[key];
      await blob.setJSON(META, meta);
      return json({ ok: true, meta });
    }
    const sid = clip(body?.sid, 80).replace(/[^\w-]/g, "");
    if (!sid) return json({ error: "sid kosong" }, 400);
    if (body.gone) {
      await blob.delete(PREFIX + sid);
      return json({ ok: true });
    }
    const agents = (Array.isArray(body.agents) ? body.agents : []).slice(0, 20).map((a: Record<string, unknown>) => ({
      id: clip(a.id, 80),
      name: clip(a.name, 30),
      status: a.status === "working" ? "working" : "idle",
      task: clip(a.task, 80),
      tool: clip(a.tool, 60),
      used: clip(a.used, 60),
      since: typeof a.since === "number" ? a.since : 0,
      ended: typeof a.ended === "number" ? a.ended : 0,
    }));
    await blob.setJSON(PREFIX + sid, { sid, label: clip(body.label, 40), from: clip(body.from, 10), agents, at: now });
    return json({ ok: true, at: now });
  }

  const sessions = [];
  for (const item of await blob.list(PREFIX)) {
    const k = typeof item === "string" ? item : item.key;
    const s = await blob.getJSON(k);
    if (!s || now - s.at > ALIVE_MS) {
      await blob.delete(k);
      continue;
    }
    sessions.push(s);
  }
  return json({ at: now, sessions, meta: await readMeta() });
}

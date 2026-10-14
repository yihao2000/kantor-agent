// Kantor Agent relay: an HTTP val on Val Town.
// Every Claude Code session (on your Mac or in the cloud) reports itself here,
// and the 3D office reads the list back. Set KANTOR_KEY in the val's environment
// variables, or replace the fallback below with your own secret.
import { blob } from "https://esm.town/v/std/blob/main.ts";

const KEY = Deno.env.get("KANTOR_KEY") ?? "GANTI-DENGAN-KUNCI-RAHASIA";
const PREFIX = "kantor_s_";
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
  if (url.searchParams.get("key") !== KEY) return json({ error: "kunci salah" }, 401);
  const now = Date.now();

  if (req.method === "POST") {
    const body = await req.json().catch(() => null);
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
  return json({ at: now, sessions });
}

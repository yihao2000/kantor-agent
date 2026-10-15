// The office: who is where, and the isometric pixel SVG that draws it.
// Pure functions only; the hooks module owns $ and the state.
import type { KantorAgent, KantorOffice, KantorRemote } from '../types'

export type Pt = [number, number]
type Pose = 'walkF' | 'walkB' | 'standF' | 'standB' | 'sit'

/* ---------------- world ---------------- */
export const W = 11
export const D = 9
const SPEED = 1.5 // grid units per second
export const CHEER_MS = 2600
const IDLE_FORGET_MS = 5 * 60 * 1000
const ENTRANCE: Pt = [4.25, 8.95]

const DESK_X = [1.0, 3.2, 5.4]
const DESK_Z = [1.3, 4.6]
export const DESKS = 6
function deskAt(i: number): Pt { return [DESK_X[i % 3], DESK_Z[Math.floor(i / 3)]] }
function seatOf(i: number): Pt { const [x, z] = deskAt(i); return [x + 1.28, z + 0.65] }
function deskFront(i: number): Pt { const [x, z] = deskAt(i); return [x + 1.3, z + 1.62] }
function cheerSpot(i: number): Pt { const [x, z] = deskAt(i); return [x + 1.95, z + 1.65] }

type Poi = { p: Pt; pose: Pose; stay: number }
const POI: Record<string, Poi> = {
  coffee: { p: [8.6, 1.15], pose: 'standB', stay: 7 },
  fridge: { p: [10.35, 1.25], pose: 'standB', stay: 5 },
  win1: { p: [5.6, 0.8], pose: 'standB', stay: 8 },
  win2: { p: [6.7, 0.8], pose: 'standB', stay: 6 },
  board: { p: [0.75, 3.4], pose: 'standB', stay: 7 },
  shelf: { p: [0.85, 6.75], pose: 'standB', stay: 6 },
  water: { p: [0.9, 8.35], pose: 'standB', stay: 5 },
  seat1: { p: [8.9, 6.62], pose: 'sit', stay: 10 },
  seat2: { p: [9.9, 6.62], pose: 'sit', stay: 9 },
  plant: { p: [10.55, 7.8], pose: 'standF', stay: 5 },
  stretch: { p: [7.6, 3.6], pose: 'standF', stay: 4 },
}
const LOOPS: string[][] = [
  ['win1', 'coffee', 'seat1', 'board'],
  ['shelf', 'water', 'win2', 'fridge'],
  ['coffee', 'seat2', 'plant', 'win1'],
  ['board', 'shelf', 'fridge', 'seat2'],
  ['water', 'win2', 'stretch', 'seat1'],
  ['plant', 'fridge', 'board', 'water'],
]

/* ---------------- pathfinding on a half-tile grid ---------------- */
const BLOCKS: [number, number, number, number][] = [
  ...[0, 1, 2, 3, 4, 5].map(i => { const [x, z] = deskAt(i); return [x - 0.05, z - 0.05, x + 1.7, z + 1.35] as [number, number, number, number] }),
  [8.1, 0, 11, 0.85], // counter + fridge
  [8.1, 6.0, 10.9, 7.05], // sofa
  [8.7, 7.5, 10.3, 8.3], // table
  [0, 5.9, 0.5, 7.6], // shelf
  [0, 8.1, 0.55, 8.75], // water
  [10.15, 8.15, 10.65, 8.65], [0, 0, 0.5, 0.5], [7.2, 0, 7.7, 0.5], // plants
  [10.7, 5.3, 11, 5.7], // lamp
]
const GW2 = W * 2, GD2 = D * 2
const open: boolean[] = []
for (let i = 0; i < GW2; i++) for (let j = 0; j < GD2; j++) {
  const x = i * 0.5 + 0.25, z = j * 0.5 + 0.25, e = 0.1
  let ok = x > 0.3 && x < W - 0.25 && z > 0.3 && z < D - 0.25
  for (const [x0, z0, x1, z1] of BLOCKS) if (x > x0 - e && x < x1 + e && z > z0 - e && z < z1 + e) ok = false
  open[i * GD2 + j] = ok
}
const isOpen = (i: number, j: number) => i >= 0 && j >= 0 && i < GW2 && j < GD2 && open[i * GD2 + j]
const cellOf = (p: Pt): Pt => [Math.min(GW2 - 1, Math.max(0, Math.floor(p[0] * 2))), Math.min(GD2 - 1, Math.max(0, Math.floor(p[1] * 2)))]
function nearestOpen(p: Pt): Pt {
  const [ci, cj] = cellOf(p)
  if (isOpen(ci, cj)) return [ci, cj]
  let best: Pt = [ci, cj], bd = Infinity
  for (let i = 0; i < GW2; i++) for (let j = 0; j < GD2; j++) if (isOpen(i, j)) {
    const d = (i * 0.5 + 0.25 - p[0]) ** 2 + (j * 0.5 + 0.25 - p[1]) ** 2
    if (d < bd) { bd = d; best = [i, j] }
  }
  return best
}
const routeCache = new Map<string, Pt[]>()
/** Walkable polyline from a to b in grid units: a, the corridor cells between, b. */
export function route(a: Pt, b: Pt): Pt[] {
  const k = a.join(',') + '>' + b.join(',')
  const hit = routeCache.get(k)
  if (hit) return hit
  const [si, sj] = nearestOpen(a), [gi, gj] = nearestOpen(b)
  const key = (i: number, j: number) => i * GD2 + j
  const g = new Map<number, number>([[key(si, sj), 0]]), came = new Map<number, number>(), closed = new Set<number>()
  const openL: { i: number; j: number; f: number }[] = [{ i: si, j: sj, f: 0 }]
  const h = (i: number, j: number) => { const di = Math.abs(i - gi), dj = Math.abs(j - gj); return Math.max(di, dj) + 0.414 * Math.min(di, dj) }
  let cells: Pt[] = []
  while (openL.length) {
    let bi = 0
    for (let n = 1; n < openL.length; n++) if (openL[n].f < openL[bi].f) bi = n
    const cur = openL.splice(bi, 1)[0], ck = key(cur.i, cur.j)
    if (closed.has(ck)) continue
    closed.add(ck)
    if (cur.i === gi && cur.j === gj) {
      let c: number | undefined = ck
      while (c !== undefined) { cells.push([Math.floor(c / GD2), c % GD2]); c = came.get(c) }
      cells = cells.reverse()
      break
    }
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const ni = cur.i + di, nj = cur.j + dj
      if (!isOpen(ni, nj)) continue
      if (di && dj && (!isOpen(cur.i + di, cur.j) || !isOpen(cur.i, cur.j + dj))) continue
      const nk = key(ni, nj)
      if (closed.has(nk)) continue
      const ng = (g.get(ck) ?? 0) + (di && dj ? 1.414 : 1)
      if (ng < (g.get(nk) ?? Infinity)) { g.set(nk, ng); came.set(nk, ck); openL.push({ i: ni, j: nj, f: ng + h(ni, nj) }) }
    }
  }
  const pts: Pt[] = [a, ...cells.map(([i, j]) => [i * 0.5 + 0.25, j * 0.5 + 0.25] as Pt), b]
  // drop points that sit on a straight line between their neighbours
  const out: Pt[] = [pts[0]]
  for (let n = 1; n < pts.length - 1; n++) {
    const p = out[out.length - 1], q = pts[n], r = pts[n + 1]
    const cross = (q[0] - p[0]) * (r[1] - q[1]) - (q[1] - p[1]) * (r[0] - q[0])
    if (Math.abs(cross) > 1e-6) out.push(q)
  }
  out.push(pts[pts.length - 1])
  const clean = out.filter((p, n) => n === 0 || Math.hypot(p[0] - out[n - 1][0], p[1] - out[n - 1][1]) > 1e-6)
  routeCache.set(k, clean)
  return clean
}
const lenOf = (pts: Pt[]) => pts.reduce((s, p, n) => n ? s + Math.hypot(p[0] - pts[n - 1][0], p[1] - pts[n - 1][1]) : 0, 0)
const walkMs = (pts: Pt[]) => Math.max(300, (lenOf(pts) / SPEED) * 1000)
function along(pts: Pt[], frac: number): Pt {
  const total = lenOf(pts)
  let left = Math.max(0, Math.min(1, frac)) * total
  for (let n = 1; n < pts.length; n++) {
    const s = Math.hypot(pts[n][0] - pts[n - 1][0], pts[n][1] - pts[n - 1][1])
    if (left <= s || n === pts.length - 1) { const t = s ? Math.min(1, left / s) : 1; return [pts[n - 1][0] + (pts[n][0] - pts[n - 1][0]) * t, pts[n - 1][1] + (pts[n][1] - pts[n - 1][1]) * t] }
    left -= s
  }
  return pts[pts.length - 1]
}

/* ---------------- wander loops ---------------- */
type Key = { t: number; p: Pt; pose: Pose }
type Loop = { keys: Key[]; dur: number; start: Pt }
const loopCache = new Map<number, Loop>()
export function loopOf(idx: number): Loop {
  const n = ((idx % LOOPS.length) + LOOPS.length) % LOOPS.length
  const hit = loopCache.get(n)
  if (hit) return hit
  const stops = LOOPS[n].map(k => POI[k])
  const keys: Key[] = []
  let t = 0
  stops.forEach((s, i) => {
    keys.push({ t, p: s.p, pose: s.pose })
    t += s.stay * 1000
    keys.push({ t, p: s.p, pose: s.pose })
    const next = stops[(i + 1) % stops.length]
    const path = route(s.p, next.p)
    for (let k = 1; k < path.length - 1; k++) {
      t += (Math.hypot(path[k][0] - path[k - 1][0], path[k][1] - path[k - 1][1]) / SPEED) * 1000
      keys.push({ t, p: path[k], pose: 'walkF' })
    }
    t += (Math.hypot(next.p[0] - path[path.length - 2][0], next.p[1] - path[path.length - 2][1]) / SPEED) * 1000
  })
  keys.push({ t, p: stops[0].p, pose: stops[0].pose })
  const loop = { keys, dur: t, start: stops[0].p }
  loopCache.set(n, loop)
  return loop
}
/** The pose held from key k to key k+1. */
function poseBetween(a: Key, b: Key): Pose {
  if (a.p[0] === b.p[0] && a.p[1] === b.p[1]) return a.pose === 'walkF' ? 'standF' : a.pose
  return b.p[0] + b.p[1] >= a.p[0] + a.p[1] ? 'walkF' : 'walkB'
}
function loopPos(loop: Loop, ms: number): Pt {
  const t = ((ms % loop.dur) + loop.dur) % loop.dur
  for (let k = 1; k < loop.keys.length; k++) {
    const a = loop.keys[k - 1], b = loop.keys[k]
    if (t <= b.t) { const f = b.t > a.t ? (t - a.t) / (b.t - a.t) : 1; return [a.p[0] + (b.p[0] - a.p[0]) * f, a.p[1] + (b.p[1] - a.p[1]) * f] }
  }
  return loop.start
}

/* ---------------- agent state ---------------- */
export const LOOKS = [
  { shirt: '#e07a4f', hair: '#3a2a22', skin: '#f1c9a5', extra: 'headset' },
  { shirt: '#4f8fd9', hair: '#1f1b18', skin: '#d9a77e', extra: 'glasses' },
  { shirt: '#5fb87a', hair: '#7a4a2a', skin: '#eec19a', extra: 'long' },
  { shirt: '#b07ad9', hair: '#2b2b2b', skin: '#c68e65', extra: '' },
  { shirt: '#e2b33f', hair: '#4a2f22', skin: '#e7b98f', extra: 'glasses' },
  { shirt: '#d9607e', hair: '#1f1b18', skin: '#f1c9a5', extra: 'long' },
]
export const MAIN = 'main'

function blank(id: string, name: string, look: number, desk: number, now: number): KantorAgent {
  return { id, name, task: '', tool: '', tools: 0, look, desk, status: 'idle', loopIdx: Math.max(0, desk), fromX: 0, fromZ: 0, moveAt: 0, arriveAt: 0, leftDeskAt: 0, loopStart: now, startedAt: now, endedAt: now }
}
export function emptyOffice(now: number): KantorOffice {
  return { agents: [blank(MAIN, 'Claude', 0, 0, now)], seq: 1 }
}
const copy = (o: KantorOffice): KantorOffice => ({ ...o, agents: o.agents.map(a => ({ ...a })) })

/** Where an agent stands at time now, in grid units. */
export function posOf(a: KantorAgent, now: number): Pt {
  if (a.desk < 0) return loopPos(loopOf(a.loopIdx), now - a.loopStart)
  if (a.status === 'working') {
    if (now >= a.arriveAt) return seatOf(a.desk)
    const path = arrivePath(a)
    return along(path, (now - a.moveAt) / Math.max(1, a.arriveAt - a.moveAt))
  }
  if (a.leftDeskAt && now < a.leftDeskAt + CHEER_MS) return cheerSpot(a.desk)
  if (now < a.loopStart) {
    const path = leavePath(a)
    return along(path, (now - a.leftDeskAt - CHEER_MS) / Math.max(1, a.loopStart - a.leftDeskAt - CHEER_MS))
  }
  return loopPos(loopOf(a.loopIdx), now - a.loopStart)
}
function arrivePath(a: KantorAgent): Pt[] {
  const r = route([a.fromX, a.fromZ], deskFront(a.desk))
  return [...r, seatOf(a.desk)]
}
function leavePath(a: KantorAgent): Pt[] { return route(cheerSpot(a.desk), loopOf(a.loopIdx).start) }

export function nameForType(type: string): string {
  const t = type.split(':').pop() || type
  if (t === 'general-purpose') return 'Umum'
  const s = t.replace(/[-_]+/g, ' ').trim()
  return (s.charAt(0).toUpperCase() + s.slice(1)).slice(0, 12) || 'Agent'
}

export function startWork(o: KantorOffice, id: string, task: string, now: number, from?: Pt): KantorOffice {
  const n = copy(o)
  const a = n.agents.find(x => x.id === id)
  if (!a) return o
  if (task) a.task = task
  if (a.status === 'working') return n
  const p = from ?? posOf(a, now)
  a.status = 'working'; a.tool = ''; a.used = ''; a.startedAt = now
  a.fromX = p[0]; a.fromZ = p[1]; a.moveAt = now
  a.arriveAt = a.desk < 0 ? now : now + walkMs(arrivePath(a))
  return n
}
export function endWork(o: KantorOffice, id: string, now: number): KantorOffice {
  const a0 = o.agents.find(x => x.id === id)
  if (!a0 || a0.status !== 'working') return o
  const n = copy(o)
  const a = n.agents.find(x => x.id === id)!
  a.status = 'idle'; a.tool = ''; a.endedAt = now
  if (a.desk < 0) { a.loopStart = now; return n }
  a.leftDeskAt = now
  a.loopStart = now + CHEER_MS + walkMs(leavePath(a))
  return n
}
export function noteTool(o: KantorOffice, id: string, label: string, now: number): KantorOffice {
  const a0 = o.agents.find(x => x.id === id)
  if (!a0 || (a0.tool === label && a0.status === 'working')) return o
  let n = a0.status === 'working' ? copy(o) : startWork(o, id, '', now)
  n = n === o ? copy(o) : n
  const a = n.agents.find(x => x.id === id)!
  a.tool = label; a.used = label; a.tools += 1
  return n
}
export function addSubagent(o: KantorOffice, id: string, type: string, task: string, now: number): KantorOffice {
  if (o.agents.some(a => a.id === id)) return startWork(o, id, task, now)
  const n = copy(o)
  const used = new Set(n.agents.map(a => a.desk))
  let desk = -1
  for (let i = 1; i < DESKS; i++) if (!used.has(i)) { desk = i; break }
  const a = blank(id, nameForType(type), 1 + ((n.seq - 1) % (LOOKS.length - 1)), desk, now)
  a.loopIdx = desk < 0 ? n.seq : desk
  n.seq += 1
  n.agents.push(a)
  return startWork(n, id, task, now, ENTRANCE)
}
/**
 * One office out of this session's agents and the other sessions' on this
 * computer: this session keeps its desks, the others take the free ones.
 */
export function mergeOffices(own: KantorOffice, remotes: KantorRemote[]): KantorOffice {
  const agents = own.agents.map(a => ({ ...a }))
  const used = new Set(agents.map(a => a.desk).filter(d => d >= 0))
  remotes.forEach((r, ri) => {
    for (const a0 of r.agents) {
      const a = { ...a0, id: `${r.sid.slice(0, 8)}:${a0.id}` }
      if (a0.id === MAIN) a.name = (r.label || `Sesi ${ri + 2}`).slice(0, 12)
      a.look = (a0.look + 1 + ri * 2) % LOOKS.length
      if (a.desk >= 0) {
        let d = -1
        for (let i = 0; i < DESKS; i++) if (!used.has(i)) { d = i; break }
        a.desk = d
        if (d >= 0) used.add(d)
        a.loopIdx = d >= 0 ? d : a.loopIdx + 3
      }
      agents.push(a)
    }
  })
  return { agents, seq: own.seq }
}

/** Forgets subagents idle for a while so their desks free up. */
export function prune(o: KantorOffice, now: number): KantorOffice {
  const keep = o.agents.filter(a => a.id === MAIN || a.status === 'working' || now - a.endedAt < IDLE_FORGET_MS)
  return keep.length === o.agents.length ? o : { ...o, agents: keep }
}

/* ---------------- drawing ---------------- */
const OX = 160, OY = 50
export const VIEW_W = 352, VIEW_H = 226
function iso(gx: number, gz: number, h = 0): Pt { return [Math.round(OX + (gx - gz) * 16), Math.round(OY + (gx + gz) * 8 - h * 16)] }
const ptsStr = (ps: Pt[]) => ps.map(p => p.join(',')).join(' ')
const poly = (ps: Pt[], fill: string, extra = '') => `<polygon points="${ptsStr(ps)}" fill="${fill}"${extra.includes('stroke=') || fill === 'none' ? '' : ` stroke="${fill}" stroke-width=".6" stroke-linejoin="round"`}${extra}/>`
function shade(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16)
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => Math.max(0, Math.min(255, Math.round(v * f))))
  return '#' + c.map(v => v.toString(16).padStart(2, '0')).join('')
}
function box(x: number, z: number, w: number, d: number, y: number, h: number, c: string): string {
  const t = y + h
  return poly([iso(x, z, t), iso(x + w, z, t), iso(x + w, z + d, t), iso(x, z + d, t)], shade(c, 1.14)) +
    poly([iso(x, z + d, y), iso(x + w, z + d, y), iso(x + w, z + d, t), iso(x, z + d, t)], c) +
    poly([iso(x + w, z, y), iso(x + w, z + d, y), iso(x + w, z + d, t), iso(x + w, z, t)], shade(c, 0.78))
}
/** A rectangle on the back wall's face (plane gz=0): gx a..b, height c..d. */
const onBack = (a: number, b: number, c: number, d: number, fill: string, extra = '') => poly([iso(a, 0, c), iso(b, 0, c), iso(b, 0, d), iso(a, 0, d)], fill, extra)
/** A rectangle on the left wall's face (plane gx=0): gz a..b, height c..d. */
const onLeft = (a: number, b: number, c: number, d: number, fill: string) => poly([iso(0, a, c), iso(0, b, c), iso(0, b, d), iso(0, a, d)], fill)
/** A rectangle on a +gx face at gx=x: gz a..b, height c..d. */
const onFaceX = (x: number, a: number, b: number, c: number, d: number, fill: string, extra = '') => poly([iso(x, a, c), iso(x, b, c), iso(x, b, d), iso(x, a, d)], fill, extra)

const SPR = (svg: string) => `<g transform="scale(1.6)">${svg}</g>`
const R = (x: number, y: number, w: number, h: number, f: string, cls = '') => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${f}"${cls ? ` class="${cls}"` : ''}/>`
const PANTS = '#3b3f5c', SHOE = '#24212c', EYE = '#1b1a24', DARK = '#2d2a3a'
type Look = (typeof LOOKS)[number]

function headFront(l: Look, y: number): string {
  let s = R(-4, y, 8, 7, l.skin) + R(-4, y - 1, 8, 3, l.hair) + R(-4, y + 2, 1, 2, l.hair) + R(3, y + 2, 1, 2, l.hair)
  s += R(-2, y + 3, 1, 2, EYE) + R(1, y + 3, 1, 2, EYE)
  if (l.extra === 'long') s += R(-5, y, 1, 7, l.hair) + R(4, y, 1, 7, l.hair)
  if (l.extra === 'glasses') s += R(-3, y + 3, 2, 1, DARK) + R(1, y + 3, 2, 1, DARK) + R(-1, y + 3, 2, 1, DARK)
  if (l.extra === 'headset') s += R(-4, y - 2, 8, 1, DARK) + R(-5, y + 1, 1, 3, DARK) + R(4, y + 1, 1, 3, DARK) + R(-5, y + 4, 2, 1, DARK)
  return s
}
function headBack(l: Look, y: number): string {
  let s = R(-5, y + 2, 1, 2, l.skin) + R(4, y + 2, 1, 2, l.skin) + R(-4, y - 1, 8, 8, l.hair)
  if (l.extra === 'long') s += R(-5, y, 10, 9, l.hair)
  if (l.extra === 'headset') s += R(-4, y - 2, 8, 1, DARK) + R(-5, y + 1, 1, 3, DARK) + R(4, y + 1, 1, 3, DARK)
  return s
}
const shadow = R(-5, -1, 10, 2, '#000', 'sh')
function bodyStand(l: Look, walk: boolean, back: boolean): string {
  const legs = walk
    ? `<g class="l1">${R(-3, -5, 2, 3, PANTS)}${R(-3, -2, 2, 2, SHOE)}</g><g class="l2">${R(1, -5, 2, 3, PANTS)}${R(1, -2, 2, 2, SHOE)}</g>`
    : R(-3, -5, 2, 3, PANTS) + R(1, -5, 2, 3, PANTS) + R(-3, -2, 2, 2, SHOE) + R(1, -2, 2, 2, SHOE)
  const arms = `<g class="${walk ? 'a1' : ''}">${R(-6, -11, 2, 5, l.shirt)}${R(-6, -6, 2, 1, l.skin)}</g><g class="${walk ? 'a2' : ''}">${R(4, -11, 2, 5, l.shirt)}${R(4, -6, 2, 1, l.skin)}</g>`
  return shadow + legs + R(-4, -11, 8, 6, l.shirt) + R(-4, -6, 8, 1, shade(l.shirt, 0.75)) + arms + (back ? headBack(l, -18) : headFront(l, -18))
}
function bodySit(l: Look): string {
  return shadow + R(-4, -6, 3, 4, PANTS) + R(1, -6, 3, 4, PANTS) + R(-4, -2, 3, 2, SHOE) + R(1, -2, 3, 2, SHOE) +
    R(-4, -12, 8, 6, l.shirt) + R(-6, -11, 2, 4, l.shirt) + R(4, -11, 2, 4, l.shirt) + R(-5, -7, 2, 1, l.skin) + R(3, -7, 2, 1, l.skin) + headFront(l, -19)
}
function bodyDesk(l: Look): string {
  // seen from behind on the chair, shoulders bobbing as it types
  return `<g class="ty">${R(-6, -12, 2, 4, l.shirt)}${R(4, -12, 2, 4, l.shirt)}${R(-4, -13, 8, 7, l.shirt)}${headBack(l, -20)}</g>`
}
function bodyCheer(l: Look): string {
  return `<g class="jp">${shadow}${R(-3, -5, 2, 3, PANTS)}${R(1, -5, 2, 3, PANTS)}${R(-3, -2, 2, 2, SHOE)}${R(1, -2, 2, 2, SHOE)}${R(-4, -11, 8, 6, l.shirt)}${R(-6, -16, 2, 5, l.shirt)}${R(-6, -17, 2, 1, l.skin)}${R(4, -16, 2, 5, l.shirt)}${R(4, -17, 2, 1, l.skin)}${headFront(l, -18)}</g>`
}
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
function tag(name: string, color: string, y: number): string {
  const w = Math.max(20, name.length * 5 + 10)
  return `<g transform="translate(0,${y})"><rect x="${-w / 2}" y="-9" width="${w}" height="11" rx="3" fill="${color}" stroke="#1b1a24" stroke-width="1"/><text x="0" y="-0.8" class="nm">${esc(name)}</text></g>`
}
function bubble(text: string, y: number): string {
  const t = text.length > 20 ? text.slice(0, 19) + '…' : text
  const w = Math.max(22, t.length * 4.6 + 12)
  return `<g transform="translate(0,${y})"><rect x="${-w / 2}" y="-10" width="${w}" height="12" rx="4" fill="#fff8ea" stroke="#1b1a24" stroke-width="1"/><path d="M-3 2 L0 5 L3 2" fill="#fff8ea" stroke="#1b1a24" stroke-width="1"/><rect x="-2.5" y="1" width="5" height="1.6" fill="#fff8ea"/><text x="0" y="-1.5" class="bb">${esc(t)}</text></g>`
}
const sec = (ms: number) => (ms / 1000).toFixed(2) + 's'
const at = (p: Pt) => iso(p[0], p[1])
function motionPath(pts: Pt[]): string { return 'M' + pts.map(p => at(p).join(' ')).join(' L') }
function screenLen(pts: Pt[]): number[] {
  const out = [0]
  for (let n = 1; n < pts.length; n++) { const a = at(pts[n - 1]), b = at(pts[n]); out.push(out[n - 1] + Math.hypot(b[0] - a[0], b[1] - a[1])) }
  return out
}

/** A walk along pts that starts at `begin` (seconds from now, may be negative) and stays at the end. */
function walkOnce(l: Look, a: KantorAgent, pts: Pt[], beginMs: number, durMs: number, hideAtEnd: boolean): string {
  const color = LOOKS[a.look % LOOKS.length].shirt
  const endIn = beginMs + durMs
  const startVisible = beginMs <= 0
  return `<g opacity="${startVisible ? 1 : 0}">` +
    (startVisible ? '' : `<set attributeName="opacity" to="1" begin="${sec(beginMs)}"/>`) +
    (hideAtEnd ? `<set attributeName="opacity" to="0" begin="${sec(endIn)}"/>` : '') +
    `<g><animateMotion path="${motionPath(pts)}" dur="${sec(durMs)}" begin="${sec(beginMs)}" fill="freeze" calcMode="linear" keyPoints="0;1" keyTimes="0;1"/>` +
    SPR(bodyStand(l, true, false)) + tag(a.name, color, -36) + `</g></g>`
}

function wander(l: Look, a: KantorAgent, now: number): string {
  const loop = loopOf(a.loopIdx)
  const keys = loop.keys
  const pts = keys.map(k => k.p)
  const lens = screenLen(pts)
  const total = lens[lens.length - 1] || 1
  const kp = lens.map(v => (v / total).toFixed(4)).join(';')
  const kt = keys.map(k => (k.t / loop.dur).toFixed(4)).join(';')
  const beginMs = a.loopStart - now
  const dur = sec(loop.dur)
  const intervals: Pose[] = keys.slice(0, -1).map((k, n) => poseBetween(k, keys[n + 1]))
  const dkt = keys.slice(0, -1).map(k => (k.t / loop.dur).toFixed(4)).join(';')
  const variant = (pose: Pose, svg: string) => {
    if (!intervals.includes(pose)) return ''
    const vals = intervals.map(p => (p === pose ? 1 : 0)).join(';')
    return `<g opacity="0"><animate attributeName="opacity" calcMode="discrete" values="${vals}" keyTimes="${dkt}" dur="${dur}" begin="${sec(beginMs)}" repeatCount="indefinite"/>${svg}</g>`
  }
  const color = l.shirt
  const visible = beginMs <= 0
  return `<g opacity="${visible ? 1 : 0}">${visible ? '' : `<set attributeName="opacity" to="1" begin="${sec(beginMs)}"/>`}<g>` +
    `<animateMotion path="${motionPath(pts)}" dur="${dur}" begin="${sec(beginMs)}" repeatCount="indefinite" calcMode="linear" keyPoints="${kp}" keyTimes="${kt}"/>` +
    variant('walkF', SPR(bodyStand(l, true, false))) + variant('walkB', SPR(bodyStand(l, true, true))) +
    variant('standF', SPR(bodyStand(l, false, false))) + variant('standB', SPR(bodyStand(l, false, true))) +
    variant('sit', `<g transform="translate(0,-1)">${SPR(bodySit(l))}</g>`) +
    tag(a.name, color, -37) + `</g></g>`
}

function deskSvg(i: number, worker: KantorAgent | undefined, now: number): string {
  const [x, z] = deskAt(i)
  const busy = !!worker && worker.status === 'working'
  const seated = busy && now >= worker!.arriveAt
  const arriveIn = busy ? worker!.arriveAt - now : 0
  let s = box(x, z, 0.85, 1.3, 0, 0.55, '#b48a5e') + box(x + 0.02, z + 0.02, 0.81, 1.26, 0.55, 0.05, '#d9b98c')
  // monitor
  s += box(x + 0.12, z + 0.25, 0.12, 0.8, 0.6, 0.62, DARK)
  const scr = onFaceX(x + 0.24, z + 0.31, z + 0.99, 0.66, 1.16, busy ? '#13233a' : '#151823')
  s += scr
  if (busy) {
    const id = `cl${i}`
    const lines = [0, 1, 2, 3, 4, 5, 6, 7].map(k => {
      const w = 0.2 + ((i * 7 + k * 5) % 5) * 0.08, a = z + 0.38 + ((k * 3 + i) % 3) * 0.06, h = 1.08 - k * 0.07
      const col = ['#7fd38c', '#8db4ff', '#f3b443', '#d0a6ff', '#efe8d8'][(k + i) % 5]
      return onFaceX(x + 0.245, a, Math.min(z + 0.95, a + w), h - 0.025, h, col)
    }).join('')
    s += `<clipPath id="${id}">${scr.replace(/fill="[^"]*"/, '')}</clipPath><g clip-path="url(#${id})"><g class="sc">${lines}${lines.replace(/points="([^"]*)"/g, (_m, p: string) => `points="${p.split(' ').map(q => { const [qx, qy] = q.split(','); return qx + ',' + (Number(qy) + 9) }).join(' ')}"`)}</g></g>`
    s += `<g opacity="${seated ? 0.9 : 0}">${seated ? '' : `<set attributeName="opacity" to="0.9" begin="${sec(arriveIn)}"/>`}${onFaceX(x + 0.25, z + 0.28, z + 1.02, 0.63, 1.19, 'none', ` stroke="${LOOKS[worker!.look % LOOKS.length].shirt}" stroke-width="1" class="gl"`)}</g>`
  }
  s += box(x + 0.4, z + 0.42, 0.22, 0.48, 0.6, 0.03, '#d8d3c8') + box(x + 0.5, z + 1.05, 0.1, 0.1, 0.6, 0.12, '#e8e3d6')
  s += box(x + 0.15, z + 1.0, 0.18, 0.18, 0.6, 0.14, '#b35f3e') + box(x + 0.12, z + 0.97, 0.24, 0.24, 0.74, 0.14, '#5aa05f')
  // chair seat
  const chair = worker ? shade(LOOKS[worker.look % LOOKS.length].shirt, 0.62) : '#55506a'
  s += box(x + 1.2, z + 0.6, 0.1, 0.1, 0, 0.32, DARK) + box(x + 1.0, z + 0.38, 0.55, 0.55, 0.32, 0.07, chair)
  if (busy) {
    const l = LOOKS[worker!.look % LOOKS.length]
    const [px, py] = at(seatOf(i))
    s += `<g opacity="${seated ? 1 : 0}">${seated ? '' : `<set attributeName="opacity" to="1" begin="${sec(arriveIn)}"/>`}<g transform="translate(${px},${py - 5})">${SPR(bodyDesk(l))}</g></g>`
  }
  // chair back, in front of whoever sits
  s += box(x + 1.5, z + 0.38, 0.09, 0.55, 0.38, 0.38, chair)
  if (busy) {
    const [px, py] = at(seatOf(i))
    const label = (worker!.tool.split(':')[0] || 'mikir…').slice(0, 14)
    s += `<g opacity="${seated ? 1 : 0}">${seated ? '' : `<set attributeName="opacity" to="1" begin="${sec(arriveIn)}"/>`}<g transform="translate(${px},${py - 5})">${bubble(label, -52)}${tag(worker!.name, LOOKS[worker!.look % LOOKS.length].shirt, -38)}</g></g>`
  }
  return s
}

function plant(x: number, z: number, tall: boolean): string {
  let s = box(x, z, 0.42, 0.42, 0, 0.3, '#b35f3e') + box(x + 0.03, z + 0.03, 0.36, 0.36, 0.3, 0.03, '#4a3326')
  const g = ['#4f9a57', '#5fb16a', '#437f4b']
  const n = tall ? 6 : 4
  for (let k = 0; k < n; k++) {
    const ox = ((k * 37) % 5) * 0.05 - 0.08, oz = ((k * 53) % 5) * 0.05 - 0.08
    s += box(x + 0.08 + ox, z + 0.08 + oz, 0.26, 0.26, 0.33 + k * (tall ? 0.18 : 0.14), 0.22, g[k % 3])
  }
  return s
}

function roomSvg(now: number): string {
  let s = ''
  // floor slab edges
  s += poly([iso(0, D), iso(W, D), iso(W, D, -0.35), iso(0, D, -0.35)], '#3a2f40') + poly([iso(W, 0), iso(W, D), iso(W, D, -0.35), iso(W, 0, -0.35)], '#2e2535')
  // planks
  const wood = ['#b98c60', '#b08356']
  for (let x = 0; x < W; x++) for (let z = 0; z < D; z++) {
    if (x >= 8 && z < 2) { s += poly([iso(x, z), iso(x + 1, z), iso(x + 1, z + 1), iso(x, z + 1)], (x + z) % 2 ? '#dcd4c2' : '#c7bca7'); continue }
    s += poly([iso(x, z), iso(x + 1, z), iso(x + 1, z + 1), iso(x, z + 1)], (x + z) % 2 ? wood[0] : wood[1])
  }
  // rug
  s += poly([iso(7.9, 5.7), iso(W - 0.1, 5.7), iso(W - 0.1, D - 0.1), iso(7.9, D - 0.1)], '#4a5c8c') + poly([iso(8.2, 6.0), iso(W - 0.4, 6.0), iso(W - 0.4, D - 0.4), iso(8.2, D - 0.4)], '#5d71a3')
  // walls
  s += box(-0.25, -0.25, W + 0.25, 0.25, 0, 2.4, '#7f9e93') + box(-0.25, -0.25, 0.25, D + 0.25, 0, 2.4, '#6f8d83')
  s += onBack(0, W, 0, 0.18, '#4c5d57') + onLeft(0, D, 0, 0.18, '#46564f')
  // window with an evening skyline
  s += onBack(4.5, 7.5, 0.85, 2.05, '#e9e4d8')
  s += onBack(4.65, 7.35, 1.6, 1.92, '#7e86b3') + onBack(4.65, 7.35, 1.3, 1.6, '#d99a84') + onBack(4.65, 7.35, 1.0, 1.3, '#f2b37d')
  const sky: [number, number, number][] = [[4.65, 0.22, 0.45], [4.9, 0.18, 0.62], [5.12, 0.25, 0.38], [5.4, 0.2, 0.72], [5.65, 0.28, 0.5], [6.0, 0.2, 0.58], [6.25, 0.3, 0.42], [6.6, 0.2, 0.66], [6.85, 0.25, 0.48], [7.1, 0.25, 0.55]]
  for (const [x, w, h] of sky) s += onBack(x, Math.min(7.35, x + w), 1.0, 1.0 + h, '#3b3757')
  for (const [x, , h] of sky) s += onBack(x + 0.06, x + 0.1, 1.0 + h * 0.6, 1.0 + h * 0.6 + 0.05, '#f6d27a', ' class="tw"')
  s += onBack(5.97, 6.03, 1.0, 1.92, '#e9e4d8') + onBack(4.65, 7.35, 1.42, 1.46, '#e9e4d8') + box(4.4, 0, 3.2, 0.18, 0.78, 0.06, '#d9d2c3')
  // task board with sticky notes
  s += onBack(1.0, 2.7, 1.05, 1.95, '#b98a58')
  const notes: [number, number, string][] = [[1.1, 1.65, '#f6e27a'], [1.1, 1.3, '#f6e27a'], [1.65, 1.65, '#9fd6a4'], [1.65, 1.3, '#f4a8a0'], [2.2, 1.65, '#9fd6a4'], [2.2, 1.3, '#9fd6a4']]
  for (const [x, h, c] of notes) s += onBack(x, x + 0.4, h, h + 0.22, c)
  // clock
  s += onBack(3.4, 3.85, 1.55, 2.0, DARK) + onBack(3.47, 3.78, 1.6, 1.95, '#fff8ea')
  s += onBack(3.61, 3.65, 1.76, 1.9, DARK) + onBack(3.61, 3.74, 1.76, 1.8, DARK)
  // whiteboard on the left wall
  s += onLeft(2.3, 4.5, 0.85, 1.95, '#8a8f96') + onLeft(2.38, 4.42, 0.92, 1.88, '#f4f6f2')
  s += onLeft(2.6, 3.6, 1.6, 1.65, '#3d6fd6') + onLeft(2.6, 3.3, 1.45, 1.5, '#3d6fd6') + onLeft(3.8, 4.25, 1.6, 1.65, '#d65a4a') + onLeft(3.8, 4.1, 1.45, 1.5, '#3f9b52') + onLeft(2.6, 4.2, 1.2, 1.25, '#2d2a3a')
  return s
}

function furnitureSvg(): { key: number; svg: string }[] {
  const items: { key: number; svg: string }[] = []
  // pantry
  items.push({ key: 8.5, svg: box(8.15, 0, 1.85, 0.75, 0, 0.88, '#e3ddd0') + box(8.12, 0, 1.91, 0.78, 0.88, 0.05, '#8d8a96') + box(8.15, 0, 1.85, 0.35, 1.45, 0.5, '#d4cbb8') + box(8.35, 0.1, 0.4, 0.4, 0.93, 0.5, '#3a3546') + box(8.42, 0.48, 0.1, 0.1, 1.25, 0.06, '#e25b4a') + box(8.45, 0.25, 0.18, 0.18, 0.93, 0.12, '#fff8ea') + box(9.25, 0.1, 0.55, 0.45, 0.93, 0.3, '#cfd2d6') })
  items.push({ key: 10.9, svg: box(10.1, 0, 0.85, 0.78, 0, 1.9, '#e9ecef') + box(10.1, 0, 0.86, 0.79, 1.2, 0.02, '#b9bec4') })
  items.push({ key: 7.6, svg: plant(7.25, 0.05, true) })
  items.push({ key: 0.4, svg: plant(0.05, 0.05, true) })
  // shelf
  let shelf = box(0, 5.95, 0.45, 1.6, 0, 1.75, '#8a6340')
  const bc = ['#d65a4a', '#3d6fd6', '#f3b443', '#3f9b52', '#efe8d8', '#8e5fb5']
  for (const h of [0.1, 0.55, 1.0, 1.42]) {
    let gz = 6.05, k = Math.round(h * 10)
    while (gz < 7.35) { const w = 0.1 + ((k * 7) % 4) * 0.03; if (k % 6) shelf += onFaceX(0.45, gz, gz + w - 0.02, h, h + 0.28 + (k % 3) * 0.04, bc[k % 6]); gz += w; k++ }
  }
  items.push({ key: 6.9, svg: shelf })
  items.push({ key: 8.7, svg: box(0.05, 8.2, 0.45, 0.45, 0, 0.85, '#e8e6e0') + box(0.12, 8.27, 0.3, 0.3, 0.85, 0.42, '#8fc7f0') + onFaceX(0.5, 8.3, 8.38, 0.55, 0.62, '#3d6fd6') + onFaceX(0.5, 8.48, 8.56, 0.55, 0.62, '#d65a4a') })
  // lounge
  items.push({ key: 15.2, svg: box(8.3, 6.05, 2.45, 0.28, 0, 0.78, '#5d6da6') + box(8.3, 6.33, 2.45, 0.68, 0, 0.36, '#6f7fb8') + box(8.12, 6.05, 0.2, 0.96, 0, 0.55, '#5d6da6') + box(10.73, 6.05, 0.2, 0.96, 0, 0.55, '#5d6da6') + box(8.45, 6.35, 0.45, 0.15, 0.36, 0.3, '#f3b443') })
  items.push({ key: 17.4, svg: box(8.75, 7.55, 1.5, 0.7, 0, 0.3, '#8a6340') + box(9.0, 7.7, 0.4, 0.3, 0.3, 0.03, '#efe8d8') + box(9.7, 7.8, 0.12, 0.12, 0.3, 0.12, '#fff8ea') })
  items.push({ key: 16.3, svg: box(10.78, 5.38, 0.16, 0.16, 0, 1.25, DARK) + box(10.68, 5.28, 0.36, 0.36, 1.2, 0.28, '#ffe3a3') })
  items.push({ key: 18.8, svg: plant(10.2, 8.2, false) })
  return items
}

/** The whole office as an SVG document, animated from `now` on. */
export function buildSvg(o: KantorOffice, now: number): string {
  let back = roomSvg(now)
  const items = furnitureSvg()
  const byDesk = new Map<number, KantorAgent>()
  for (const a of o.agents) if (a.desk >= 0 && a.status === 'working') byDesk.set(a.desk, a)
  for (let i = 0; i < DESKS; i++) { const [x, z] = deskAt(i); items.push({ key: x + z + 1.4, svg: deskSvg(i, byDesk.get(i), now) }) }
  items.sort((p, q) => p.key - q.key)
  let front = ''
  for (const a of o.agents) {
    const l = LOOKS[a.look % LOOKS.length]
    if (a.status === 'working') {
      if (a.desk >= 0 && now < a.arriveAt) front += walkOnce(l, a, arrivePath(a), a.moveAt - now, a.arriveAt - a.moveAt, true)
      if (a.desk < 0) front += wander(l, a, now)
      continue
    }
    if (a.desk >= 0 && a.leftDeskAt && now < a.loopStart) {
      const cheerEnd = a.leftDeskAt + CHEER_MS
      if (now < cheerEnd) {
        const [px, py] = at(cheerSpot(a.desk))
        front += `<g><set attributeName="opacity" to="0" begin="${sec(cheerEnd - now)}"/><g transform="translate(${px},${py})">${SPR(bodyCheer(l))}${bubble('Beres!', -50)}${tag(a.name, l.shirt, -36)}</g></g>`
      }
      front += walkOnce(l, a, leavePath(a), cheerEnd - now, a.loopStart - cheerEnd, true)
    }
    front += wander(l, a, now)
  }
  const css = `.nm{font:700 8px system-ui,-apple-system,'Segoe UI',sans-serif;fill:#1b1a24;text-anchor:middle}` +
    `.bb{font:500 7.5px system-ui,-apple-system,'Segoe UI',sans-serif;fill:#1b1a24;text-anchor:middle}` +
    `.sh{opacity:.22}.l1{animation:st .36s steps(1) infinite}.l2{animation:st .36s steps(1) infinite .18s}` +
    `.a1{animation:st .36s steps(1) infinite .18s}.a2{animation:st .36s steps(1) infinite}` +
    `@keyframes st{50%{transform:translateY(-1px)}}.ty{animation:ty .28s steps(1) infinite}@keyframes ty{50%{transform:translateY(1px)}}` +
    `.jp{animation:jp .5s ease-in-out infinite}@keyframes jp{50%{transform:translateY(-5px)}}` +
    `.sc{animation:sc 1.6s steps(6) infinite}@keyframes sc{to{transform:translateY(-9px)}}` +
    `.gl{animation:gl 2s ease-in-out infinite}@keyframes gl{50%{opacity:.35}}.tw{animation:gl 3s steps(2) infinite}` +
    `@media (prefers-reduced-motion:reduce){*{animation:none!important}}`
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VIEW_W} ${VIEW_H}" width="${Math.round(VIEW_W * 1.5)}" height="${Math.round(VIEW_H * 1.5)}"><style>${css}</style>` +
    `<rect width="${VIEW_W}" height="${VIEW_H}" fill="#15141c"/>${back}${items.map(i => i.svg).join('')}${front}</svg>`
}

/** A short label for a tool call: the tool and the bit of its input that says most. */
export function toolLabel(tool: string, input: Record<string, unknown>): string {
  const base = (p: unknown) => (typeof p === 'string' ? p.split('/').pop() || p : '')
  const short = tool.startsWith('mcp__') ? tool.split('__').slice(1).join(':') : tool
  let detail = ''
  if (typeof input.file_path === 'string') detail = base(input.file_path)
  else if (typeof input.command === 'string') detail = input.command.trim().split(/\s+/).slice(0, 2).join(' ')
  else if (typeof input.query === 'string') detail = input.query
  else if (typeof input.pattern === 'string') detail = input.pattern
  else if (typeof input.url === 'string') detail = input.url.replace(/^https?:\/\//, '')
  else if (typeof input.description === 'string') detail = input.description
  const s = detail ? `${short}: ${detail}` : short
  return s.length > 40 ? s.slice(0, 39) + '…' : s
}

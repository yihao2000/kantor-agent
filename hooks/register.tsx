import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { KantorAgent, KantorOffice, KantorRemote } from '../types'
import { PAGE } from './page'
import { addSubagent, buildSvg, emptyOffice, endWork, LOOKS, MAIN, mergeOffices, noteTool, prune, startWork, toolLabel } from './office'

const PANE = 'kantor-agent'
const TITLE = 'Kantor Agent'
const office = atom({ plugin: 'kantor-agent', key: 'office' } as const, { agents: [], seq: 0 })
const remote = atom({ plugin: 'kantor-agent', key: 'remote' } as const, [])

/** Every session on this computer reports itself under this prefix in the shared store. */
const KEY = 's:'
const ALIVE_MS = 20_000
const FORGET_MS = 10 * 60_000

const taskFrom = (text: string) => {
  const t = text
    .replace(/<([a-z][\w-]*)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return t.length > 60 ? t.slice(0, 59) + '…' : t
}
const ago = (ms: number) => (ms < 60000 ? `${Math.max(1, Math.round(ms / 1000))}d` : `${Math.round(ms / 60000)}m`)
const ensure = (o: KantorOffice, now: number) => (o.agents.length ? o : emptyOffice(now))

let sid = ''
let label = ''
let lastSeen = ''
/** Where the 3D page and its roster live: ~/.claude/kantor-agent */
let outDir = ''
/** The relay that joins sessions across computers and the cloud: KANTOR_RELAY, or relay.txt. */
let relayUrl = ''
let relaySig = ''
let relayAt = 0

async function loadRelay($: EngineInterface) {
  const fromEnv = ((await $.env.get('KANTOR_RELAY').catch(() => undefined)) ?? '').trim()
  let fromFile = ''
  if (outDir && (await $.fs.exists(`${outDir}/relay.txt`).catch(() => false))) fromFile = (await $.fs.read(`${outDir}/relay.txt`)).trim()
  relayUrl = /^https?:\/\//.test(fromEnv) ? fromEnv : /^https?:\/\//.test(fromFile) ? fromFile : ''
}

/** Tells the relay who works here: at once when something changed, else every 15 seconds. */
async function postRelay($: EngineInterface, agents: KantorAgent[], gone = false) {
  if (!relayUrl || !sid) return
  const slim = agents.map(a => ({ id: a.id, name: a.name, status: a.status, task: a.task, tool: a.tool }))
  const sig = JSON.stringify([label, slim, gone])
  const now = await $.clock.now()
  if (!gone && sig === relaySig && now - relayAt < 15000) return
  relaySig = sig
  relayAt = now
  try {
    await $.http.fetch(relayUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sid, label, from: 'mac', gone, agents: slim }) })
  } catch {
    // the office still works locally when the relay is unreachable
  }
}

/** Writes roster.js, the live data the 3D page reloads every 1.5 seconds. */
async function writeRoster($: EngineInterface) {
  if (!sid || !outDir) return
  const now = await $.clock.now()
  const own = await read($, office)
  const others = await read($, remote)
  const sessions = [{ sid, label, at: now, agents: own.agents }, ...others]
  await $.fs.write(`${outDir}/roster.js`, `window.__kantor(${JSON.stringify({ at: now, relay: relayUrl, sessions })})\n`)
}

/** Writes the 3D page when it is missing or older than this version of the mod. */
async function ensurePage($: EngineInterface) {
  if (!outDir) return ''
  const path = `${outDir}/index.html`
  const current = (await $.fs.exists(path)) ? await $.fs.read(path) : ''
  if (current !== PAGE) await $.fs.write(path, PAGE)
  return path
}

/** Writes this session's roster to the shared store, for the other sessions' panels. */
async function publish($: EngineInterface) {
  if (!sid) return
  const o = await read($, office)
  await $.store.set(KEY + sid, { sid, label, at: await $.clock.now(), agents: o.agents })
  await writeRoster($)
  await postRelay($, o.agents)
}

/** Reads the other sessions' rosters; redraws only when one of them changed. */
async function poll($: EngineInterface) {
  const now = await $.clock.now()
  const found: KantorRemote[] = []
  for (const k of await $.store.keys()) {
    if (!k.startsWith(KEY) || k === KEY + sid) continue
    const r = (await $.store.get(k)) as KantorRemote | undefined
    if (!r || typeof r.at !== 'number') continue
    if (now - r.at > FORGET_MS) { await $.store.delete(k); continue }
    if (now - r.at <= ALIVE_MS && Array.isArray(r.agents)) found.push(r)
  }
  found.sort((p, q) => p.sid.localeCompare(q.sid))
  const sig = JSON.stringify(found.map(r => [r.sid, r.label, r.agents]))
  if (sig !== lastSeen) { lastSeen = sig; await update($, remote, () => found) }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const now = await $.clock.now()
    sid = await $.session.id()
    const cwd = (await $.session.cwd()).replace(/\/+$/, '')
    const home = ((await $.env.get('HOME').catch(() => undefined)) ?? '').replace(/\/+$/, '')
    label = !cwd || cwd === home ? 'Claude' : cwd.split('/').pop() || 'Claude'
    if (home) outDir = `${home}/.claude/kantor-agent`
    try {
      await loadRelay($)
      await ensurePage($)
    } catch {
      // the panel still works without the 3D page
    }
    await update($, office, o => ensure(o, now))
    try {
      await $.command.register({ name: 'kantor', description: 'Buka panel Kantor Agent: semua sesi dan sub agent, kerja atau santai' })
      await $.command.register({ name: 'kantor-relay', description: 'Sambungkan kantor ke server relay: /kantor-relay <alamat lengkap dengan ?key=...>', argumentHint: '<alamat relay>' })
      await $.command.register({ name: 'kantor-3d', description: 'Buka kantor 3D live di browser: semua sesi dan sub agent di komputer ini' })
      void $.ui.open({ id: PANE, title: TITLE }).catch(() => undefined)
    } catch {
      // a surface without panes still reports this session to the others
    }
    await poll($)
    await publish($)
    $.clock.every(4000, async () => {
      await poll($)
      await publish($)
    })
    $.clock.every(30000, async () => {
      const t = await $.clock.now()
      await update($, office, o => prune(o, t))
    })
    return next(e)
  })

  on('session.end', async ($, e, next) => {
    await postRelay($, [], true)
    if (sid) await $.store.delete(KEY + sid)
    return next(e)
  })

  on('command.run', { command: 'kantor' }, async $ => {
    const now = await $.clock.now()
    await update($, office, o => ensure(o, now))
    const { isPlaced } = await $.ui.open({ id: PANE, title: TITLE })
    return { text: isPlaced ? 'Panel Kantor Agent dibuka.' : 'Panel Kantor Agent belum bisa ditampilkan di layar ini.' }
  })

  on('command.run', { command: 'kantor-relay' }, async ($, e) => {
    const url = e.args.trim()
    if (!/^https?:\/\/\S+$/.test(url)) return { text: 'Tulis alamat relay-nya, misalnya: /kantor-relay https://nama.val.run/?key=kuncimu' }
    if (!outDir) return { text: 'Folder rumah (HOME) nggak ketemu, relay belum bisa disimpan.' }
    await $.fs.write(`${outDir}/relay.txt`, url + '\n')
    relayUrl = url
    relaySig = ''
    await publish($)
    return { text: 'Relay tersambung. Sesi ini sekarang lapor ke kantor bersama, dan kantor 3D ikut menampilkan sesi cloud.' }
  })

  on('command.run', { command: 'kantor-3d' }, async $ => {
    const path = await ensurePage($)
    if (!path) return { text: 'Kantor 3D belum bisa dibuka: folder rumah (HOME) nggak ketemu.' }
    await writeRoster($)
    for (const opener of ['open', 'xdg-open']) {
      try {
        const { exitCode } = await $.process.run([opener, path])
        if (exitCode === 0) return { text: `Kantor 3D dibuka di browser (${path}).` }
      } catch {
        // try the next opener
      }
    }
    return { text: `Buka file ini di browser: ${path}` }
  })

  // The main loop: Claude sits down when a turn starts and stands up when it ends.
  on('turn.start', async ($, e, next) => {
    const now = await $.clock.now()
    const id = e.agentId ?? MAIN
    await update($, office, o => startWork(ensure(o, now), id, e.agentId ? '' : taskFrom(e.text) || 'Lanjut kerja', now))
    await publish($)
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const ran = await next(e)
    const now = await $.clock.now()
    await update($, office, o => endWork(o, e.agentId ?? MAIN, now))
    await publish($)
    return ran
  })

  // A subagent walks in through the front and takes a free desk.
  on('agent.spawn', async ($, e, next) => {
    const ran = await next(e)
    if (ran.agentId) {
      const id = ran.agentId
      const now = await $.clock.now()
      await update($, office, o => addSubagent(ensure(o, now), id, e.subagentType, taskFrom(e.description || e.prompt), now))
      await publish($)
    }
    return ran
  })

  // Every tool call shows above the head of whoever made it.
  on('tool.call', async ($, e, next) => {
    const now = await $.clock.now()
    const label = toolLabel(String(e.tool), e as unknown as Record<string, unknown>)
    await update($, office, o => noteTool(o, e.agentId ?? MAIN, label, now))
    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const els = $.ui.resolve(e)
    const { Box, Text } = els
    const own = await read($, office)
    const others = await read($, remote)
    const o = mergeOffices(own, others)
    const now = await $.clock.now()
    const agents = o.agents
    const rows = agents.map((a: KantorAgent) => {
      const color = LOOKS[a.look % LOOKS.length].shirt
      const working = a.status === 'working'
      const state = working ? (now < a.arriveAt ? 'Ke meja' : 'Kerja') : now < a.loopStart ? 'Beres' : 'Santai'
      const what = working ? a.tool || a.task || 'mikir' : a.task ? `terakhir: ${a.task}` : 'jalan-jalan di kantor'
      const time = working ? ago(now - a.startedAt) : ''
      return (
        <Box key={a.id} flexDirection="row" gap={1}>
          <Text color={color} bold>{a.name}</Text>
          <Text color={working ? 'success' : 'inactive'}>{state}</Text>
          <Text dimColor wrap="truncate-end">{what}</Text>
          {time ? <Text dimColor>{time}</Text> : null}
        </Box>
      )
    })
    const working = agents.filter(a => a.status === 'working').length
    const sessions = 1 + others.length
    const summary = `${sessions} sesi · ${working} kerja · ${agents.length - working} santai${agents.some(a => a.desk < 0) ? ' · meja penuh, sisanya keliling' : ''}`
    if (e.surface === 'terminal') {
      return (
        <Box flexDirection="column">
          <Text bold>{summary}</Text>
          {rows}
        </Box>
      )
    }
    const Svg = 'Svg' in els ? els.Svg : undefined
    return (
      <Box flexDirection="column" gap={1}>
        {Svg ? <Svg source={buildSvg(o, now)} alt={`Kantor agent: ${summary}`} isInteractive /> : null}
        <Text bold>{summary}</Text>
        {rows}
      </Box>
    )
  })
}

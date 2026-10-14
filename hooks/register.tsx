import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { KantorAgent, KantorOffice, KantorRemote } from '../types'
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
  const t = text.replace(/\s+/g, ' ').trim()
  return t.length > 60 ? t.slice(0, 59) + '…' : t
}
const ago = (ms: number) => (ms < 60000 ? `${Math.max(1, Math.round(ms / 1000))}d` : `${Math.round(ms / 60000)}m`)
const ensure = (o: KantorOffice, now: number) => (o.agents.length ? o : emptyOffice(now))

let sid = ''
let label = ''
let lastSeen = ''

/** Writes this session's roster to the shared store, for the other sessions' panels. */
async function publish($: EngineInterface) {
  if (!sid) return
  const o = await read($, office)
  await $.store.set(KEY + sid, { sid, label, at: await $.clock.now(), agents: o.agents })
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
    label = cwd.split('/').pop() || ''
    await update($, office, o => ensure(o, now))
    try {
      await $.command.register({ name: 'kantor', description: 'Buka panel Kantor Agent: semua sesi dan sub agent, kerja atau santai' })
      void $.ui.open({ id: PANE, title: TITLE }).catch(() => undefined)
    } catch {
      // a surface without panes still reports this session to the others
    }
    await publish($)
    await poll($)
    $.clock.every(4000, async () => {
      await publish($)
      await poll($)
    })
    $.clock.every(30000, async () => {
      const t = await $.clock.now()
      await update($, office, o => prune(o, t))
    })
    return next(e)
  })

  on('session.end', async ($, e, next) => {
    if (sid) await $.store.delete(KEY + sid)
    return next(e)
  })

  on('command.run', { command: 'kantor' }, async $ => {
    const now = await $.clock.now()
    await update($, office, o => ensure(o, now))
    const { isPlaced } = await $.ui.open({ id: PANE, title: TITLE })
    return { text: isPlaced ? 'Panel Kantor Agent dibuka.' : 'Panel Kantor Agent belum bisa ditampilkan di layar ini.' }
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

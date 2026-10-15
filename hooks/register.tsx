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
/** True while the session's folder says nothing about it (a conversation in the Claude app runs in /home/claude): it is named after its first request instead. */
let namedByTask = false
const GENERIC_DIRS = new Set(['claude', 'root', 'home', 'workspace', 'tmp', 'user', ''])
/** What the app sends when it resumes a conversation: not something the person asked. */
const isFiller = (t: string) => !t || /^continue with the task/i.test(t) || /^lanjut kerja$/i.test(t)
let titledAt = 0
let titling = false

/** The person's own requests in this conversation, oldest first. */
async function userTexts($: EngineInterface): Promise<string[]> {
  const rows = await $.session.messages().catch(() => [])
  return rows.filter(r => r.role === 'user').map(r => taskFrom(r.text)).filter(t => !isFiller(t))
}

/** Names a conversation like the app's own sidebar title: a few words from a quick model call, else its first request. */
async function nameSession($: EngineInterface) {
  if (!namedByTask || titling) return
  const texts = await userTexts($)
  if (!texts.length || (titledAt && (texts.length < 3 || titledAt >= 3))) return
  titling = true
  try {
    const r = await $.model.complete({
      model: 'haiku',
      maxTokens: 24,
      timeoutMs: 8000,
      prompt: 'Tulis judul 2 sampai 4 kata untuk percakapan ini, dalam bahasa yang sama dengan pesannya. Hanya judulnya, tanpa tanda kutip dan tanpa titik.\n\nPesan pengguna:\n' + texts.slice(0, 3).map(t => '- ' + t).join('\n'),
    })
    const title = r.isAnswered ? r.text.replace(/["'`*.]/g, '').replace(/\s+/g, ' ').trim() : ''
    label = title ? 'Chat · ' + (title.length > 22 ? title.slice(0, 21).trimEnd() + '…' : title) : nameFromTask(texts[0] ?? '')
    titledAt = texts.length
    relaySig = ''
    await publish($)
  } catch {
    label = nameFromTask(texts[0] ?? '')
  } finally {
    titling = false
  }
}

const nameFromTask = (task: string) => {
  const t = task.replace(/[^\p{L}\p{N} ]+/gu, ' ').replace(/\s+/g, ' ').trim()
  return 'Chat · ' + (t.length > 18 ? t.slice(0, 17).trimEnd() + '…' : t || 'baru')
}
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
  // ~/.claude/kantor-agent/relay.txt (set by /kantor-relay), else one shipped inside a private copy of the plugin
  for (const path of [outDir && `${outDir}/relay.txt`, `${$.plugin.root}/relay.txt`]) {
    if (fromFile || !path) continue
    if (await $.fs.exists(path).catch(() => false)) fromFile = (await $.fs.read(path)).trim()
  }
  relayUrl = /^https?:\/\//.test(fromEnv) ? fromEnv : /^https?:\/\//.test(fromFile) ? fromFile : ''
}

/** Tells the relay who works here: at once when something changed, else every 15 seconds. */
async function postRelay($: EngineInterface, agents: KantorAgent[], gone = false) {
  if (!relayUrl || !sid) return
  const slim = agents.map(a => ({ id: a.id, name: a.name, status: a.status, task: a.task, tool: a.tool, since: a.status === 'working' ? a.startedAt : 0 }))
  const sig = JSON.stringify([label, slim, gone])
  const now = await $.clock.now()
  if (!gone && sig === relaySig && now - relayAt < 15000) return
  relaySig = sig
  relayAt = now
  try {
    await $.http.fetch(relayUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sid, label, from: label.startsWith('Chat · ') ? 'chat' : 'mac', gone, agents: slim }) })
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
  const text = `window.__kantor(${JSON.stringify({ at: now, relay: relayUrl, sessions })})\n`
  await $.fs.write(`${outDir}/roster.js`, text)
  // The wallpaper folder is opened on its own by Plash, so it gets its own copy.
  await $.fs.write(`${outDir}/wallpaper/roster.js`, text).catch(() => undefined)
}

/** The same page, locked in wallpaper mode: only the room, full screen. */
const WALL_PAGE = PAGE.replace('<body>', '<body class="wall" data-wall="force">')

/** Writes the 3D page when it is missing or older than this version of the mod. */
async function ensurePage($: EngineInterface) {
  if (!outDir) return ''
  const path = `${outDir}/index.html`
  const current = (await $.fs.exists(path)) ? await $.fs.read(path) : ''
  if (current !== PAGE) await $.fs.write(path, PAGE)
  const wall = `${outDir}/wallpaper/index.html`
  const wallNow = (await $.fs.exists(wall)) ? await $.fs.read(wall) : ''
  if (wallNow !== WALL_PAGE) await $.fs.write(wall, WALL_PAGE)
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
    // The plugin's classic hooks (cloud/report.py) stand down where this mod runs.
    await $.env.set('KANTOR_MOD', '1').catch(() => undefined)
    const now = await $.clock.now()
    sid = await $.session.id()
    const cwd = (await $.session.cwd()).replace(/\/+$/, '')
    const home = ((await $.env.get('HOME').catch(() => undefined)) ?? '').replace(/\/+$/, '')
    const base = cwd.split('/').pop() || ''
    namedByTask = GENERIC_DIRS.has(base.toLowerCase()) && cwd !== home
    label = !cwd || cwd === home ? 'Claude' : namedByTask ? 'Chat · baru' : base
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
      await $.command.register({ name: 'kantor-wallpaper', description: 'Cara pasang kantor 3D sebagai wallpaper live di Mac' })
      void $.ui.open({ id: PANE, title: TITLE }).catch(() => undefined)
    } catch {
      // a surface without panes still reports this session to the others
    }
    await poll($)
    await publish($)
    $.clock.every(4000, async () => {
      await loadRelay($).catch(() => undefined)
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

  on('command.run', { command: 'kantor-wallpaper' }, async $ => {
    const path = await ensurePage($)
    if (!path) return { text: 'Folder rumah (HOME) nggak ketemu, wallpaper belum bisa disiapkan.' }
    await writeRoster($)
    const dir = `${outDir}/wallpaper`
    await $.process.run(['open', '-R', `${dir}/index.html`]).catch(() => undefined)
    return {
      text: [
        `Wallpaper siap di folder: ${dir}`,
        '1. Pasang Plash dari Mac App Store (gratis).',
        '2. Klik ikon Plash di menu bar, Add Website, lalu pilih Local Website / Choose Folder.',
        '3. Tekan Cmd+Shift+G, tempel alamat folder di atas, lalu Open.',
        'Kantornya jadi wallpaper dan ikut live selama Claude jalan.',
      ].join('\n'),
    }
  })

  // The main loop: Claude sits down when a turn starts and stands up when it ends.
  on('turn.start', async ($, e, next) => {
    const now = await $.clock.now()
    const id = e.agentId ?? MAIN
    let task = e.agentId ? '' : taskFrom(e.text)
    if (!e.agentId && isFiller(task)) task = (await userTexts($)).at(-1) ?? ''
    // titling runs on a timer, outside this turn, so the turn never waits for it
    if (!e.agentId && namedByTask) $.clock.after(50, () => nameSession($))
    await update($, office, o => startWork(ensure(o, now), id, task || 'Lanjut kerja', now))
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

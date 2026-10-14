import { expect, mock, test } from 'claude-code/testing'

import { addSubagent, buildSvg, emptyOffice, endWork, MAIN, noteTool, posOf, startWork } from '../hooks/office'

const PANE = {
  plugin: 'kantor-agent',
  component: 'Pane',
  requestId: 'kantor-agent',
  props: { title: 'Kantor Agent', isFocused: false, bodyColumns: 80, placement: 'dock', scroll: { top: 0 } } as never,
} as const

test('agents sit down to work and leave their desk when done', async () => {
  const t = 1_800_000_000_000
  let o = emptyOffice(t)
  o = startWork(o, MAIN, 'Bikin kantor', t + 1000)
  const main = o.agents[0]!
  expect(main.status).toBe('working')
  expect(main.arriveAt > t + 1000).toBe(true)
  o = noteTool(o, MAIN, 'Bash: ls', t + 2000)
  expect(o.agents[0]!.tool).toBe('Bash: ls')
  o = addSubagent(o, 'sub-1', 'Explore', 'Cari referensi', t + 3000)
  expect(o.agents[1]!.desk).toBe(1)
  expect(o.agents[1]!.name).toBe('Explore')
  o = endWork(o, 'sub-1', t + 60000)
  const sub = o.agents[1]!
  expect(sub.status).toBe('idle')
  expect(sub.loopStart > sub.leftDeskAt).toBe(true)
  const p = posOf(sub, t + 61000)
  expect(Number.isFinite(p[0]) && Number.isFinite(p[1])).toBe(true)
  const svg = buildSvg(o, t + 61000)
  expect(svg.startsWith('<svg')).toBe(true)
  expect(svg.length < 131072).toBe(true)
})

test('the pane follows real turns and subagents', async ($, on) => {
  mock.clock(on)
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: '' }))
  on('agent.spawn', () => ({ model: 'test', agentId: 'sub-1' }))

  await $.turn.start({ text: 'Bikin kantor agent', turnId: 't1' })
  await $.agent.spawn({ tool_use_id: 'tu1', prompt: 'cari', description: 'Cari referensi', subagentType: 'Explore' } as never)

  const desk = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await desk.find({ type: 'Svg' })).toBeDefined()
  expect(await desk.find({ text: /2 kerja/ })).toBeDefined()
  await desk.unmount()

  await $.turn.complete({ answer: 'ok', durationMs: 10, isAborted: false, turnId: 't1', reason: 'answer' })
  const term = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await term.find({ text: /1 kerja · 1 santai/ })).toBeDefined()
  expect(await term.find({ text: 'Claude' })).toBeDefined()
  await term.unmount()
})

test('sessions on the same computer share one office', async ($, on) => {
  const now = 1_800_000_000_000
  mock.clock(on, { now })
  mock.store(on, {
    's:other-session': {
      sid: 'other-session',
      label: 'blog-saya',
      at: now,
      agents: [{ ...emptyOffice(now).agents[0]!, status: 'working', task: 'Nulis artikel', tool: 'Write: draft.md', arriveAt: now, moveAt: now }],
    },
  })
  on('session.id', () => ({ value: 'this-session' }) as never)
  on('session.cwd', () => ({ value: '/Users/kamu/kantor' }) as never)
  on('command.register', () => ({ value: {} }) as never)
  on('ui.open', () => ({ value: { isPlaced: true } }) as never)
  on('session.start', (_$, e) => ({ cwd: e.cwd }) as never)
  mock.env(on, { HOME: '/Users/kamu' })
  const files = new Map<string, string>()
  on('fs.exists', (_$, e) => ({ value: files.has((e as { path: string }).path) }) as never)
  on('fs.read', (_$, e) => ({ value: files.get((e as { path: string }).path) ?? '' }) as never)
  on('fs.write', (_$, e) => {
    const w = e as { path: string; text: string }
    files.set(w.path, w.text)
    return { value: undefined } as never
  })
  await $.session.start({ cwd: '/Users/kamu/kantor', surface: 'desktop', isInteractive: true, startedAt: now } as never)

  // the 3D page and its live roster land in ~/.claude/kantor-agent
  expect(files.get('/Users/kamu/.claude/kantor-agent/index.html')?.includes('KANTOR AGENT')).toBe(true)
  const roster = files.get('/Users/kamu/.claude/kantor-agent/roster.js') ?? ''
  expect(roster.startsWith('window.__kantor(')).toBe(true)
  expect(roster.includes('blog-saya') && roster.includes('"label":"kantor"')).toBe(true)

  const desk = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await desk.find({ text: /2 sesi/ })).toBeDefined()
  expect(await desk.find({ text: 'blog-saya' })).toBeDefined()
  await desk.unmount()
})

test('task text drops the tags the engine adds around a prompt', async ($, on) => {
  mock.clock(on)
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  await $.turn.start({ text: '<system-reminder>zona waktu</system-reminder>Rapikan landing page', turnId: 't9' })
  const term = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await term.find({ text: /zona waktu/ })).toBeUndefined()
  await term.unmount()
})

test('/kantor-relay saves the relay and reports this session to it', async ($, on) => {
  const now = 1_800_000_000_000
  mock.clock(on, { now })
  mock.store(on)
  mock.env(on, { HOME: '/Users/kamu' })
  const files = new Map<string, string>()
  const posts: { url: string; body: string }[] = []
  on('session.id', () => ({ value: 'mac-session' }) as never)
  on('session.cwd', () => ({ value: '/Users/kamu' }) as never)
  on('command.register', () => ({ value: {} }) as never)
  on('ui.open', () => ({ value: { isPlaced: true } }) as never)
  on('session.start', (_$, e) => ({ cwd: e.cwd }) as never)
  on('fs.exists', (_$, e) => ({ value: files.has((e as { path: string }).path) }) as never)
  on('fs.read', (_$, e) => ({ value: files.get((e as { path: string }).path) ?? '' }) as never)
  on('fs.write', (_$, e) => {
    const w = e as { path: string; text: string }
    files.set(w.path, w.text)
    return { value: undefined } as never
  })
  on('http.fetch', (_$, e) => {
    const f = e as { url: string; init?: { body?: string } }
    posts.push({ url: f.url, body: f.init?.body ?? '' })
    return { value: { status: 200, ok: true, headers: {}, text: '{"ok":true}' } } as never
  })
  on('command.run', () => ({ text: '' }) as never)
  await $.session.start({ cwd: '/Users/kamu', surface: 'desktop', isInteractive: true, startedAt: now } as never)
  await $.command.run({ command: 'kantor-relay', args: 'https://kantor.val.run/?key=abc' } as never)

  expect(files.get('/Users/kamu/.claude/kantor-agent/relay.txt')?.trim()).toBe('https://kantor.val.run/?key=abc')
  const last = posts[posts.length - 1]
  expect(last?.url).toBe('https://kantor.val.run/?key=abc')
  expect(JSON.parse(last?.body ?? '{}').label).toBe('Claude')
})

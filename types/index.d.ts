/** One worker in the office: the main loop ("Claude") or a subagent. */
export type KantorAgent = {
  /** 'main' for the main loop, else the subagent's agentId. */
  id: string
  name: string
  /** What it was asked to do: the prompt's opening or the Agent call's description. */
  task: string
  /** The tool it is using now, as a short label; '' when none. */
  tool: string
  tools: number
  /** Index into the look palette (shirt, hair, skin). */
  look: number
  /** Desk index 0-5, or -1 when every desk is taken. */
  desk: number
  status: 'working' | 'idle'
  /** Which wander loop it walks while idle. */
  loopIdx: number
  /** Arrival walk: where it started, when, and when it sits down. */
  fromX: number
  fromZ: number
  moveAt: number
  arriveAt: number
  /** Leaving the desk: when it stood up, and when its wander loop begins. */
  leftDeskAt: number
  loopStart: number
  startedAt: number
  endedAt: number
}

export type KantorOffice = { agents: KantorAgent[]; seq: number }

/** Another session on this computer, as it last reported itself in the shared store. */
export type KantorRemote = { sid: string; label: string; at: number; agents: KantorAgent[] }

declare module 'claude-code' {
  interface PluginState {
    'kantor-agent': { office: KantorOffice; remote: KantorRemote[] }
  }
}

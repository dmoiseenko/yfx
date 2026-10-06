export type YfxMode = 'discovery' | 'delivery'

export type YfxVerdict = 'useful' | 'noise'

/** A hook-backed probe as the hook will actually see it: `env` when a variable decides. */
export type YfxProbeState = { on: boolean; by: 'marker' | 'env' }

export type YfxToggles = { nudge: YfxProbeState; lens: YfxProbeState; labels: boolean }

/** The last substantive main-loop move, waiting for the user's label. */
export type YfxPending = {
  id: string
  prompt: string
  answer: string
  skills: string[]
  skillVerdict?: YfxVerdict
  at: number
}

/** One gold-tier label, as evals/README.md spells it, plus the move it labels. */
export type YfxLabel = YfxPending & {
  label: YfxMode
  why: string
  source: 'user'
}

declare module 'claude-code' {
  interface PluginState {
    yfx: { pending: YfxPending | null; toggles: YfxToggles; skillsThisTurn: string[] }
  }
}

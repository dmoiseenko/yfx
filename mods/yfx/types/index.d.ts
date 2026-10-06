export type YfxMode = 'discovery' | 'delivery'

export type YfxToggles = { nudge: boolean; lens: boolean; labels: boolean }

/** The last substantive main-loop move, waiting for the user's label. */
export type YfxPending = {
  id: string
  prompt: string
  answer: string
  skills: string[]
  skillVerdict?: 'useful' | 'noise'
  at: number
}

/** One gold-tier label, as evals/README.md spells it, plus the move it labels. */
export type YfxLabel = {
  id: string
  label: YfxMode
  why: string
  source: 'user'
  prompt: string
  answer: string
  skills: string[]
  skillVerdict?: 'useful' | 'noise'
  at: number
}

declare module 'claude-code' {
  interface PluginState {
    yfx: { pending: YfxPending | null; toggles: YfxToggles; skillsThisTurn: string[] }
  }
}

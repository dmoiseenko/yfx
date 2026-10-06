export type YfxMode = 'discovery' | 'delivery'

export type YfxVerdict = 'useful' | 'noise'

/** A prompt probe as it will act: `env` when RECALL_LOOP / FRESH_LENS_TRIGGER decides. */
export type YfxProbeState = { on: boolean; by: 'toggle' | 'env' }

export type YfxToggles = { nudge: YfxProbeState; lens: YfxProbeState; labels: boolean }

/** The last substantive main-loop move, waiting for the user's label. */
export type YfxPending = {
  id: string
  prompt: string
  answer: string
  /** Foresight only: whether the move came cold or warm in its session. */
  context?: string
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

// yfx in Claude Code. Two things the plain settings hooks cannot do:
//
// 1. Visible toggles. The probes stay off by default (CLAUDE.md); `/yfx on|off <probe>` flips
//    them and the status line says what is on. `nudge` and `lens` are the SAME marker files the
//    hooks in hooks/*.mjs read (.claude/recall-loop.on, .claude/fresh-lens.on, in the main
//    checkout so worktrees inherit them), so the mod and the hooks never disagree.
// 2. The gold tier (evals/README.md, Open UU #4): after a substantive turn, a band above the
//    prompt asks the user which mode their prompt was. Only the user knows their private intent;
//    every other label in evals/ is the designer's or an agent's proxy. `/yfx export` writes the
//    labelled moves to evals/out/ in the shape score.mjs and dataset.jsonl already use.
//
// It does not classify, nudge or audit by itself — that is still the hooks and skills.

import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { YfxLabel, YfxMode, YfxPending, YfxToggles } from '../types'

const OFF: YfxToggles = { nudge: false, lens: false, labels: false }
const toggles = atom({ plugin: 'yfx', key: 'toggles' } as const, OFF)
const pending = atom({ plugin: 'yfx', key: 'pending' } as const, null)
const skillsThisTurn = atom({ plugin: 'yfx', key: 'skillsThisTurn' } as const, [])

const YFX_SKILLS = new Set(['recall', 'clarify', 'fresh-lens', '2nd'])
const MARKERS = { nudge: 'recall-loop.on', lens: 'fresh-lens.on' } as const
const PROBES = ['nudge', 'lens', 'labels'] as const
type Probe = (typeof PROBES)[number]
const CLIP = 2000

// Same bar as hooks/recall-context.mjs: a trivial reply is not a move worth labelling.
const isSubstantive = (text: string) =>
  text.trim().length >= 20 && /[A-Za-zА-Яа-яЁё]/.test(text)

// The main checkout: a worktree lives at <main>/.claude/worktrees/<name>.
const mainRoot = async ($: EngineInterface) => {
  const root = await $.session.root()
  const at = root.indexOf('/.claude/worktrees/')
  return at === -1 ? root : root.slice(0, at)
}

const markerPath = async ($: EngineInterface, probe: 'nudge' | 'lens') =>
  `${await mainRoot($)}/.claude/${MARKERS[probe]}`

const exists = async ($: EngineInterface, path: string) => {
  try {
    await $.fs.stat(path)
    return true
  } catch {
    return false
  }
}

const loadToggles = async ($: EngineInterface): Promise<YfxToggles> => ({
  nudge: await exists($, await markerPath($, 'nudge')),
  lens: await exists($, await markerPath($, 'lens')),
  labels: (await $.store.get('labels-on')) === true,
})

const showStatus = ($: EngineInterface, t: YfxToggles) => {
  const dot = (on: boolean) => (on ? '●' : '○')
  $.ui.status(`yfx nudge${dot(t.nudge)} lens${dot(t.lens)} labels${dot(t.labels)}`)
}

const setProbe = async ($: EngineInterface, probe: Probe, on: boolean) => {
  if (probe === 'labels') {
    await $.store.set('labels-on', on)
  } else {
    const path = await markerPath($, probe)
    if (on) await $.fs.write(path, '')
    else await $.process.run(['rm', '-f', path])
  }
}

const refresh = async ($: EngineInterface) => {
  const t = await loadToggles($)
  await update($, toggles, () => t)
  showStatus($, t)
  return t
}

const storedLabels = async ($: EngineInterface) =>
  ((await $.store.get('labels')) as YfxLabel[] | undefined) ?? []

const saveLabel = async ($: EngineInterface, move: YfxPending, label: YfxMode, why: string) => {
  const entry: YfxLabel = {
    id: move.id,
    label,
    why,
    source: 'user',
    prompt: move.prompt,
    answer: move.answer,
    skills: move.skills,
    skillVerdict: move.skillVerdict,
    at: move.at,
  }
  const labels = await storedLabels($)
  await $.store.set('labels', [...labels.filter(one => one.id !== move.id), entry])
  await update($, pending, () => null)
  return labels.length + 1
}

const exportLabels = async ($: EngineInterface) => {
  const labels = await storedLabels($)
  if (labels.length === 0) return 'yfx: no labels to export yet.'
  const out = `${await mainRoot($)}/evals/out`
  // dataset.jsonl's move shape (resolution: the answer, for the hindsight labeller) and
  // score.mjs's label shape, so the existing harness reads both unchanged.
  const moves = labels.map(one => ({
    id: one.id,
    task: 'mode',
    prompt: one.prompt,
    context: one.skills.length > 0 ? `live; yfx skills fired: ${one.skills.join(', ')}` : 'live',
    resolution: one.answer,
    prior_claim: null,
  }))
  const blind = labels.map(one => ({ id: one.id, label: one.label, why: one.why, source: 'user' }))
  const jsonl = (rows: unknown[]) => rows.map(row => JSON.stringify(row)).join('\n') + '\n'
  await $.fs.write(`${out}/live-dataset.jsonl`, jsonl(moves))
  await $.fs.write(`${out}/live-blind.jsonl`, jsonl(blind))
  const verdicts = labels.filter(one => one.skillVerdict !== undefined).length
  return (
    `yfx: exported ${labels.length} labelled moves (${verdicts} with a skill verdict) to ` +
    `evals/out/live-dataset.jsonl and evals/out/live-blind.jsonl (gitignored: they hold your prompts).`
  )
}

const HELP =
  'yfx: /yfx · /yfx on|off nudge|lens|labels|all · ' +
  '/yfx label discovery|delivery [why] · /yfx export'

export const register: Register = on => {
  let prompt: string | null = null

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'yfx',
      description: 'y=f(x): toggle the probes, label the last move, export labels',
      argumentHint: '[on|off <probe> | label <mode> [why] | export]',
    })
    await refresh($)
    return next(e)
  })

  on('command.run', { command: 'yfx' }, async ($, e) => {
    const [verb = '', arg = '', ...rest] = e.args.trim().split(/\s+/).filter(Boolean)
    return { text: await runCommand($, verb, arg, rest.join(' ')) }
  })

  // Which yfx skills the model expanded this turn — tells the user what they are judging.
  on('skill.prompt', async ($, e, next) => {
    const name = e.skill.split(':').pop() ?? e.skill
    if (YFX_SKILLS.has(name)) {
      await update($, skillsThisTurn, list => (list.includes(name) ? list : [...list, name]))
    }
    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    // Only the user's own typed (or Remote Control) prompt is a move; a prompt folded into a
    // running turn, a notification, a peer's or a plugin's is not.
    const isUsers = e.origin.kind === 'composer' || e.origin.kind === 'bridge'
    if (isUsers && e.turnId === undefined) {
      prompt = isSubstantive(e.text) ? e.text : null
      await update($, skillsThisTurn, () => [])
    }
    return next(e)
  }).catch(($, e, next) => next(e)) // a labelling bug must never block the user's prompt

  on('turn.complete', async ($, e, next) => {
    const t = await read($, toggles)
    if (e.agentId === undefined && e.reason === 'answer' && t.labels && prompt !== null) {
      const at = await $.clock.now()
      const move: YfxPending = {
        id: `L-${at.toString(36)}`,
        prompt: prompt.slice(0, CLIP),
        answer: e.answer.slice(0, CLIP),
        skills: await read($, skillsThisTurn),
        at,
      }
      await update($, pending, () => move)
      prompt = null
    }
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const move = await read($, pending)
    if (e.props.hasSurvey || move === null || !(await read($, toggles)).labels) return next(e)

    const { Box, Button, Text } = $.ui.resolve(e)
    const label = (mode: YfxMode) => () => saveLabel($, move, mode, '')
    const verdict = (skillVerdict: 'useful' | 'noise') => () =>
      update($, pending, cur => (cur === null ? cur : { ...cur, skillVerdict }))

    return (
      <Box flexDirection="column">
        <Box>
          <Text dimColor>yfx · your last prompt was </Text>
          <Button key="discovery" hotkey="1" label="discovery" onPress={label('discovery')} />
          <Button key="delivery" hotkey="2" label="delivery" onPress={label('delivery')} />
          <Button key="skip" hotkey="0" label="skip" onPress={() => update($, pending, () => null)} />
        </Box>
        {move.skills.length > 0 && (
          <Box>
            <Text dimColor>
              {move.skills.map(name => `/${name}`).join(' ')} this turn was{' '}
              {move.skillVerdict === undefined ? '' : `${move.skillVerdict} · change: `}
            </Text>
            <Button key="useful" hotkey="u" label="useful" onPress={verdict('useful')} />
            <Button key="noise" hotkey="n" label="noise" onPress={verdict('noise')} />
          </Box>
        )}
      </Box>
    )
  })
}

async function runCommand($: EngineInterface, verb: string, arg: string, why: string) {
  if (verb === '' || verb === 'status') {
    const t = await refresh($)
    const count = (await storedLabels($)).length
    return `yfx: nudge ${t.nudge ? 'on' : 'off'}, lens ${t.lens ? 'on' : 'off'}, labels ${
      t.labels ? 'on' : 'off'
    } · ${count} labelled moves stored.\n${HELP}`
  }
  if (verb === 'on' || verb === 'off') {
    const which: readonly Probe[] =
      arg === 'all' ? PROBES : PROBES.includes(arg as Probe) ? [arg as Probe] : []
    if (which.length === 0) return HELP
    for (const probe of which) await setProbe($, probe, verb === 'on')
    const t = await refresh($)
    const envNote =
      (await $.env.get('RECALL_LOOP')) !== undefined || (await $.env.get('FRESH_LENS_TRIGGER')) !== undefined
        ? ' Note: RECALL_LOOP / FRESH_LENS_TRIGGER is set in the environment and overrides the markers for the hooks.'
        : ''
    return `yfx: ${which.join(', ')} ${verb}. nudge ${t.nudge ? 'on' : 'off'}, lens ${
      t.lens ? 'on' : 'off'
    }, labels ${t.labels ? 'on' : 'off'}.${envNote}`
  }
  if (verb === 'label') {
    if (arg !== 'discovery' && arg !== 'delivery') return HELP
    const move = await read($, pending)
    if (move === null) return 'yfx: no unlabelled move (labels must be on before the turn).'
    const count = await saveLabel($, move, arg, why)
    return `yfx: labelled ${move.id} as ${arg}. ${count} stored.`
  }
  if (verb === 'export') return exportLabels($)
  return HELP
}

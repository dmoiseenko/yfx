// yfx in Claude Code: the framework's always-on probes, owned by one mod.
//
// 1. Probes, each off by default (CLAUDE.md) and per project; `/yfx on|off <probe>` flips them
//    and the status line says what is on.
//    - nudge: the x/y diagnosis prompt (prompts/xy-nudge.md), attached to each substantive prompt
//      the user types — what the UserPromptSubmit hook hooks/recall-context.mjs did. It rides the
//      prompt, not the system prompt: a system-prompt section could reach a subagent, and the
//      fresh-lens auditor must stay free of the executor's framing.
//    - lens: at a commitment boundary (git commit / merge, gh pr create / merge) the model gets
//      the fresh-lens reminder (prompts/fresh-lens.md) beside the command's result — what the
//      PreToolUse hook hooks/fresh-lens-trigger.mjs did. Non-blocking, as before.
//    RECALL_LOOP / FRESH_LENS_TRIGGER still decide first when set (1/true/on/yes or
//    0/false/off/no): the evals use RECALL_LOOP=0 as the clean control.
// 2. The gold tier (evals/README.md, Open UU #4): after a substantive turn, a band above the
//    prompt asks the user which mode their prompt was. Only the user knows their private intent;
//    every other label in evals/ is the designer's or an agent's proxy. Labels are kept per
//    project, outside every repository; `/yfx export` copies this project's into evals/out/ for
//    `RUN=live node evals/score.mjs`, and only where that folder is gitignored.

import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { YfxLabel, YfxMode, YfxPending, YfxProbeState, YfxToggles, YfxVerdict } from '../types'

const OFF: YfxToggles = {
  nudge: { on: false, by: 'toggle' },
  lens: { on: false, by: 'toggle' },
  labels: false,
}
const toggles = atom({ plugin: 'yfx', key: 'toggles' } as const, OFF)
const pending = atom({ plugin: 'yfx', key: 'pending' } as const, null)
const skillsThisTurn = atom({ plugin: 'yfx', key: 'skillsThisTurn' } as const, [])

const YFX_SKILLS = new Set(['recall', 'clarify', 'fresh-lens', '2nd'])
const PROBES = ['nudge', 'lens', 'labels'] as const
type Probe = (typeof PROBES)[number]
type PromptProbe = 'nudge' | 'lens'
const ENV: Record<PromptProbe, string> = { nudge: 'RECALL_LOOP', lens: 'FRESH_LENS_TRIGGER' }
// The unambiguous "a decision is locking" commands. Not a content or ambiguity check: detecting
// ambiguity would re-import the executor's blindness the trigger exists to route around.
// git's global options may come first: `git -C <dir> commit`, `git -c k=v merge`,
// `git --no-pager commit`.
const COMMITMENT =
  /\bgit(?:\s+(?:-[Cc]\s+\S+|--(?:git-dir|work-tree|namespace)(?:=|\s+)\S+|-{1,2}[\w-]+(?:=\S+)?))*\s+(?:commit|merge)(?![\w-])|\bgh\s+pr\s+(?:create|merge)(?![\w-])/
const CLIP = 2000
// $.fs reads and writes at most 4 MiB; stop short of it rather than fail inside a key press.
const LABELS_MAX_BYTES = 3.5 * 1024 * 1024

// A trivial reply ("ok", "да") is neither worth a nudge nor a move worth labelling.
const isSubstantive = (text: string) =>
  text.trim().length >= 20 && /[A-Za-zА-Яа-яЁё]/.test(text)

// The repository's main checkout: a worktree at <main>/.claude/worktrees/<name> shares its
// switches and its labels.
const roots = async ($: EngineInterface) => {
  const here = await $.session.root()
  const at = here.indexOf('/.claude/worktrees/')
  return { here, main: at === -1 ? here : here.slice(0, at) }
}

// Per project: turning a probe on in one repository must not turn it on in every other.
const probeKey = async ($: EngineInterface, probe: Probe) => `${probe}-on:${(await roots($)).main}`

const effective = async ($: EngineInterface, probe: PromptProbe): Promise<YfxProbeState> => {
  // Literal names: the engine lists the variables a module reads from its source.
  const value =
    (probe === 'nudge' ? await $.env.get('RECALL_LOOP') : await $.env.get('FRESH_LENS_TRIGGER')) ?? ''
  if (/^(0|false|off|no)$/i.test(value)) return { on: false, by: 'env' }
  if (/^(1|true|on|yes)$/i.test(value)) return { on: true, by: 'env' }
  return { on: (await $.store.get(await probeKey($, probe))) === true, by: 'toggle' }
}

const loadToggles = async ($: EngineInterface): Promise<YfxToggles> => ({
  nudge: await effective($, 'nudge'),
  lens: await effective($, 'lens'),
  labels: (await $.store.get(await probeKey($, 'labels'))) === true,
})

// Claude Code pins a plugin's status as a notice under the prompt, with its own "yfx:" and a ⚠
// mark, so the line says no name of its own, and is shown only while a probe is on: a standing
// ⚠ for "everything off" reads as a fault.
const showStatus = ($: EngineInterface, t: YfxToggles) => {
  if (!t.nudge.on && !t.lens.on && !t.labels) {
    $.ui.status(undefined)
    return
  }
  const dot = (on: boolean) => (on ? '●' : '○')
  const probe = (name: string, s: YfxProbeState) => `${name}${dot(s.on)}${s.by === 'env' ? '(env)' : ''}`
  $.ui.status(`${probe('nudge', t.nudge)} ${probe('lens', t.lens)} labels${dot(t.labels)}`)
}

const describe = (t: YfxToggles) => {
  const probe = (s: YfxProbeState) => `${s.on ? 'on' : 'off'}${s.by === 'env' ? ' (set by env)' : ''}`
  return `nudge ${probe(t.nudge)}, lens ${probe(t.lens)}, labels ${t.labels ? 'on' : 'off'}`
}

const refresh = async ($: EngineInterface) => {
  const t = await loadToggles($)
  await update($, toggles, () => t)
  showStatus($, t)
  return t
}

const setProbe = async ($: EngineInterface, probe: Probe, on: boolean) =>
  $.store.set(await probeKey($, probe), on)

// The texts the model reads, kept as files so evals/card-pull.mjs replays the very same words.
const loadPrompt = async ($: EngineInterface, name: string) => {
  try {
    return (await $.fs.read(`${$.plugin.root}/prompts/${name}.md`)).trim()
  } catch {
    $.ui.toast(`yfx: prompts/${name}.md is missing; that probe stays silent.`)
    return ''
  }
}

// Labels live in one JSONL file per project under the user's Claude directory: never inside a
// repository (they hold prompts), never in $.store (one 4 MiB file shared by every project).
const labelsFile = async ($: EngineInterface) => {
  const { main } = await roots($)
  // A readable name plus a hash of the whole path: `/a-b/c` and `/a/b-c` must not share a file.
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(main))
  const hash = [...new Uint8Array(digest).slice(0, 6)].map(b => b.toString(16).padStart(2, '0')).join('')
  const name = main.split('/').filter(Boolean).pop()?.replace(/[^A-Za-z0-9._-]+/g, '-') ?? 'root'
  return `${await labelsDir($)}/${name}-${hash}.jsonl`
}

// Every label is one appended line, never a rewrite: a hand-edited or torn line is skipped on
// read but stays in the file, and two sessions sharing the file (a checkout and its worktrees)
// cannot lose each other's labels. A relabel appends again; the last line for an id wins.
const readLabels = async ($: EngineInterface, path: string): Promise<YfxLabel[]> => {
  if (!(await $.fs.exists(path))) return []
  const byId = new Map<string, YfxLabel>()
  let bad = 0
  for (const line of (await $.fs.read(path)).split('\n')) {
    if (line.trim() === '') continue
    try {
      const one = JSON.parse(line) as YfxLabel
      byId.delete(one.id) // re-insert, so a relabel keeps its latest position
      byId.set(one.id, one)
    } catch {
      bad += 1
    }
  }
  if (bad > 0) $.ui.toast(`yfx: skipped ${bad} unreadable line(s) in ${path} (left in place)`)
  return [...byId.values()]
}

// Labels the move pending NOW (with its verdict as it stands), never a copy a drawing captured;
// `expectedId` is the move the user was looking at, and a press on a move that is no longer
// pending does nothing.
const saveLabel = async ($: EngineInterface, label: YfxMode, why: string, expectedId?: string) => {
  const move = await read($, pending)
  if (move === null || (expectedId !== undefined && move.id !== expectedId)) {
    return { saved: false as const, reason: 'no unlabelled move (labels must be on before the turn).' }
  }
  const path = await labelsFile($)
  const line = JSON.stringify({ ...move, label, why, source: 'user' } satisfies YfxLabel) + '\n'
  // The limit is in bytes ($.fs reads at most 4 MiB); Cyrillic is two bytes a character.
  const size = (await $.fs.exists(path)) ? (await $.fs.stat(path)).size : 0
  if (size + new TextEncoder().encode(line).length > LABELS_MAX_BYTES) {
    const reason = `${path} is full; export and move it aside to keep labelling.`
    $.ui.toast(`yfx: ${reason}`)
    return { saved: false as const, reason }
  }
  await $.process.run(['mkdir', '-p', path.slice(0, path.lastIndexOf('/'))])
  const wrote = await $.process.run(['tee', '-a', path], { stdin: line })
  if (wrote.exitCode !== 0) return { saved: false as const, reason: `could not append to ${path}.` }
  await update($, pending, cur => (cur?.id === move.id ? null : cur))
  return { saved: true as const, id: move.id, count: (await readLabels($, path)).length }
}

const labelsDir = async ($: EngineInterface) =>
  `${(await $.env.get('CLAUDE_CONFIG_DIR')) ?? `${await $.env.get('HOME')}/.claude`}/yfx/labels`

// Where the labels go: the yfx checkout whose evals read them — from any project, since every
// working session is eval data. Given once (`/yfx export <path>`), then remembered; the
// session's own repository is the default only when it is that checkout.
const exportRoot = async ($: EngineInterface, given: string) => {
  const isYfx = async (dir: string) => $.fs.exists(`${dir}/evals/score.mjs`)
  if (given !== '') return (await isYfx(given)) ? given : null
  const saved = (await $.store.get('export-root')) as string | undefined
  if (saved !== undefined && (await isYfx(saved))) return saved
  const { main } = await roots($)
  return (await isYfx(main)) ? main : null
}

const exportLabels = async ($: EngineInterface, given: string) => {
  const root = await exportRoot($, given)
  if (root === null) {
    return given === ''
      ? 'not a yfx checkout here — export once with /yfx export <path to your yfx clone>.'
      : `${given} has no evals/score.mjs — not a yfx checkout.`
  }
  await $.store.set('export-root', root)
  const out = 'evals/out'
  const ignored = await $.process.run(['git', '-C', root, 'check-ignore', '-q', `${out}/live-dataset.jsonl`])
  if (ignored.exitCode !== 0) {
    return `not exporting — ${root}/${out}/ is not gitignored, and the labels hold your prompts.`
  }
  // Every project's labels: each file is one project's, named by its path.
  const dir = await labelsDir($)
  const files = (await $.fs.exists(dir)) ? await $.fs.list(dir) : []
  const labels: YfxLabel[] = []
  for (const file of files) {
    if (file.kind === 'file' && file.name.endsWith('.jsonl')) labels.push(...(await readLabels($, `${dir}/${file.name}`)))
  }
  if (labels.length === 0) return 'no labels yet.'
  // dataset.jsonl's move shape (resolution: the answer, for the hindsight labeller) and
  // score.mjs's label shape; `RUN=live` points the harness at these names.
  const moves = labels.map(one => ({
    id: one.id,
    task: 'mode',
    prompt: one.prompt,
    // Foresight only: what was knowable before the move (warm or cold). Which skills fired is
    // hindsight — the agent's own reading of the move — and rides in `skills`, which no
    // classifier reads.
    context: one.context ?? 'live',
    resolution: one.answer,
    prior_claim: null,
    skills: one.skills,
    skill_verdict: one.skillVerdict ?? null,
  }))
  const blind = labels.map(one => ({ id: one.id, label: one.label, why: one.why, source: 'user' }))
  const jsonl = (rows: unknown[]) => rows.map(row => JSON.stringify(row)).join('\n') + '\n'
  await $.fs.write(`${root}/${out}/live-dataset.jsonl`, jsonl(moves))
  await $.fs.write(`${root}/${out}/live-blind.jsonl`, jsonl(blind))
  const verdicts = labels.filter(one => one.skillVerdict !== undefined).length
  return (
    `exported ${labels.length} labelled moves (${verdicts} with a skill verdict) to ` +
    `${root}/${out}/live-{dataset,blind}.jsonl. Score: RUN=live node evals/classify.mjs mode ` +
    `&& RUN=live node evals/score.mjs`
  )
}

// Claude Code already prefixes a command's output with the plugin's name, so the text says no
// "yfx:" of its own (it did, and read "yfx: yfx: ...").
const HELP =
  'usage: /yfx · /yfx on|off nudge|lens|labels|all · ' +
  '/yfx label discovery|delivery [why] · /yfx export [path to yfx]'

export const register: Register = on => {
  let prompt: string | null = null
  let context = 'live'
  let moves = 0 // substantive user prompts this session (a reload restarts it)
  let nudge = ''
  let lensReminder = ''

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'yfx',
      description: 'y=f(x): toggle the probes, label the last move, export labels',
      argumentHint: '[on|off <probe> | label <mode> [why] | export [path]]',
    })
    nudge = await loadPrompt($, 'xy-nudge')
    lensReminder = await loadPrompt($, 'fresh-lens')
    await refresh($)
    return next(e)
  })

  on('command.run', { command: 'yfx' }, async ($, e) => {
    const [verb = '', arg = '', ...rest] = e.args.trim().split(/\s+/).filter(Boolean)
    return { text: await runCommand($, verb, arg, rest.join(' ')) }
  })

  // Which yfx skills the model expanded this turn — tells the user what they are judging. Only
  // the bare names install.sh links, or the yfx plugin's own; another plugin's `x:recall` is not
  // ours. The event carries no agent id, so a yfx skill a subagent loads still counts.
  on('skill.prompt', async ($, e, next) => {
    const [owner, name] = e.skill.includes(':') ? e.skill.split(':', 2) : ['yfx', e.skill]
    if (owner === 'yfx' && name !== undefined && YFX_SKILLS.has(name)) {
      await update($, skillsThisTurn, list => (list.includes(name) ? list : [...list, name]))
    }
    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    // The user's own prompt — typed, by Remote Control, or a headless run's (`claude -p`, where
    // RECALL_LOOP=1 is how an A/B arm turns the nudge on). A notification's, a peer's or a
    // plugin's is not.
    const kind = e.origin.kind
    if (kind !== 'composer' && kind !== 'bridge' && kind !== 'sdk') return next(e)
    const substantive = isSubstantive(e.text)
    // A new prompt ends the chance to label the last one: a band still asking "your last
    // prompt was" during the next turn would get the new prompt's answer.
    await update($, pending, () => null)
    await update($, skillsThisTurn, () => [])
    // One typed over a running turn shares that turn's answer with the prompt before it, so
    // neither is a move with an answer of its own: nothing is offered for a label.
    prompt = substantive && e.turnId === undefined ? e.text : null
    context =
      moves === 0
        ? 'live; cold — the first substantive prompt of the session'
        : `live; warm — ${moves} earlier substantive prompt(s) this session`
    if (substantive) moves += 1
    const t = await refresh($)
    if (!substantive || !t.nudge.on || nudge === '') return next(e)
    return next({ ...e, context: [...(e.context ?? []), nudge] })
  }).catch(($, e, next) => next(e)) // a labelling bug must never block the user's prompt

  // The exogenous audit trigger: fires on the event, whatever the executor feels about the move.
  // The model reads the reminder beside the command's result, as it read the PreToolUse hook's.
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const ran = await next(e)
    if (ran.deny !== undefined || lensReminder === '' || !COMMITMENT.test(e.command)) return ran
    if (!(await effective($, 'lens')).on) return ran
    return { ...ran, context: [...(ran.context ?? []), lensReminder] }
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId !== undefined) return next(e)
    // Every main-loop turn consumes the prompt, labelled or not: one left over from an
    // interrupted turn must not pair with the answer of a later notification's turn.
    const asked = prompt
    prompt = null
    if (e.reason === 'answer' && asked !== null && (await read($, toggles)).labels) {
      const at = await $.clock.now()
      const move: YfxPending = {
        // Time alone collides (two moves in one millisecond, or across projects in the shared
        // export); a random tail keeps a relabel's "last line wins" from merging distinct moves.
        id: `L-${at.toString(36)}-${[...crypto.getRandomValues(new Uint8Array(3))].map(b => b.toString(16).padStart(2, '0')).join('')}`,
        prompt: asked.slice(0, CLIP),
        answer: e.answer.slice(0, CLIP),
        context,
        skills: await read($, skillsThisTurn),
        at,
      }
      await update($, pending, () => move)
    }
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const move = await read($, pending)
    const isQuiet = e.props.hasSurvey || e.props.isWorking
    if (isQuiet || move === null || !(await read($, toggles)).labels) return next(e)

    const { Box, Button, Text } = $.ui.resolve(e)
    const label = (mode: YfxMode) => () => saveLabel($, mode, '', move.id)
    const verdict = (skillVerdict: YfxVerdict) => () =>
      update($, pending, cur => (cur?.id === move.id ? { ...cur, skillVerdict } : cur))

    return (
      <Box flexDirection="column">
        <Box gap={1}>
          <Text dimColor>yfx · your last prompt was</Text>
          <Button key="discovery" hotkey="1" label="discovery" onPress={label('discovery')} />
          <Button key="delivery" hotkey="2" label="delivery" onPress={label('delivery')} />
          <Button key="skip" hotkey="0" label="skip" onPress={() => update($, pending, () => null)} />
        </Box>
        {move.skills.length > 0 && (
          <Box gap={1}>
            <Text dimColor>
              {move.skills.map(name => `/${name}`).join(' ')} this turn was
              {move.skillVerdict === undefined ? '' : ` ${move.skillVerdict} · change:`}
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
    const count = (await readLabels($, await labelsFile($))).length
    return `${describe(t)} · ${count} labelled moves for this project.\n${HELP}`
  }
  if (verb === 'on' || verb === 'off') {
    const which: readonly Probe[] =
      arg === 'all' ? PROBES : PROBES.includes(arg as Probe) ? [arg as Probe] : []
    if (which.length === 0) return HELP
    for (const probe of which) await setProbe($, probe, verb === 'on')
    const t = await refresh($)
    const stuck = which.filter(
      (probe): probe is PromptProbe =>
        probe !== 'labels' && t[probe].by === 'env' && t[probe].on !== (verb === 'on'),
    )
    const note =
      stuck.length > 0
        ? ` ${stuck.map(probe => `${probe} stays ${t[probe].on ? 'on' : 'off'} while ${ENV[probe]} is set`).join('; ')}.`
        : ''
    return `${describe(t)}.${note}`
  }
  if (verb === 'label') {
    if (arg !== 'discovery' && arg !== 'delivery') return HELP
    const result = await saveLabel($, arg, why)
    if (!result.saved) return `not labelled — ${result.reason}`
    return `labelled ${result.id} as ${arg}. ${result.count} stored for this project.`
  }
  if (verb === 'export') return exportLabels($, [arg, why].filter(Boolean).join(' '))
  return HELP
}

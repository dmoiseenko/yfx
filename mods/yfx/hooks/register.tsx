// yfx in Claude Code. Two things the plain settings hooks cannot do:
//
// 1. Visible toggles. The probes stay off by default (CLAUDE.md); `/yfx on|off <probe>` flips
//    them and the status line says what is on. `nudge` and `lens` are the marker files the hooks
//    in hooks/*.mjs read (.claude/recall-loop.on, .claude/fresh-lens.on), and the state shown is
//    the hooks' own rule, re-implemented here because a mod cannot import a Node module: a marker
//    in this checkout OR in the main one (worktrees live at <main>/.claude/worktrees/<name>),
//    unless an environment variable decides first. Keep effective() in step with the hooks.
// 2. The gold tier (evals/README.md, Open UU #4): after a substantive turn, a band above the
//    prompt asks the user which mode their prompt was. Only the user knows their private intent;
//    every other label in evals/ is the designer's or an agent's proxy. Labels are kept per
//    project, outside every repository; `/yfx export` copies this project's into evals/out/ for
//    `RUN=live node evals/score.mjs`, and only where that folder is gitignored.
//
// It does not classify, nudge or audit by itself — that is still the hooks and skills.

import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { YfxLabel, YfxMode, YfxPending, YfxProbeState, YfxToggles, YfxVerdict } from '../types'

const OFF: YfxToggles = {
  nudge: { on: false, by: 'marker' },
  lens: { on: false, by: 'marker' },
  labels: false,
}
const toggles = atom({ plugin: 'yfx', key: 'toggles' } as const, OFF)
const pending = atom({ plugin: 'yfx', key: 'pending' } as const, null)
const skillsThisTurn = atom({ plugin: 'yfx', key: 'skillsThisTurn' } as const, [])

const YFX_SKILLS = new Set(['recall', 'clarify', 'fresh-lens', '2nd'])
const MARKERS = { nudge: 'recall-loop.on', lens: 'fresh-lens.on' } as const
const PROBES = ['nudge', 'lens', 'labels'] as const
type Probe = (typeof PROBES)[number]
type HookProbe = 'nudge' | 'lens'
const CLIP = 2000
// $.fs reads and writes at most 4 MiB; stop short of it rather than fail inside a key press.
const LABELS_MAX_BYTES = 3.5 * 1024 * 1024

// Same bar as hooks/recall-context.mjs: a trivial reply is not a move worth labelling.
const isSubstantive = (text: string) =>
  text.trim().length >= 20 && /[A-Za-zА-Яа-яЁё]/.test(text)

// The main checkout behind a worktree (<main>/.claude/worktrees/<name>), by each hook's own rule:
// recall-context.mjs cuts at the first `/.claude/worktrees/` anywhere in the path, while
// fresh-lens-trigger.mjs only matches a path that ends at the worktree's root.
const MAIN_OF: Record<HookProbe, (dir: string) => string> = {
  nudge: dir => {
    const at = dir.indexOf('/.claude/worktrees/')
    return at === -1 ? dir : dir.slice(0, at)
  },
  lens: dir => dir.match(/^(.*)\/\.claude\/worktrees\/[^/]+$/)?.[1] ?? dir,
}

const roots = async ($: EngineInterface) => {
  const here = await $.session.root()
  return { here, main: MAIN_OF.nudge(here) }
}

const markerPaths = async ($: EngineInterface, probe: HookProbe) => {
  const here = await $.session.root()
  return [...new Set([here, MAIN_OF[probe](here)])].map(root => `${root}/.claude/${MARKERS[probe]}`)
}

// What the hook will do, by the hook's own precedence.
const effective = async ($: EngineInterface, probe: HookProbe): Promise<YfxProbeState> => {
  if (probe === 'nudge') {
    // recall-context.mjs: an explicit falsy RECALL_LOOP forces off, a truthy one forces on.
    const value = (await $.env.get('RECALL_LOOP')) ?? ''
    if (/^(0|false|off|no)$/i.test(value)) return { on: false, by: 'env' }
    if (/^(1|true|on|yes)$/i.test(value)) return { on: true, by: 'env' }
  } else if ((await $.env.get('FRESH_LENS_TRIGGER')) === '1') {
    // fresh-lens-trigger.mjs: only "1" turns it on; nothing turns it off.
    return { on: true, by: 'env' }
  }
  for (const path of await markerPaths($, probe)) {
    if (await $.fs.exists(path)) return { on: true, by: 'marker' }
  }
  return { on: false, by: 'marker' }
}

// Per project: turning labels on in one repository must not start asking in every other.
const labelsOnKey = async ($: EngineInterface) => `labels-on:${(await roots($)).main}`

const loadToggles = async ($: EngineInterface): Promise<YfxToggles> => ({
  nudge: await effective($, 'nudge'),
  lens: await effective($, 'lens'),
  labels: (await $.store.get(await labelsOnKey($))) === true,
})

const showStatus = ($: EngineInterface, t: YfxToggles) => {
  const dot = (on: boolean) => (on ? '●' : '○')
  const probe = (name: string, s: YfxProbeState) => `${name}${dot(s.on)}${s.by === 'env' ? '(env)' : ''}`
  $.ui.status(`yfx ${probe('nudge', t.nudge)} ${probe('lens', t.lens)} labels${dot(t.labels)}`)
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

// A marker is a local opt-in: keep it out of commits, or one `git add -A` turns the probe on for
// every clone. Where the repository does not ignore it, ignore it locally (.git/info/exclude).
// Returns a warning when the marker could not be kept out of commits.
const keepUncommitted = async ($: EngineInterface, root: string, probe: HookProbe) => {
  const rel = `.claude/${MARKERS[probe]}`
  const ignored = await $.process.run(['git', '-C', root, 'check-ignore', '-q', rel])
  if (ignored.exitCode !== 1) return '' // 0: ignored already; 128: not a git checkout
  // Ask git where the file is: `.git` is a file in a submodule or a linked worktree.
  const where = await $.process.run(['git', '-C', root, 'rev-parse', '--git-path', 'info/exclude'])
  const found = where.stdout.trim()
  if (where.exitCode !== 0 || found === '') return ` ${rel} is not gitignored here — do not commit it.`
  const exclude = found.startsWith('/') ? found : `${root}/${found}`
  try {
    const text = (await $.fs.exists(exclude)) ? await $.fs.read(exclude) : ''
    await $.fs.write(exclude, `${text}${text === '' || text.endsWith('\n') ? '' : '\n'}${rel}\n`)
    return ''
  } catch {
    return ` ${rel} is not gitignored here and ${exclude} could not be written — do not commit it.`
  }
}

// Returns a warning for the user, or ''.
const setProbe = async ($: EngineInterface, probe: Probe, on: boolean) => {
  if (probe === 'labels') {
    await $.store.set(await labelsOnKey($), on)
    return ''
  }
  if (on) {
    // The main checkout's marker: one switch for the repository, its worktrees included.
    const main = MAIN_OF[probe](await $.session.root())
    await $.fs.write(`${main}/.claude/${MARKERS[probe]}`, '')
    return keepUncommitted($, main, probe)
  }
  // Off means off wherever the hook would look.
  await $.process.run(['rm', '-f', ...(await markerPaths($, probe))])
  return ''
}

// Labels live in one JSONL file per project under the user's Claude directory: never inside a
// repository (they hold prompts), never in $.store (one 4 MiB file shared by every project).
const labelsFile = async ($: EngineInterface) => {
  const home = (await $.env.get('CLAUDE_CONFIG_DIR')) ?? `${await $.env.get('HOME')}/.claude`
  const { main } = await roots($)
  // A readable name plus a hash of the whole path: `/a-b/c` and `/a/b-c` must not share a file.
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(main))
  const hash = [...new Uint8Array(digest).slice(0, 6)].map(b => b.toString(16).padStart(2, '0')).join('')
  const name = main.split('/').filter(Boolean).pop()?.replace(/[^A-Za-z0-9._-]+/g, '-') ?? 'root'
  return `${home}/yfx/labels/${name}-${hash}.jsonl`
}

const storedLabels = async ($: EngineInterface, path: string): Promise<YfxLabel[]> => {
  if (!(await $.fs.exists(path))) return []
  const text = await $.fs.read(path)
  const labels: YfxLabel[] = []
  let bad = 0
  for (const line of text.split('\n')) {
    if (line.trim() === '') continue
    try {
      labels.push(JSON.parse(line) as YfxLabel)
    } catch {
      bad += 1 // a torn or hand-edited line costs itself, not every label before it
    }
  }
  if (bad > 0) $.ui.toast(`yfx: skipped ${bad} unreadable line(s) in ${path}`)
  return labels
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
  const labels = (await storedLabels($, path)).filter(one => one.id !== move.id)
  const entry: YfxLabel = { ...move, label, why, source: 'user' }
  const text = [...labels, entry].map(one => JSON.stringify(one)).join('\n') + '\n'
  // The limit is in bytes; Cyrillic is two bytes a character in UTF-8.
  if (new TextEncoder().encode(text).length > LABELS_MAX_BYTES) {
    const reason = `${path} is full; export and move it aside to keep labelling.`
    $.ui.toast(`yfx: ${reason}`)
    return { saved: false as const, reason }
  }
  await $.fs.write(path, text)
  await update($, pending, cur => (cur?.id === move.id ? null : cur))
  return { saved: true as const, id: move.id, count: labels.length + 1 }
}

const exportLabels = async ($: EngineInterface) => {
  const path = await labelsFile($)
  const labels = await storedLabels($, path)
  if (labels.length === 0) return 'yfx: no labels for this project yet.'
  const { main } = await roots($)
  const out = 'evals/out'
  const ignored = await $.process.run([
    'git', '-C', main, 'check-ignore', '-q', `${out}/live-dataset.jsonl`,
  ])
  if (ignored.exitCode !== 0) {
    return (
      `yfx: not exporting — ${out}/ is not gitignored here, and the labels hold your prompts. ` +
      `They stay in ${path}.`
    )
  }
  // dataset.jsonl's move shape (resolution: the answer, for the hindsight labeller) and
  // score.mjs's label shape; `RUN=live` points the harness at these names.
  const moves = labels.map(one => ({
    id: one.id,
    task: 'mode',
    prompt: one.prompt,
    // Foresight only: classify.mjs shows `context` to the classifier, and which skills fired is
    // hindsight (the agent's own reading of the move). It rides in `skills`, which no
    // classifier reads.
    context: 'live',
    resolution: one.answer,
    prior_claim: null,
    skills: one.skills,
    skill_verdict: one.skillVerdict ?? null,
  }))
  const blind = labels.map(one => ({ id: one.id, label: one.label, why: one.why, source: 'user' }))
  const jsonl = (rows: unknown[]) => rows.map(row => JSON.stringify(row)).join('\n') + '\n'
  await $.fs.write(`${main}/${out}/live-dataset.jsonl`, jsonl(moves))
  await $.fs.write(`${main}/${out}/live-blind.jsonl`, jsonl(blind))
  const verdicts = labels.filter(one => one.skillVerdict !== undefined).length
  return (
    `yfx: exported ${labels.length} labelled moves (${verdicts} with a skill verdict) to ` +
    `${out}/live-dataset.jsonl and live-blind.jsonl. Score: RUN=live node evals/classify.mjs mode ` +
    `&& RUN=live node evals/score.mjs`
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
    // Only the user's own typed (or Remote Control) prompt is a move; a prompt folded into a
    // running turn, a notification, a peer's or a plugin's is not.
    const isUsers = e.origin.kind === 'composer' || e.origin.kind === 'bridge'
    if (isUsers && e.turnId === undefined) {
      prompt = isSubstantive(e.text) ? e.text : null
      await update($, skillsThisTurn, () => [])
      // A new prompt ends the chance to label the last one: a band still asking "your last
      // prompt was" during the next turn would get the new prompt's answer.
      await update($, pending, () => null)
    }
    return next(e)
  }).catch(($, e, next) => next(e)) // a labelling bug must never block the user's prompt

  on('turn.complete', async ($, e, next) => {
    if (e.agentId !== undefined) return next(e)
    // Every main-loop turn consumes the prompt, labelled or not: one left over from an
    // interrupted turn must not pair with the answer of a later notification's turn.
    const asked = prompt
    prompt = null
    if (e.reason === 'answer' && asked !== null && (await read($, toggles)).labels) {
      const at = await $.clock.now()
      const move: YfxPending = {
        id: `L-${at.toString(36)}`,
        prompt: asked.slice(0, CLIP),
        answer: e.answer.slice(0, CLIP),
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
    const count = (await storedLabels($, await labelsFile($))).length
    return `yfx: ${describe(t)} · ${count} labelled moves for this project.\n${HELP}`
  }
  if (verb === 'on' || verb === 'off') {
    const which: readonly Probe[] =
      arg === 'all' ? PROBES : PROBES.includes(arg as Probe) ? [arg as Probe] : []
    if (which.length === 0) return HELP
    let warnings = ''
    for (const probe of which) warnings += await setProbe($, probe, verb === 'on')
    const t = await refresh($)
    const stuck = which.filter(
      (probe): probe is HookProbe => probe !== 'labels' && t[probe].by === 'env' && t[probe].on !== (verb === 'on'),
    )
    const note =
      stuck.length > 0
        ? ` ${stuck.join(', ')} stays ${verb === 'on' ? 'off' : 'on'}: an environment variable decides it for the hook.`
        : ''
    return `yfx: ${describe(t)}.${note}${warnings}`
  }
  if (verb === 'label') {
    if (arg !== 'discovery' && arg !== 'delivery') return HELP
    const result = await saveLabel($, arg, why)
    if (!result.saved) return `yfx: not labelled — ${result.reason}`
    return `yfx: labelled ${result.id} as ${arg}. ${result.count} stored for this project.`
  }
  if (verb === 'export') return exportLabels($)
  return HELP
}

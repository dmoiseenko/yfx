import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

const ROOT = '/repo'
const HOME = '/home/u'
const LABELS = `${HOME}/.claude/yfx/labels/-repo.jsonl`
const ORIGIN = { kind: 'composer' } as const
const PRESENTATION = { isFullscreen: false, columns: 120 }
const BAND = {
  hasSurvey: false,
  isWorking: false,
  maxRows: 4,
  bodyColumns: 120,
  scroll: { offset: 0, bodyRows: 4 },
  view: {},
}
const PROMPT = {
  text: 'давай подумаем что ещё может помочь ускорить подбор x',
  wait: false,
  origin: ORIGIN,
}
const answered = (answer: string, turnId = 't1') => ({
  answer,
  durationMs: 10,
  isAborted: false,
  turnId,
  reason: 'answer' as const,
})

type World = { files: Map<string, string>; ignored: Set<string> }

// The engine beneath the plugin: an in-memory filesystem, and git answering check-ignore from
// `ignored` (paths relative to the checkout), as far as these tests reach it.
const world = (on: On, root = ROOT, env: Record<string, string> = {}): World => {
  const files = new Map<string, string>()
  const ignored = new Set<string>(['evals/out/live-dataset.jsonl'])
  mock.store(on)
  mock.env(on, { HOME, ...env })
  mock.clock(on, { now: 1_000 })
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('command.register', (_$, e) => ({ value: { command: e.name } }))
  on('prompt.submit', (_$, e) => ({ text: e.text, origin: e.origin }))
  on('turn.complete', (_$, e) => ({ text: e.answer }))
  on('skill.prompt', (_$, e) => ({ text: e.text }))
  on('session.root', () => ({ value: root }))
  on('fs.exists', (_$, e) => ({
    value: files.has(e.path) || [...files.keys()].some(path => path.startsWith(`${e.path}/`)),
  }))
  on('fs.read', (_$, e) => {
    const text = files.get(e.path)
    return text === undefined ? { deny: 'ENOENT' } : { value: text }
  })
  on('fs.write', (_$, e) => {
    files.set(e.path, e.text)
    return { value: undefined }
  })
  on('process.run', (_$, e) => {
    const [cmd, ...args] = e.argv
    let exitCode = 0
    if (cmd === 'rm') for (const path of args.slice(1)) files.delete(path)
    if (cmd === 'git') exitCode = ignored.has(args[args.length - 1] ?? '') ? 0 : 1
    return {
      value: { exitCode, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false },
    }
  })
  on('ui.status', () => ({ value: undefined }))
  // The engine's own band: an empty box.
  on('ui.render', ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box key="engine" />
  })
  return { files, ignored }
}

const yfx = async ($: Engine, args: string) =>
  (await $.command.run({ command: 'yfx', args, origin: ORIGIN, presentation: PRESENTATION })).text ?? ''

const band = ($: Engine, surface: 'terminal' | 'desktop' = 'terminal') =>
  $.ui.mount({ plugin: 'yfx', surface, component: 'AbovePrompt', props: BAND })

test('a labelled turn is kept outside the repo and exported with its skill verdict', async ($, on) => {
  const { files } = world(on)
  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: true })
  expect(await yfx($, 'on labels')).toContain('labels on')

  await $.prompt.submit(PROMPT)
  await $.skill.prompt({ skill: 'clarify', text: '...' })
  await $.turn.complete(answered('Three directions: ...'))

  for (const surface of ['desktop', 'terminal'] as const) {
    const ui = await band($, surface)
    expect(await ui.find({ key: 'discovery' })).toBeDefined()
    expect(await ui.find({ text: /\/clarify/ })).toBeDefined()
    if (surface === 'terminal') {
      await ui.press({ key: 'useful' })
      await ui.press({ key: 'discovery' })
      expect(await ui.find({ key: 'discovery' })).toBeUndefined()
    }
    await ui.unmount()
  }

  const stored = JSON.parse(files.get(LABELS) ?? '{}')
  expect(stored.label).toBe('discovery')
  expect(stored.skillVerdict).toBe('useful')
  expect([...files.keys()].some(path => path.startsWith(`${ROOT}/`))).toBe(false)

  expect(await yfx($, 'export')).toContain('exported 1 labelled moves (1 with a skill verdict)')
  const blind = JSON.parse(files.get(`${ROOT}/evals/out/live-blind.jsonl`) ?? '{}')
  expect(blind).toEqual({ id: expect.any(String), label: 'discovery', why: '', source: 'user' })
  const move = JSON.parse(files.get(`${ROOT}/evals/out/live-dataset.jsonl`) ?? '{}')
  expect(move).toEqual({
    id: blind.id,
    task: 'mode',
    prompt: PROMPT.text,
    context: 'live; yfx skills fired: clarify',
    resolution: 'Three directions: ...',
    prior_claim: null,
    skills: ['clarify'],
    skill_verdict: 'useful',
  })
})

test('export refuses where evals/out is not gitignored', async ($, on) => {
  const { files, ignored } = world(on)
  ignored.clear()
  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: true })
  await yfx($, 'on labels')
  await $.prompt.submit(PROMPT)
  await $.turn.complete(answered('ok'))
  expect(await yfx($, 'label delivery because')).toContain('labelled')

  expect(await yfx($, 'export')).toContain('not gitignored')
  expect([...files.keys()].some(path => path.startsWith(`${ROOT}/`))).toBe(false)
})

test('labels off: a turn asks nothing', async ($, on) => {
  world(on)
  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: true })
  await $.prompt.submit(PROMPT)
  await $.turn.complete(answered('ok'))
  expect(await (await band($)).find({ key: 'discovery' })).toBeUndefined()
})

test("an interrupted turn's prompt is not paired with a later turn's answer", async ($, on) => {
  world(on)
  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: true })
  await yfx($, 'on labels')
  await $.prompt.submit(PROMPT)
  await $.turn.complete({ ...answered(''), isAborted: true, reason: 'aborted' })
  // A notification's turn: no prompt.submit from the user before it.
  await $.turn.complete(answered('task finished', 't2'))
  expect(await (await band($)).find({ key: 'discovery' })).toBeUndefined()
})

test("another plugin's skill of the same name is not counted as a yfx skill", async ($, on) => {
  world(on)
  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: true })
  await yfx($, 'on labels')
  await $.prompt.submit(PROMPT)
  await $.skill.prompt({ skill: 'other:recall', text: '...' })
  await $.turn.complete(answered('ok'))
  const ui = await band($)
  expect(await ui.find({ key: 'discovery' })).toBeDefined()
  expect(await ui.find({ key: 'useful' })).toBeUndefined()
})

test('from a worktree: on writes the main marker and keeps it uncommitted; off clears both', async ($, on) => {
  const { files } = world(on, `${ROOT}/.claude/worktrees/wt`)
  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: true })

  expect(await yfx($, 'on nudge')).toContain('nudge on')
  expect(files.has(`${ROOT}/.claude/recall-loop.on`)).toBe(true)
  expect(files.get(`${ROOT}/.git/info/exclude`)).toBeUndefined() // no .git in this world

  files.set(`${ROOT}/.claude/worktrees/wt/.claude/recall-loop.on`, '')
  expect(await yfx($, 'off nudge')).toContain('nudge off')
  expect(files.has(`${ROOT}/.claude/recall-loop.on`)).toBe(false)
  expect(files.has(`${ROOT}/.claude/worktrees/wt/.claude/recall-loop.on`)).toBe(false)
})

test('a worktree-local marker shows as on, as the hook sees it', async ($, on) => {
  const { files } = world(on, `${ROOT}/.claude/worktrees/wt`)
  files.set(`${ROOT}/.claude/worktrees/wt/.claude/fresh-lens.on`, '')
  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: true })
  expect(await yfx($, '')).toContain('lens on')
})

test('an unignored marker is added to .git/info/exclude', async ($, on) => {
  const { files } = world(on)
  files.set(`${ROOT}/.git/info/exclude`, '# local\n.serena/')
  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: true })
  await yfx($, 'on lens')
  expect(files.get(`${ROOT}/.git/info/exclude`)).toBe('# local\n.serena/\n.claude/fresh-lens.on\n')
})

test('RECALL_LOOP=0 wins over the marker, and the toggle says so', async ($, on) => {
  world(on, ROOT, { RECALL_LOOP: '0' })
  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: true })
  const said = await yfx($, 'on nudge')
  expect(said).toContain('nudge off (set by env)')
  expect(said).toContain('nudge stays off')
})

test('FRESH_LENS_TRIGGER=0 is not an override: the hook only reads "1"', async ($, on) => {
  world(on, ROOT, { FRESH_LENS_TRIGGER: '0' })
  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: true })
  const said = await yfx($, 'on lens')
  expect(said).toContain('lens on,')
  expect(said).not.toContain('stays')
})

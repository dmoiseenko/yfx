import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

const ROOT = '/repo'
const HOME = '/home/u'
const LABELS_DIR = `${HOME}/.claude/yfx/labels/`
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

type World = {
  files: Map<string, string>
  ignored: Set<string>
  contexts: (readonly string[] | undefined)[]
  statuses: (string | undefined)[]
}

// The engine beneath the plugin: an in-memory filesystem, and git answering check-ignore from
// `ignored` (paths relative to the checkout), as far as these tests reach it.
const world = (
  on: On,
  root = ROOT,
  env: Record<string, string> = {},
  store: Record<string, unknown> = {},
): World => {
  const files = new Map<string, string>()
  const ignored = new Set<string>(['evals/out/live-dataset.jsonl'])
  const contexts: (readonly string[] | undefined)[] = []
  const statuses: (string | undefined)[] = []
  mock.store(on, store)
  mock.env(on, { HOME, ...env })
  mock.clock(on, { now: 1_000 })
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('command.register', (_$, e) => ({ value: { command: e.name } }))
  on('prompt.submit', (_$, e) => {
    contexts.push(e.context)
    return { text: e.text, origin: e.origin }
  })
  on('tool.call', () => ({ result: { stdout: '', stderr: '', interrupted: false } }))
  on('turn.complete', (_$, e) => ({ text: e.answer }))
  on('skill.prompt', (_$, e) => ({ text: e.text }))
  on('session.root', () => ({ value: root }))
  on('fs.exists', (_$, e) => ({
    value: files.has(e.path) || [...files.keys()].some(path => path.startsWith(`${e.path}/`)),
  }))
  on('fs.stat', (_$, e) => {
    const text = files.get(e.path)
    if (text === undefined) return { deny: 'ENOENT' }
    return { value: { kind: 'file', size: new TextEncoder().encode(text).length, mtimeMs: 0, isLink: false } }
  })
  on('fs.list', (_$, e) => ({
    value: [...files.keys()]
      .filter(path => path.startsWith(`${e.path}/`) && !path.slice(e.path.length + 1).includes('/'))
      .map(path => ({ name: path.slice(e.path.length + 1), kind: 'file' as const, size: 0, mtimeMs: 0, isLink: false })),
  }))
  on('fs.read', (_$, e) => {
    if (e.path.endsWith('/prompts/xy-nudge.md')) return { value: 'NUDGE\n' }
    if (e.path.endsWith('/prompts/fresh-lens.md')) return { value: 'LENS\n' }
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
    if (cmd === 'tee') {
      const path = args[args.length - 1] ?? ''
      files.set(path, (files.get(path) ?? '') + (e.init?.stdin ?? ''))
    }
    let stdout = ''
    if (cmd === 'git' && args.includes('check-ignore')) exitCode = ignored.has(args[args.length - 1] ?? '') ? 0 : 1
    if (cmd === 'git' && args.includes('rev-parse')) stdout = '.git/info/exclude\n'
    return {
      value: { exitCode, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false },
    }
  })
  on('ui.status', (_$, e) => {
    statuses.push(e.text)
    return { value: undefined }
  })
  on('ui.toast', () => ({ value: undefined }))
  // The engine's own band: an empty box.
  on('ui.render', ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box key="engine" />
  })
  files.set(`${ROOT}/evals/score.mjs`, '// yfx')
  return { files, ignored, contexts, statuses }
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

  const labelsFile = [...files.keys()].find(path => path.startsWith(LABELS_DIR)) ?? ''
  expect(labelsFile).toMatch(/\/repo-[0-9a-f]{12}\.jsonl$/)
  const stored = JSON.parse(files.get(labelsFile) ?? '{}')
  expect(stored.label).toBe('discovery')
  expect(stored.skillVerdict).toBe('useful')
  expect([...files.keys()].filter(path => path.startsWith(`${ROOT}/`))).toEqual([`${ROOT}/evals/score.mjs`])

  expect(await yfx($, 'export')).toContain('exported 1 labelled moves (1 with a skill verdict)')
  const blind = JSON.parse(files.get(`${ROOT}/evals/out/live-blind.jsonl`) ?? '{}')
  expect(blind).toEqual({ id: expect.any(String), label: 'discovery', why: '', source: 'user' })
  const move = JSON.parse(files.get(`${ROOT}/evals/out/live-dataset.jsonl`) ?? '{}')
  expect(move).toEqual({
    id: blind.id,
    task: 'mode',
    prompt: PROMPT.text,
    context: 'live; cold — the first substantive prompt of the session',
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
  expect(files.has(`${ROOT}/evals/out/live-blind.jsonl`)).toBe(false)
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

const bash = ($: Engine, command: string) =>
  $.tool.call({ tool: 'Bash', command })

test('nudge: attached to a substantive user prompt only while on', async ($, on) => {
  const { contexts } = world(on)
  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: true })
  await $.prompt.submit(PROMPT)
  expect(await yfx($, 'on nudge')).toContain('nudge on')
  await $.prompt.submit(PROMPT)
  await $.prompt.submit({ ...PROMPT, text: 'да' })
  await $.prompt.submit({ ...PROMPT, origin: { kind: 'task-notification' } })
  expect(contexts).toEqual([undefined, ['NUDGE'], undefined, undefined])
})

test('nudge: RECALL_LOOP=0 wins over the toggle and says so — the evals\' clean control', async ($, on) => {
  const { contexts } = world(on, ROOT, { RECALL_LOOP: '0' })
  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: true })
  const said = await yfx($, 'on nudge')
  expect(said).toContain('nudge off (set by env)')
  expect(said).toContain('nudge stays off while RECALL_LOOP is set')
  await $.prompt.submit(PROMPT)
  expect(contexts).toEqual([undefined])
})

test('lens: the reminder rides a commitment command\'s result, and nothing else', async ($, on) => {
  world(on)
  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: true })
  expect((await bash($, 'git commit -m x')).context).toBeUndefined()
  await yfx($, 'on lens')
  expect((await bash($, 'git commit -m x')).context).toEqual(['LENS'])
  expect((await bash($, 'gh pr create --fill')).context).toEqual(['LENS'])
  expect((await bash($, 'git status')).context).toBeUndefined()
})

test('probes are per project: on in one repository is off in another', async ($, on) => {
  world(on, '/other', {}, { [`nudge-on:${ROOT}`]: true })
  await $.session.start({ cwd: '/other', surface: 'terminal', isInteractive: true })
  expect(await yfx($, '')).toContain('nudge off')
})

test('a worktree shares its main checkout\'s switches', async ($, on) => {
  world(on, `${ROOT}/.claude/worktrees/wt`, {}, { [`lens-on:${ROOT}`]: true })
  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: true })
  expect(await yfx($, '')).toContain('lens on')
})

test('a new prompt drops the unlabelled move, and the band hides while a turn runs', async ($, on) => {
  world(on)
  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: true })
  await yfx($, 'on labels')
  await $.prompt.submit(PROMPT)
  await $.turn.complete(answered('first'))
  const working = await $.ui.mount({
    plugin: 'yfx',
    surface: 'terminal',
    component: 'AbovePrompt',
    props: { ...BAND, isWorking: true },
  })
  expect(await working.find({ key: 'discovery' })).toBeUndefined()

  await $.prompt.submit({ ...PROMPT, text: 'теперь просто сделай коммит этих изменений' })
  expect(await (await band($)).find({ key: 'discovery' })).toBeUndefined()
  expect(await yfx($, 'label delivery')).toContain('not labelled')
})

test('a band drawn for an earlier move redraws, and a press labels the move it shows now', async ($, on) => {
  const { files } = world(on)
  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: true })
  await yfx($, 'on labels')
  await $.prompt.submit(PROMPT)
  await $.turn.complete(answered('first'))
  const stale = await band($)
  expect(await stale.find({ key: 'discovery' })).toBeDefined()

  await $.prompt.submit({ ...PROMPT, text: 'а теперь второй содержательный вопрос про x' })
  await $.turn.complete(answered('second', 't2'))
  expect(await stale.find({ key: 'discovery' })).toBeDefined()
  await stale.press({ key: 'discovery' })
  const saved = files.get([...files.keys()].find(path => path.startsWith(LABELS_DIR)) ?? '') ?? ''
  expect(JSON.parse(saved).answer).toBe('second')
})

test('an unreadable line costs itself, not the labels around it', async ($, on) => {
  const { files } = world(on)
  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: true })
  await yfx($, 'on labels')
  await $.prompt.submit(PROMPT)
  await $.turn.complete(answered('ok'))
  await yfx($, 'label discovery')
  const path = [...files.keys()].find(one => one.startsWith(LABELS_DIR)) ?? ''
  files.set(path, `${files.get(path)}{"torn\n`)
  expect(await yfx($, '')).toContain('1 labelled moves')
})

test('nudge: a prompt typed over a running turn, and a headless one, still get it', async ($, on) => {
  const { contexts } = world(on, ROOT, {}, { [`nudge-on:${ROOT}`]: true })
  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: true })
  await $.prompt.submit({ ...PROMPT, turnId: 't1' })
  await $.prompt.submit({ ...PROMPT, origin: { kind: 'sdk' } })
  expect(contexts).toEqual([['NUDGE'], ['NUDGE']])
})

test('a prompt typed over a running turn is not offered for a label', async ($, on) => {
  world(on, ROOT, {}, { [`labels-on:${ROOT}`]: true })
  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: true })
  await $.prompt.submit(PROMPT)
  await $.prompt.submit({ ...PROMPT, text: 'и ещё уточнение к этому же вопросу про x', turnId: 't1' })
  await $.turn.complete(answered('one answer to both'))
  expect(await (await band($)).find({ key: 'discovery' })).toBeUndefined()
})

test('labels append: a torn line stays in the file, and a later prompt is warm', async ($, on) => {
  const { files } = world(on, ROOT, {}, { [`labels-on:${ROOT}`]: true })
  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: true })
  await $.prompt.submit(PROMPT)
  await $.turn.complete(answered('first'))
  await yfx($, 'label discovery')
  const path = [...files.keys()].find(one => one.startsWith(LABELS_DIR)) ?? ''
  files.set(path, `${files.get(path)}{"torn\n`)
  await $.prompt.submit({ ...PROMPT, text: 'второй содержательный вопрос про y' })
  await $.turn.complete(answered('second', 't2'))
  expect(await yfx($, 'label delivery')).toContain('2 stored')
  const lines = (files.get(path) ?? '').trim().split('\n')
  expect(lines).toHaveLength(3)
  expect(lines[1]).toBe('{"torn')
  expect(JSON.parse(lines[2] ?? '{}').context).toBe('live; warm — 1 earlier substantive prompt(s) this session')
})

test('export from another project goes to the remembered yfx checkout, with every project', async ($, on) => {
  const { files } = world(on, '/work', {}, { [`labels-on:/work`]: true })
  await $.session.start({ cwd: '/work', surface: 'terminal', isInteractive: true })
  await $.prompt.submit(PROMPT)
  await $.turn.complete(answered('ok'))
  await yfx($, 'label delivery')
  expect(await yfx($, 'export')).toContain('not a yfx checkout here')
  expect(await yfx($, `export ${ROOT}`)).toContain('exported 1 labelled moves')
  expect(files.has(`${ROOT}/evals/out/live-blind.jsonl`)).toBe(true)
  expect(await yfx($, 'export')).toContain(`${ROOT}/evals/out`)
})

test('lens: git global options before commit still trigger it', async ($, on) => {
  world(on, ROOT, {}, { [`lens-on:${ROOT}`]: true })
  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: true })
  expect((await bash($, 'git -C /repo/.claude/worktrees/wt commit -m x')).context).toEqual(['LENS'])
  expect((await bash($, 'git commit-tree abc')).context).toBeUndefined()
})

test('status: shown only while a probe is on, with no name of its own', async ($, on) => {
  const { statuses } = world(on)
  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: true })
  await yfx($, 'on labels')
  await yfx($, 'off labels')
  // The first, all-off session draws nothing; repeats are not sent again.
  expect(statuses).toEqual(['nudge○ lens○ labels●', undefined])
})

test('status: an environment variable deciding a probe keeps the line, (env) marked', async ($, on) => {
  const forcedOff = world(on, ROOT, { RECALL_LOOP: '0' })
  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: true })
  expect(forcedOff.statuses).toEqual(['nudge○(env) lens○ labels○'])
})

test('status: forced on by the environment', async ($, on) => {
  const { statuses } = world(on, ROOT, { FRESH_LENS_TRIGGER: '1' })
  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: true })
  await yfx($, '')
  expect(statuses).toEqual(['nudge○ lens●(env) labels○'])
})

import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

const ROOT = '/repo'
const ORIGIN = { kind: 'composer' } as const
const PRESENTATION = { isFullscreen: false, columns: 120 }
const BAND = { hasSurvey: false, isWorking: false, maxRows: 4, bodyColumns: 120, scroll: { offset: 0, bodyRows: 4 }, view: {} }
const PROMPT = { text: 'давай подумаем что ещё может помочь ускорить подбор x', wait: false, origin: ORIGIN }

// The engine beneath the plugin, as far as these tests reach it.
const world = (on: On, root = ROOT) => {
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('command.register', (_$, e) => ({ value: { command: e.name } }))
  on('prompt.submit', (_$, e) => ({ text: e.text, origin: e.origin }))
  on('turn.complete', (_$, e) => ({ text: e.answer }))
  on('skill.prompt', (_$, e) => ({ text: e.text }))
  on('session.root', () => ({ value: root }))
  on('fs.stat', () => ({ deny: 'ENOENT' }))
  on('ui.status', () => ({ value: undefined }))
  // The engine's own band: an empty box with a key the tests can look for.
  on('ui.render', ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box key="engine" />
  })
}

test('a substantive turn becomes a gold-tier label in the shape score.mjs reads', async ($, on) => {
  mock.store(on)
  mock.env(on, {})
  mock.clock(on, { now: 1_000 })
  const written = new Map<string, string>()
  world(on)
  on('fs.write', (_$, e) => {
    written.set(e.path, e.text)
    return { value: undefined }
  })

  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: true })
  const run = (args: string) =>
    $.command.run({ command: 'yfx', args, origin: ORIGIN, presentation: PRESENTATION })

  expect((await run('on labels')).text).toContain('labels on')

  await $.prompt.submit(PROMPT)
  await $.skill.prompt({ skill: 'clarify', text: '...' })
  await $.turn.complete({
    answer: 'Three directions: ...',
    durationMs: 10,
    isAborted: false,
    turnId: 't1',
    reason: 'answer',
  })

  for (const surface of ['desktop', 'terminal'] as const) {
    const ui = await $.ui.mount({
      plugin: 'yfx',
      surface,
      component: 'AbovePrompt',
      props: BAND,
    })
    expect(await ui.find({ key: 'discovery' })).toBeDefined()
    expect(await ui.find({ text: /\/clarify/ })).toBeDefined()
    if (surface === 'terminal') {
      await ui.press({ key: 'useful' })
      await ui.press({ key: 'discovery' })
      expect(await ui.find({ key: 'discovery' })).toBeUndefined()
    }
    await ui.unmount()
  }

  expect((await run('export')).text).toContain('exported 1 labelled moves')
  const blind = JSON.parse(written.get(`${ROOT}/evals/out/live-blind.jsonl`) ?? '{}')
  expect(blind).toEqual({ id: expect.any(String), label: 'discovery', why: '', source: 'user' })
  const move = JSON.parse(written.get(`${ROOT}/evals/out/live-dataset.jsonl`) ?? '{}')
  expect(move.task).toBe('mode')
  expect(move.id).toBe(blind.id)
  expect(move.resolution).toBe('Three directions: ...')
  expect(move.context).toBe('live; yfx skills fired: clarify')
})

test('labels off: a turn asks nothing', async ($, on) => {
  mock.store(on)
  mock.env(on, {})
  mock.clock(on)
  world(on)

  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: true })
  await $.prompt.submit(PROMPT)
  await $.turn.complete({ answer: 'ok', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' })

  const ui = await $.ui.mount({
    plugin: 'yfx',
    surface: 'terminal',
    component: 'AbovePrompt',
    props: BAND,
  })
  expect(await ui.find({ key: 'discovery' })).toBeUndefined()
})

test('from a worktree, a probe toggle writes the main checkout marker the hooks read', async ($, on) => {
  mock.store(on)
  mock.env(on, {})
  mock.clock(on)
  world(on, `${ROOT}/.claude/worktrees/wt`)
  const written: string[] = []
  on('fs.write', (_$, e) => {
    written.push(e.path)
    return { value: undefined }
  })

  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: true })
  await $.command.run({ command: 'yfx', args: 'on nudge', origin: ORIGIN, presentation: PRESENTATION })
  expect(written).toEqual([`${ROOT}/.claude/recall-loop.on`])
})

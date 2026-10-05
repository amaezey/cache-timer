import { expect, mock, test } from 'claude-code/testing'

const BAND = { hasSurvey: false, isWorking: false, maxRows: 5, bodyColumns: 80 } as never

// One finished turn: the state the idle bar draws from.
const idle = async ($: Parameters<Parameters<typeof test>[1]>[0], on: Parameters<Parameters<typeof test>[1]>[1]) => {
  mock.clock(on, { now: 1000 })
  mock.store(on)
  on('turn.start', (_, e) => ({ turnId: e.turnId }) as never)
  on('turn.complete', () => ({ text: 'ok' }))
  await $.turn.start({ text: 'hi', turnId: 't1' })
  await $.turn.complete({ answer: 'ok', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' })
}

// Every write to one of the mod's values, in order.
const watch = (on: Parameters<Parameters<typeof test>[1]>[1], key: string) => {
  const values: unknown[] = []
  on('state.set' as never, ((_: unknown, e: { key: string; value: unknown }, next: (e: unknown) => unknown) => {
    if (e.key === key) {
      values.push(e.value)
    }

    return next(e)
  }) as never)

  return values
}

// The idle bar must draw on both surfaces: a tree a surface refuses shows nothing.
for (const surface of ['desktop', 'terminal'] as const) {
  test(`idle bar draws on ${surface}`, async ($, on) => {
    await idle($, on)
    const ui = await $.ui.mount({ plugin: 'cache-timer', surface, component: 'AbovePrompt', props: BAND })

    expect(ui).toBeDefined()
    await ui.unmount()
  })
}

test('a running step is named by its real details, then cleared', async ($, on) => {
  mock.clock(on, { now: 1000 })
  on('tool.call', () => ({ result: 'ok' }) as never)
  const labels = watch(on, 'now')

  await $.tool.call({ tool: 'Read', file_path: '/Users/mae/notes/plan.md' } as never)

  expect(labels).toEqual(['Reading notes/plan.md', null])
})

test('the terminal bar has the same controls, and each one works by click', async ($, on) => {
  const writes: { key: string; value: unknown }[] = []
  on('state.set' as never, ((_: unknown, e: { key: string; value: unknown }, next: (e: unknown) => unknown) => {
    writes.push({ key: e.key, value: e.value })

    return next(e)
  }) as never)
  const flips = { get list() { return writes.filter(one => one.key === 'action').map(one => one.value) } }
  const times = { get list() { return writes.filter(one => one.key === 'lead').map(one => one.value) } }
  await idle($, on)
  const ui = await $.ui.mount({ plugin: 'cache-timer', surface: 'terminal', component: 'AbovePrompt', props: BAND })

  await ui.press({ key: 'auto' } as never)
  await ui.press({ key: 'what' } as never)
  await ui.press({ key: 'lead' } as never)
  await ui.press({ key: 'lead' } as never)
  await ui.press({ key: 'lead' } as never)

  expect(flips.list).toEqual(['compact', 'status'])
  // 5 is the default; each click steps on, and 10 wraps round to 2.
  expect(times.list.slice(-3)).toEqual([10, 2, 5])
})

test('the idle bar has working Compact and Handoff buttons', async ($, on) => {
  const pressed: string[] = []
  on('session.compact', () => {
    pressed.push('compact')

    return { skip: 'test' } as never
  })
  on('prompt.submit', (_, e) => {
    pressed.push(e.text)

    return { text: e.text } as never
  })
  await idle($, on)

  const ui = await $.ui.mount({ plugin: 'cache-timer', surface: 'desktop', component: 'AbovePrompt', props: BAND })
  await ui.press({ key: 'compact' } as never)
  await ui.press({ key: 'handoff' } as never)

  expect(pressed).toEqual(['compact', 'Write a handoff for this session with the ce-handoff skill.'])
})

test('/timer hides the bar, and again shows it', async ($, on) => {
  const flips = watch(on, 'hidden')
  on('command.register' as never, (() => ({ value: {} })) as never)
  await idle($, on)

  await $.command.run({ command: 'timer', args: '' } as never)
  await $.command.run({ command: 'timer', args: '' } as never)

  expect(flips).toEqual([true, false])
})

test('auto-compact fires once in the last five minutes, and only when switched on', { timeoutMs: 30000 }, async ($, on) => {
  const clock = mock.clock(on, { now: 1000 })
  mock.store(on)
  on('turn.start', (_, e) => ({ turnId: e.turnId }) as never)
  on('turn.complete', () => ({ text: 'ok' }))
  on('command.register' as never, (() => ({ value: {} })) as never)
  on('ui.toast' as never, (() => ({})) as never)
  on('session.start', (_, e) => ({ cwd: (e as { cwd: string }).cwd }) as never)
  on('fs.write' as never, (() => ({ value: undefined })) as never)
  let compactions = 0
  on('session.compact', () => {
    compactions += 1

    return {} as never
  })

  await $.session.start({ source: 'startup', cwd: '/tmp' } as never)
  await $.turn.start({ text: 'hi', turnId: 't1' })
  await $.turn.complete({ answer: 'ok', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' })

  // Off: the last five minutes pass and nothing happens.
  await clock.advance(56 * 60 * 1000)
  expect(compactions).toBe(0)

  // On: a fresh turn, then the same wait compacts exactly once.
  const ui = await $.ui.mount({ plugin: 'cache-timer', surface: 'desktop', component: 'AbovePrompt', props: BAND })
  await ui.press({ key: 'auto' } as never)
  await $.turn.start({ text: 'hi', turnId: 't2' })
  await $.turn.complete({ answer: 'ok', durationMs: 1, isAborted: false, turnId: 't2', reason: 'answer' })
  await clock.advance(54 * 60 * 1000)
  expect(compactions).toBe(0)
  await clock.advance(2 * 60 * 1000)
  expect(compactions).toBe(1)
  await clock.advance(120 * 60 * 1000)
  expect(compactions).toBe(1)
})

test('auto-status asks once in the last five minutes, and its own turn does not re-arm it', { timeoutMs: 30000 }, async ($, on) => {
  const clock = mock.clock(on, { now: 1000 })
  mock.store(on)
  on('turn.start', (_, e) => ({ turnId: e.turnId }) as never)
  on('turn.complete', () => ({ text: 'ok' }))
  on('command.register' as never, (() => ({ value: {} })) as never)
  on('session.start', (_, e) => ({ cwd: (e as { cwd: string }).cwd }) as never)
  on('fs.write' as never, (() => ({ value: undefined })) as never)
  const asked: string[] = []
  on('prompt.submit', (_, e) => {
    asked.push(e.text)

    return { text: e.text } as never
  })

  await $.session.start({ source: 'startup', cwd: '/tmp' } as never)
  await $.turn.start({ text: 'hi', turnId: 't1' })
  await $.turn.complete({ answer: 'ok', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' })
  const ui = await $.ui.mount({ plugin: 'cache-timer', surface: 'desktop', component: 'AbovePrompt', props: BAND })
  await ui.press({ key: 'auto' } as never)
  await ui.select({ key: 'what', value: 'status' } as never)
  await ui.select({ key: 'lead', value: '10' } as never)

  // Ten minutes was picked, so 49 minutes is too soon and 51 is past it.
  await clock.advance(49 * 60 * 1000)
  expect(asked.length).toBe(0)
  await clock.advance(2 * 60 * 1000)
  expect(asked).toEqual(['Status check: where are we, what is done, and what is next? Keep it short.'])

  // The turn that answers it, then two more hours alone: no second ask.
  await $.turn.start({ text: asked[0], turnId: 't2' })
  await $.turn.complete({ answer: 'ok', durationMs: 1, isAborted: false, turnId: 't2', reason: 'answer' })
  await clock.advance(120 * 60 * 1000)
  expect(asked.length).toBe(1)
})

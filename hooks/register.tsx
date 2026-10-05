import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Action } from '../types'

// The step running right now, in real details; null between steps.
const now = atom({ plugin: 'cache-timer', key: 'now' } as const, null)
const busy = atom({ plugin: 'cache-timer', key: 'busy' } as const, false)
const hidden = atom({ plugin: 'cache-timer', key: 'hidden' } as const, false)
// What to do by itself shortly before the cache goes cold, and how many
// minutes before. Compacting shrinks the chat; a status check keeps it whole
// and warm for another hour.
const action = atom({ plugin: 'cache-timer', key: 'action' } as const, 'off')
// Which of the two it was last set to, so switching Auto back on restores it.
const prefer = atom({ plugin: 'cache-timer', key: 'prefer' } as const, 'compact')
const lead = atom({ plugin: 'cache-timer', key: 'lead' } as const, 5)
const warmUntil = atom({ plugin: 'cache-timer', key: 'warmUntil' } as const, null)
// The two beats a drawing follows: the desktop redraws every second, the
// terminal once a minute.
const second = atom({ plugin: 'cache-timer', key: 'second' } as const, null)
const minute = atom({ plugin: 'cache-timer', key: 'minute' } as const, null)
const LEADS = [2, 5, 10]
// `short` is the terminal's: its dropdown is as wide as its longest option.
const CHOICES: readonly { is: Action; label: string; short: string }[] = [
  { is: 'compact', label: 'Compact', short: 'Compact' },
  { is: 'status', label: 'Status check', short: 'Status' },
]

// ponytail: assumes the subscription's one-hour cache. It is five minutes on
// usage credits or an API key, and a mod can't read which; change it here.
const CACHE_MINUTES = 60

// What auto-status sends, as if typed.
const STATUS = 'Status check: where are we, what is done, and what is next? Keep it short.'

// What the Handoff button sends, as if typed.
const HANDOFF = 'Write a handoff for this session with the ce-handoff skill.'

const short = (path: unknown) => String(path ?? 'a file').split('/').slice(-2).join('/')

const firstLine = (text: unknown) => String(text ?? '').trim().split('\n')[0].slice(0, 70)

// One line built from the real facts of a tool call: the file, the search
// words, the command. Unknown tools fall through to their own name.
const describe = (e: Record<string, unknown>): string => {
  const tool = String(e.tool)

  switch (tool) {
    case 'Bash':
      return e.description
        ? `${String(e.description)} · ${firstLine(e.command)}`
        : `Running ${firstLine(e.command)}`
    case 'Read':
      return `Reading ${short(e.file_path)}`
    case 'Edit':
    case 'Write':
    case 'NotebookEdit':
      return `Changing ${short(e.file_path ?? e.notebook_path)}`
    case 'Grep':
    case 'Glob':
      return `Searching ${e.path ? short(e.path) : 'this folder'} for "${String(e.pattern)}"`
    case 'WebSearch':
      return `Searching the web for "${String(e.query)}"`
    case 'WebFetch':
      return `Reading ${String(e.url).replace(/^https?:\/\//, '')}`
    case 'Agent':
      return `Handing off to a helper: ${String(e.description ?? 'a side task')}`
    case 'Skill':
      return `Loading the ${String(e.skill)} skill`
    case 'AskUserQuestion':
      return 'Waiting on your answer'
    default:
      return `Using ${(tool.split('__').pop() ?? tool).replace(/_/g, ' ')}`
  }
}

const clock = (left: number) => `${String(Math.floor(left / 60)).padStart(2, '0')}:${String(left % 60).padStart(2, '0')}`

// flame:start
type Mood = { stage: number; color: string; glow: string; word: string }

// Hot to cold: roaring, steady, small and worried, a flame turned to ice and
// shivering, then an ice cube. `tip` is how tall the flame's point stands (1
// is full height).
const STAGES = [
  { above: 30 * 60, color: '#f04e23', glow: '#ffb020', size: 1.05, flicker: 0.5, tip: 1 },
  { above: 15 * 60, color: '#f58220', glow: '#ffd04a', size: 1, flicker: 0.5, tip: 0.85 },
  { above: 5 * 60, color: '#f0a83c', glow: '#fff1a8', size: 0.95, flicker: 1, tip: 0.6 },
  { above: 0, color: '#6fa8dc', glow: '#d6ecff', size: 0.9, flicker: 1, tip: 0.4 },
  { above: -1, color: '#7fb6e8', glow: '#cfe9fb', size: 1, flicker: 0, tip: 0 },
]

const stageOf = (left: number) => STAGES.findIndex(s => left > s.above)

const mood = (left: number): Mood => {
  const stage = stageOf(left)
  const { color, glow } = STAGES[stage]

  return { stage, color, glow, word: stage === 4 ? 'cold cache' : clock(left) }
}

const WIDTH = 200
const HEIGHT = 34
const EDGE = 11
// The flame's outline. Everything above the round body is squashed by
// `tip`, so the point sinks as the fire cools while the body keeps its size.
const flame = (tip: number) => {
  const y = (above: number) => -5 - above * tip

  return `M0 ${y(17)}C6 ${y(10)} 9 ${y(5)} 9 -5A9 9 0 0 1 -9 -5C-9 ${y(4)} -5 ${y(6)} -4 ${y(11)}C-2 ${y(8)} -1 ${y(12)} 0 ${y(17)}Z`
}

const drift = (x: number, delay: number, from: number, to: number, mark: string) =>
  `<g transform="translate(${x} ${(from + to) / 2})"><animateTransform attributeName="transform" type="translate" values="${x} ${from};${x} ${to}" dur="1s" begin="${-delay}s" repeatCount="indefinite"/>` +
  `<animate attributeName="opacity" values="1;0" dur="1s" begin="${-delay}s" repeatCount="indefinite"/>${mark}</g>`

const BROWN = '#5a2a0a'
const NAVY = '#23405e'
const EYES = `<circle cx="-3" cy="-6" r="1.2" fill="${BROWN}"/><circle cx="3" cy="-6" r="1.2" fill="${BROWN}"/>`

// One face per stage: a grin, a smile, a worried frown, then wide-eyed fright.
const FACES = [
  `${EYES}<path d="M-3 -3.4q3 4.4 6 0z" fill="${BROWN}" stroke="${BROWN}" stroke-width="0.8" stroke-linejoin="round"/>`,
  `${EYES}<path d="M-2.5 -3q2.5 2.5 5 0" stroke="${BROWN}" stroke-width="1.2" fill="none" stroke-linecap="round"/>`,
  `${EYES}<path d="M-5 -8.4l2.6 -1M5 -8.4l-2.6 -1M-2 -1.8q2 -1.6 4 0" stroke="${BROWN}" stroke-width="1" fill="none" stroke-linecap="round"/>`,
  `<circle cx="-3" cy="-6" r="1.7" fill="#fff"/><circle cx="3" cy="-6" r="1.7" fill="#fff"/><circle cx="-3" cy="-6" r="0.8" fill="${NAVY}"/><circle cx="3" cy="-6" r="0.8" fill="${NAVY}"/><ellipse cy="-1.6" rx="1.3" ry="1.6" fill="${NAVY}"/>`,
]

const SPARK = (glow: string) => `<circle r="1.1" fill="${glow}"/>`
const SNOW = '<path d="M-1.4 0h2.8M0 -1.4v2.8M-1 -1l2 2M-1 1l2 -2" stroke="#8fc3ee" stroke-width="0.6" stroke-linecap="round"/>'

const fire = (m: Mood) => {
  const { size, flicker, tip } = STAGES[m.stage]
  const freezing = m.stage === 3
  // Nearly out, he is the ice cube's own pale blue with its blue edge, so the
  // step from frozen flame to cube reads as one thing changing shape.
  const [color, glow, edge] = freezing ? ['#bfe3fa', '#eef8ff', '#7fb6e8'] : [m.color, m.glow, '#fff']
  const shape = flame(tip)
  const shiver = freezing
    ? '<animateTransform attributeName="transform" type="translate" values="-0.7 0;0.7 0;-0.7 0" dur="0.2s" repeatCount="indefinite"/>'
    : ''
  const extras =
    m.stage === 0
      ? drift(-7, 0, -14, -27, SPARK(m.glow)) + drift(6, 0.5, -14, -27, SPARK(m.glow))
      : freezing
        ? drift(-8, 0, -27, -15, SNOW) + drift(7, 0.5, -27, -15, SNOW)
        : ''

  return (
    `<g>${shiver}<g transform="translate(0 -5) scale(${size}) translate(0 5)">` +
    `<g><animateTransform attributeName="transform" type="scale" values="1 1;1.07 0.93;0.95 1.08;1 1" dur="${flicker}s" repeatCount="indefinite"/>` +
    `<path d="${shape}" fill="${color}" stroke="${edge}" stroke-width="2" stroke-linejoin="round" paint-order="stroke"/><path d="${shape}" fill="${glow}" transform="translate(0 1.5) scale(0.58)"/></g>` +
    `${FACES[m.stage]}</g>${extras}</g>`
  )
}

const ICE =
  '<rect x="-10" y="-15" width="20" height="20" rx="5.5" fill="#fff"/><rect x="-9" y="-14" width="18" height="18" rx="4.5" fill="#bfe3fa" stroke="#7fb6e8" stroke-width="1.2"/>' +
  '<path d="M-5.5 -10.5l3 -1.5" stroke="#fff" stroke-width="1.4" stroke-linecap="round"/>' +
  '<path d="M-5 -5q1.5 1.5 3 0M2 -5q1.5 1.5 3 0" stroke="#3a6f9f" stroke-width="1.1" fill="none" stroke-linecap="round"/>' +
  '<path d="M-1.5 -1.2h3" stroke="#3a6f9f" stroke-width="1.1" stroke-linecap="round"/>' +
  '<path d="M8 -18v4M6 -16h4" stroke="#7fb6e8" stroke-width="1" stroke-linecap="round"><animate attributeName="opacity" values="0;1;0" dur="1s" repeatCount="indefinite"/></path>'

// Light lettering in the system face: white where it sits on the fire's
// colour, a see-through dark where it sits on the empty track (a see-through
// white in a dark theme). The attributes repeat the style for a surface that
// drops the style block.
const FONT = '-apple-system, system-ui, sans-serif'

const STYLE = `<style>.c{font:500 10.5px ${FONT};letter-spacing:.2px;font-variant-numeric:tabular-nums}.on{fill:#fff}.off{fill:#1f1e1c;fill-opacity:.6}@media (prefers-color-scheme:dark){.off{fill:#fff;fill-opacity:.75}}</style>`

const lettering = (onColour: boolean) =>
  `class="c ${onColour ? 'on' : 'off'}" font-family="${FONT}" font-size="10.5" font-weight="500" ${onColour ? 'fill="#fff"' : 'fill="#1f1e1c" fill-opacity="0.6"'}`

// A fat bar that drains right to left with the fire riding its end and the
// clock inside it, on whichever side the fire is not. It shows one moment:
// the app may throw a picture away and draw it again at any time (it does
// while the prompt is typed in), so a picture that counted for itself would
// jump back to the moment it was made. The mod redraws it each second instead.
// Where the fire's base sits so its round body, as tall as the bar, rests on
// the bar's centre line (y 23). The tip and the sparks rise into the space
// above the bar, which is what the picture's extra height is for.
const FLOOR = 28

// The armed stretch: the bar's last minutes frosted over, fading in from
// the moment the auto action runs to the cold end. No hard edge.
const frost = (to: number) =>
  `<linearGradient id="f" gradientUnits="userSpaceOnUse" x1="1" x2="${to}"><stop offset="0" stop-color="#e6f3ff" stop-opacity="0.7"/><stop offset="1" stop-color="#e6f3ff" stop-opacity="0"/></linearGradient>` +
  `<clipPath id="t"><rect x="1" y="14" width="${WIDTH - 2}" height="18" rx="9"/></clipPath>` +
  `<rect x="1" y="14" width="${to - 1}" height="18" fill="url(#f)" clip-path="url(#t)"/>`

const picture = (left: number, m: Mood, lead: number | null) => {
  const share = Math.min(Math.max(left / (CACHE_MINUTES * 60), 0), 1)
  const at = EDGE + (WIDTH - 2 * EDGE) * share
  const frosted = lead === null ? 0 : EDGE + ((WIDTH - 2 * EDGE) * lead) / CACHE_MINUTES
  // On the left the clock starts clear of the frost, which would wash it out.
  const side =
    share > 0.5
      ? `x="${Math.max(12, frosted + 4)}" ${lettering(true)}`
      : `x="${WIDTH - 13}" text-anchor="end" ${lettering(false)}`

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">${STYLE}` +
    `<rect x="1" y="14" width="${WIDTH - 2}" height="18" rx="9" fill="#888" fill-opacity="0.3"/>` +
    `<rect x="1" y="14" width="${at + 8}" height="18" rx="9" fill="${m.color}"/>` +
    (lead === null || m.stage === 4 ? '' : frost(frosted)) +
    `<text y="26.5" ${side}>${m.word}</text>` +
    `<g transform="translate(${at} ${FLOOR})">${m.stage === 4 ? ICE : fire(m)}</g>` +
    `</svg>`
  )
}
// flame:end

// The desktop lines a row's children up by their tops and packs them edge to
// edge. Empty pictures hold the buttons apart and drop them BUTTON_DROP
// pixels, which puts their middle on the bar's centre line.
const BUTTON_DROP = 14
const spacer = (width: number, height: number) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="${width}" height="${height}" fill-opacity="0"/></svg>`

// The cache lifetime runs from the start of the last request that used it.
async function stamp($: EngineInterface) {
  const at = await $.clock.now()
  await update($, warmUntil, () => at + CACHE_MINUTES * 60000)
}

async function secondsLeft($: EngineInterface) {
  const until = await read($, warmUntil)

  return until === null ? null : Math.max(Math.ceil((until - (await $.clock.now())) / 1000), 0)
}

// The auto action runs once per idle stretch. Each one restarts the hour,
// so without this an unattended session would act again every 55 minutes.
// `isOwnTurn` marks the turn auto-status starts, which must not count as the
// person coming back.
let hasActed = false
let isOwnTurn = false

async function act($: EngineInterface, left: number) {
  const what = await read($, action)
  const isDue = what !== 'off' && left > 0 && left <= (await read($, lead)) * 60 && !hasActed

  if (!isDue || (await read($, busy))) {
    return
  }

  hasActed = true

  try {
    if (what === 'status') {
      isOwnTurn = true
      void $.prompt.submit({ text: STATUS, asUser: true })

      return
    }

    const { skip } = await $.session.compact()

    if (skip === undefined) {
      // The compaction was itself a request, so the cache is warm again.
      await stamp($)
      $.ui.toast('Compacted before the cache went cold')
    }
  } catch {
    // A turn started in the same moment: it will keep the cache warm itself.
  }
}

async function tick($: EngineInterface) {
  const left = await secondsLeft($)

  if (left === null) {
    return
  }

  await act($, left)

  const nextMinute = Math.ceil(left / 60)

  // The desktop's beat: only while the bar is showing, and never past zero,
  // where the ice cube has nothing left to count.
  if (!(await read($, busy)) && !(await read($, hidden)) && (await read($, second)) !== left) {
    await update($, second, () => left)
  }

  if ((await read($, minute)) !== nextMinute) {
    await update($, minute, () => nextMinute)
  }
}

async function choose($: EngineInterface, picked: Action) {
  await update($, action, () => picked)
  await $.store.set('action', picked)

  if (picked !== 'off') {
    await update($, prefer, () => picked)
    await $.store.set('prefer', picked)
  }
}

export const register: Register = on => {
  let running = 0

  on('session.start', async ($, e, next) => {
    $.clock.every(1000, () => void tick($))
    await $.command.register({ name: 'timer', description: 'Show or hide the cache timer' })
    const stored = (await $.store.get('hidden')) === true
    await update($, hidden, () => stored)
    const savedAction = String(await $.store.get('action'))
    const storedAction = CHOICES.find(one => one.is === savedAction)?.is ?? 'off'
    await update($, action, () => storedAction)
    const savedPrefer = String(await $.store.get('prefer'))
    const storedPrefer = CHOICES.find(one => one.is === savedPrefer)?.is ?? 'compact'
    await update($, prefer, () => (storedAction === 'off' ? storedPrefer : storedAction))
    const storedLead = Number(await $.store.get('lead'))
    await update($, lead, () => (LEADS.includes(storedLead) ? storedLead : 5))

    return next(e)
  })

  // /timer flips the bar on or off, and the choice is kept for every session.
  on('command.run', { command: 'timer' }, async $ => {
    const next = !(await read($, hidden))
    await update($, hidden, () => next)
    await $.store.set('hidden', next)

    return { text: next ? 'Cache timer hidden. /timer shows it again.' : 'Cache timer showing.' }
  })

  on('turn.start', async ($, e, next) => {
    running = 0

    if (isOwnTurn) {
      isOwnTurn = false
    } else {
      hasActed = false
    }

    await stamp($)
    await tick($)
    await update($, busy, () => true)

    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    running += 1
    await update($, now, () => describe(e as Record<string, unknown>))

    try {
      return await next(e)
    } finally {
      running -= 1

      // A helper has a cache of its own, so only main-loop requests count.
      if (e.agentId === undefined) {
        await stamp($)
      }

      if (running <= 0) {
        await update($, now, () => null)
      }
    }
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined) {
      await update($, now, () => null)
      await update($, busy, () => false)
      await tick($)
    }

    return next(e)
  })

  // The app's own step line, with the running step's real details in place
  // of its label. Thinking and writing are left as the app words them.
  on('ui.render', { component: 'Spinner' }, async ($, e, next) => {
    const doing = await read($, now)

    return doing === null ? next(e) : next({ ...e, props: { ...e.props, word: doing } })
  })

  // The cache timer, above the prompt while idle. A turn in progress resets
  // the clock on every step, so it has nothing to say then.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const beat = e.surface === 'terminal' ? await read($, minute) : await read($, second)
    const isQuiet = e.props.hasSurvey || beat === null || (await read($, hidden)) || (await read($, busy))
    const left = isQuiet ? null : await secondsLeft($)

    if (left === null) {
      return next(e)
    }

    const m = mood(left)
    const what = await read($, action)
    const minutes = await read($, lead)
    const preferred = await read($, prefer)
    const wait = async (picked: string) => {
      await update($, lead, () => Number(picked))
      await $.store.set('lead', Number(picked))
    }

    if (e.surface === 'terminal') {
      const { Box, Button, Text } = $.ui.resolve(e)
      const filled = Math.round((20 * left) / (CACHE_MINUTES * 60))

      // A blank row above keeps it off whatever the transcript printed last.
      // The desktop's controls as bare buttons, dim dots between the groups;
      // they wrap on a narrow terminal. The terminal's dropdowns take no
      // mouse clicks and open their list out of line, so here the action and
      // the time are buttons that step to the next choice on each click.
      return (
        <Box marginTop={1} flexDirection="row" flexWrap="wrap">
          <Text color={m.color}>
            {'█'.repeat(filled)}
            {'░'.repeat(20 - filled)} {m.stage === 4 ? m.word : `${Math.ceil(left / 60)} min`}
          </Text>
          <Box flexGrow={1} />
          <Button
            key="auto"
            plain
            hotkey="a"
            label={what === 'off' ? 'Auto off' : 'Auto on'}
            onPress={() => choose($, what === 'off' ? preferred : 'off')}
          />
          {what === 'off' ? null : (
            <Box marginLeft={2}>
              <Button
                key="what"
                plain
                label={CHOICES.find(one => one.is === what)?.short ?? 'Compact'}
                onPress={() => choose($, what === 'compact' ? 'status' : 'compact')}
              />
            </Box>
          )}
          {what === 'off' ? null : (
            <Box marginLeft={2}>
              <Button
                key="lead"
                plain
                label={`${minutes}m`}
                onPress={() => wait(String(LEADS[(LEADS.indexOf(minutes) + 1) % LEADS.length]))}
              />
            </Box>
          )}
          <Text dimColor>{'  ·  '}</Text>
          <Button key="compact" plain hotkey="c" label="Compact now" onPress={() => $.session.compact()} />
          <Text dimColor>{'  ·  '}</Text>
          <Button key="handoff" plain hotkey="h" label="Handoff" onPress={() => $.prompt.submit({ text: HANDOFF, asUser: true })} />
        </Box>
      )
    }

    const { Box, Button, Select, Svg } = $.ui.resolve(e)

    return (
      <Box flexDirection="row">
        <Svg source={picture(left, m, what === 'off' ? null : minutes)} alt={`Memory: ${m.word}`} width={WIDTH} height={HEIGHT} />
        <Box flexGrow={1} />
        <Box flexDirection="column">
          <Svg source={spacer(4, BUTTON_DROP)} alt="spacer" width={4} height={BUTTON_DROP} />
          <Box flexDirection="row">
            <Button
              key="auto"
              label={what === 'off' ? 'Auto off' : 'Auto on'}
              onPress={() => choose($, what === 'off' ? preferred : 'off')}
            />
            {what === 'off' ? null : <Svg source={spacer(8, 1)} alt="spacer" width={8} height={1} />}
            {what === 'off' ? null : (
              <Select
                key="what"
                options={CHOICES.map(one => ({ value: one.is, label: one.label }))}
                value={what}
                onSelect={picked => choose($, CHOICES.find(one => one.is === picked)?.is ?? 'compact')}
              />
            )}
            {what === 'off' ? null : <Svg source={spacer(8, 1)} alt="spacer" width={8} height={1} />}
            {what === 'off' ? null : (
              <Select
                key="lead"
                options={LEADS.map(one => ({ value: String(one), label: `◷ ${one}m` }))}
                value={String(minutes)}
                onSelect={wait}
              />
            )}
            <Svg source={spacer(8, 1)} alt="spacer" width={8} height={1} />
            <Button key="compact" label="Compact now" onPress={() => $.session.compact()} />
            <Svg source={spacer(8, 1)} alt="spacer" width={8} height={1} />
            <Button key="handoff" label="Handoff" onPress={() => $.prompt.submit({ text: HANDOFF, asUser: true })} />
          </Box>
        </Box>
      </Box>
    )
  })
}

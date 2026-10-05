export type Doing = string | null
export type Time = number | null
export type Action = 'off' | 'compact' | 'status'

declare module 'claude-code' {
  interface PluginState {
    'cache-timer': { now: Doing; busy: boolean; hidden: boolean; action: Action; prefer: Action; lead: number; warmUntil: Time; second: Time; minute: Time }
  }
}

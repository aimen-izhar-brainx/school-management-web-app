import type { DayId } from './types'

/** Key of one grid cell (a period on a day), used for entry lookups, in-flight guards and per-cell errors. */
export const cellKey = (periodId: string, day: DayId) => `${periodId}:${day}`

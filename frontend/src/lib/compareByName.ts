/** Name ordering used by the API: ascending, case-insensitive. */
export const compareByName = (a: { name: string }, b: { name: string }) =>
  a.name.toLowerCase().localeCompare(b.name.toLowerCase())

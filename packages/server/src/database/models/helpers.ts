export function getFirst<T>(results: T[]): T | null {
  if (!results.length) {
    return null
  }
  return results[0]
}

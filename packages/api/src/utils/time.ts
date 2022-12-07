/**
 * Check if a given datelike input is too far off current time.
 *
 * By default, it allows +/- 1 minute of difference.
 *
 * @param timestamp The time to evaluate
 * @param maxDeltaMs How much drift (+/-) to allow
 * @param now The reference time (keep function pure for testing)
 */
export function isFarFromCurrentTime(
  timestamp: string | number | Date,
  now = Date.now(),
  maxDeltaMs = 60_000
) {
  const then = new Date(timestamp).valueOf()
  return Math.abs(then - now) > maxDeltaMs
}

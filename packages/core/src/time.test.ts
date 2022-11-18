import { isFarFromCurrentTime } from './time'

describe('time', () => {
  describe('isFarFromCurrentTime', () => {
    test('defaults to +/- 1 minute, inclusive', () => {
      const ref = Date.now()
      expect(isFarFromCurrentTime(ref - 60_000, ref)).toBe(false)
      expect(isFarFromCurrentTime(ref + 60_000, ref)).toBe(false)
      expect(isFarFromCurrentTime(ref - 60_001, ref)).toBe(true)
      expect(isFarFromCurrentTime(ref + 60_001, ref)).toBe(true)
    })
  })
})

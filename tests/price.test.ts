import { describe, expect, it } from 'vitest'
import { formatPence } from '@/lib/price'

describe('formatPence', () => {
  it('shows pounds and pence', () => {
    expect(formatPence(350)).toBe('£3.50')
    expect(formatPence(1005)).toBe('£10.05')
    expect(formatPence(99)).toBe('£0.99')
  })

  it('drops the pence for whole pounds', () => {
    expect(formatPence(500)).toBe('£5')
    expect(formatPence(0)).toBe('£0')
  })

  it('rejects fractional, negative and non-finite amounts', () => {
    expect(() => formatPence(3.5)).toThrow(RangeError)
    expect(() => formatPence(-100)).toThrow(RangeError)
    expect(() => formatPence(Number.NaN)).toThrow(RangeError)
  })
})

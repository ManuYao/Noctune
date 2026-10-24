import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { parseIsoDuration } from './parseIsoDuration'

describe('parseIsoDuration', () => {
  it('reads the durations YouTube writes', () => {
    const cases: Array<[text: string, seconds: number]> = [
      ['PT4M28S', 268],
      ['PT3M58S', 238],
      ['PT19S', 19],
      ['PT59S', 59],
      ['PT1M', 60],
      ['PT1H', 3600],
      ['PT1H2M3S', 3723],
      ['PT1H30S', 3630],
      ['PT100H', 360_000],
      ['PT24H', 86_400],
      ['PT0S', 0],
      ['PT0M0S', 0],
      ['P1D', 86_400],
      ['P0D', 0],
      ['P1DT2H3M4S', 93_784],
      ['P1407DT10H11M52S', 1407 * 86_400 + 10 * 3600 + 11 * 60 + 52],
      ['PT90M', 5400],
      ['PT120S', 120],
    ]
    for (const [text, seconds] of cases) assert.equal(parseIsoDuration(text), seconds, text)
  })

  it('refuses what is not a duration', () => {
    const malformed = [
      '',
      'P',
      'PT',
      'P1DT',
      'T1S',
      '1S',
      'PT1',
      'PTS',
      'PT1H2',
      'PT-1S',
      'PT+1S',
      'PT1.5S',
      'PT1,5S',
      'pt1s',
      'PT1s',
      ' PT1S',
      'PT1S ',
      'PT1S\n',
      'PT1S2M',
      'PT1M1M',
      'PT1H1H',
      'P1W',
      'P1Y',
      'P1M',
      'P1MT1S',
      'PT1S1',
      'PT\uFF11S',
      'PT1S;PT2S',
      '4:28',
      '268',
    ]
    for (const text of malformed) assert.equal(parseIsoDuration(text), null, JSON.stringify(text))
  })

  it('refuses everything that is not a string, without throwing', () => {
    for (const value of [undefined, null, 268, true, {}, [], ['PT1S'], Symbol('x'), 10n]) {
      assert.equal(parseIsoDuration(value), null, typeof value)
    }
  })

  it('keeps absurd values as numbers for the caller to judge, and refuses what would overflow', () => {
    assert.equal(parseIsoDuration('PT999999999S'), 999_999_999)
    assert.equal(parseIsoDuration('P999999999D'), 999_999_999 * 86_400)
    assert.ok(Number.isSafeInteger(parseIsoDuration('P999999999DT999999999H999999999M999999999S')), 'still a safe integer')
    assert.equal(parseIsoDuration('PT1000000000S'), null)
    assert.equal(parseIsoDuration(`PT${'9'.repeat(400)}S`), null)
  })
})

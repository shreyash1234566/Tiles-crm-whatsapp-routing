import { describe, expect, it } from 'vitest'
import { cosineSimilarity, visionConfidenceBand } from './evolution-vision'

describe('Evolution local vision safeguards', () => {
  it('ranks normalized vectors with cosine similarity', () => {
    expect(cosineSimilarity([1, 0, 0], [1, 0, 0])).toBe(1)
    expect(cosineSimilarity([1, 0], [0, 1])).toBe(0)
    expect(cosineSimilarity([1], [1, 0])).toBe(0)
  })

  it('keeps lower-confidence image matches in human review', () => {
    expect(visionConfidenceBand(0.9)).toBe('HIGH')
    expect(visionConfidenceBand(0.8)).toBe('REVIEW')
    expect(visionConfidenceBand(0.5)).toBe('LOW')
  })
})

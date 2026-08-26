import { describe, expect, it } from 'vitest'
import { createTilesEvolutionFixture } from './evolution-fixtures'

describe('Tiles Evolution fixture factory', () => {
  it('creates only dealer/group and tile-marble inventory fixtures', () => {
    const fixture = createTilesEvolutionFixture()
    expect(fixture.group.groupJid).toMatch(/@g\.us$/)
    expect(fixture.stock.material).toContain('Marble')
    expect(JSON.stringify(fixture).toLowerCase()).not.toContain('furniture')
  })
})

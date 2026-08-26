import { getActiveVertical } from '@/lib/brand'

/**
 * Production Compose explicitly opts into this guard. It prevents a copied
 * furniture configuration from silently serving the tiles deployment, while
 * leaving local development and the separately deployed furniture CRM alone.
 */
export function assertTilesDeployment(): void {
  if (process.env.REQUIRE_TILES_VERTICAL?.trim().toLowerCase() !== 'true') return
  if (getActiveVertical() !== 'tiles') {
    throw new Error('Tiles CRM requires BUSINESS_TYPE=tiles. Refusing to start with a non-tiles vertical.')
  }
}

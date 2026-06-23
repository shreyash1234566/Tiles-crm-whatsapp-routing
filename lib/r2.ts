/**
 * File Upload — Local VPS Storage
 *
 * All images/files are stored on the VPS at the Docker volume mount:
 *   /app/uploads  (container path, persisted via Docker named volume)
 *
 * The UPLOAD_DIR env var is set in docker-compose.yml to "/app/uploads".
 * In local dev (no env var set), files go next to the project under a
 * vertical-appropriate default:
 *   ../furniture-crm-uploads        (furniture vertical)
 *   ../tiles-sanitary-crm-uploads   (tiles vertical)
 *
 * Files are served back via /api/uploads/[...path]/route.ts
 */

import { randomUUID } from 'node:crypto'
import { mkdir, unlink, writeFile } from 'node:fs/promises'

// ─── Path Resolution ──────────────────────────────────────────────────

/**
 * Resolve the active vertical from the environment.
 *
 * Mirrors the Brand_Config resolution rules (see lib/brand.ts `getActiveVertical`
 * / `resolveVertical`): read `BUSINESS_TYPE ?? NEXT_PUBLIC_BUSINESS_TYPE`, then
 * trim + lowercase and return `'tiles'` only on an exact `tiles` match; anything
 * else falls back to `'furniture'`. Inlined here so this module stays usable
 * even before lib/brand.ts is wired in.
 */
function getActiveVertical(): 'tiles' | 'furniture' {
  const raw = process.env.BUSINESS_TYPE ?? process.env.NEXT_PUBLIC_BUSINESS_TYPE
  return raw?.trim().toLowerCase() === 'tiles' ? 'tiles' : 'furniture'
}

export function getUploadsRoot(): string {
  // UPLOAD_DIR is set in docker-compose to "/app/uploads" (the Docker volume).
  // When configured, it always wins as the uploads root for the active vertical.
  if (process.env.UPLOAD_DIR) {
    return process.env.UPLOAD_DIR.replace(/[\\/]+$/, '')
  }

  // In local dev (no UPLOAD_DIR), keep uploads outside the project so Turbopack
  // does not try to bundle/analyze every possible file under <project>/uploads.
  // Use a vertical-appropriate default so tiles assets are not stored under a
  // furniture-named directory while existing furniture deployments are unchanged.
  const vertical = getActiveVertical()
  const base =
    vertical === 'tiles' ? '../tiles-sanitary-crm-uploads' : '../furniture-crm-uploads'

  return `${process.cwd()}/${base}`.replace(/[\\/]+$/, '')
}

function sanitizePathSegment(input: string): string {
  return input.replace(/[^a-zA-Z0-9._-]/g, '_')
}

function sanitizeFolder(folder: string): string {
  const segments = folder
    .split(/[\\/]+/)
    .map((segment) => sanitizePathSegment(segment.trim()))
    .filter((segment) => segment && segment !== '.' && segment !== '..')

  if (segments.length === 0) return 'uploads'
  return segments.join('/')
}

export function getUploadFilePath(relativePath: string): string {
  const safeRelativePath = relativePath
    .split(/[\\/]+/)
    .map((segment) => sanitizePathSegment(segment.trim()))
    .filter((segment) => segment && segment !== '.' && segment !== '..')
    .join('/')

  if (!safeRelativePath) {
    throw new Error('Invalid upload path')
  }

  return `${getUploadsRoot()}/${safeRelativePath}`
}

function extensionFromFileName(fileName: string): string {
  const lastPart = fileName.split(/[\\/]/).pop() || ''
  const dotIndex = lastPart.lastIndexOf('.')
  if (dotIndex < 0 || dotIndex === lastPart.length - 1) return 'bin'
  return lastPart.slice(dotIndex + 1).toLowerCase()
}

// ─── Upload ───────────────────────────────────────────────────────────

export async function uploadFile(
  file: Buffer,
  fileName: string,
  _contentType: string,   // kept for API compatibility — not used for local storage
  folder: string
): Promise<string> {
  const rawExt = extensionFromFileName(fileName)
  const ext = sanitizePathSegment(rawExt || 'bin')
  const uniqueName = `${randomUUID()}.${ext}`
  const safeFolder = sanitizeFolder(folder)
  const dir = `${getUploadsRoot()}/${safeFolder}`
  const filePath = `${dir}/${uniqueName}`

  console.log(`[Upload] Saving to: ${filePath}`)

  try {
    await mkdir(dir, { recursive: true })
    await writeFile(filePath, file)
    console.log(`[Upload] SUCCESS: /api/uploads/${safeFolder}/${uniqueName}`)
  } catch (err) {
    console.error(`[Upload] FAILED writing ${filePath}:`, err)
    throw err
  }

  return `/api/uploads/${safeFolder}/${uniqueName}`
}

// ─── Delete ───────────────────────────────────────────────────────────

export async function deleteFile(key: string): Promise<void> {
  // key is like "/api/uploads/products/uuid.jpg"
  const relativePath = key.replace(/^\/api\/uploads\//, '')
  const filePath = getUploadFilePath(relativePath)
  try {
    await unlink(filePath)
    console.log(`[Upload] Deleted: ${filePath}`)
  } catch {
    // File may not exist — ignore silently
  }
}

// ─── Presigned URL stub (not needed for local storage) ────────────────

export async function getPresignedUploadUrl(
  folder: string,
  fileName: string,
  _contentType: string
): Promise<{ url: string; key: string }> {
  const rawExt = extensionFromFileName(fileName)
  const ext = sanitizePathSegment(rawExt || 'bin')
  const key = `/api/uploads/${sanitizeFolder(folder)}/${randomUUID()}.${ext}`
  return { url: '/api/upload', key }
}

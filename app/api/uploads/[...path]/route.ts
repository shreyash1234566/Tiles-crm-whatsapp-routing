import { NextRequest, NextResponse } from 'next/server'
import { readFile, stat } from 'node:fs/promises'
import { getUploadFilePath } from '@/lib/r2'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MIME_TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  svg: 'image/svg+xml',
  mp3: 'audio/mpeg',
  ogg: 'audio/ogg',
  opus: 'audio/ogg; codecs=opus',
  wav: 'audio/wav',
  m4a: 'audio/mp4',
  webm: 'video/webm',
  mp4: 'video/mp4',
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  csv: 'text/csv',
  txt: 'text/plain',
  zip: 'application/zip',
}

// In standalone Next.js builds, process.cwd() ≠ /app — use UPLOAD_DIR env var
// Serves files from the uploads directory
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path: segments } = await params
  const relativePath = segments.join('/')

  // Security: block path traversal
  if (relativePath.includes('..') || relativePath.startsWith('/')) {
    return NextResponse.json({ error: 'Invalid path' }, { status: 400 })
  }

  const filePath = getUploadFilePath(relativePath)

  try {
    const fileStat = await stat(filePath)
    if (!fileStat.isFile()) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const buffer = await readFile(filePath)
    const ext = (filePath.split('.').pop() || '').toLowerCase()
    const contentType = MIME_TYPES[ext] || 'application/octet-stream'

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Length': String(buffer.length),
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    })
  } catch {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
}

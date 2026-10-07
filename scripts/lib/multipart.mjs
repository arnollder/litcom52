#!/usr/bin/env node

/**
 * Minimal multipart/form-data reader for a single file field (admin PDF upload).
 */

export async function readRawBody(req, { maxBytes = 15 * 1024 * 1024 } = {}) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > maxBytes) {
      const error = new Error(`Тело запроса больше ${maxBytes} байт`)
      error.status = 413
      throw error
    }
    chunks.push(chunk)
  }
  return Buffer.concat(chunks)
}

/**
 * @param {Buffer} buffer
 * @param {string} contentType
 * @returns {{ fields: Record<string, string>, file: { fieldName: string, filename: string, mimeType: string, data: Buffer } | null }}
 */
export function parseMultipart(buffer, contentType) {
  const match = String(contentType || '').match(/boundary=(?:"([^"]+)"|([^;]+))/i)
  const boundary = match?.[1] || match?.[2]
  if (!boundary) {
    const error = new Error('Некорректный multipart: нет boundary')
    error.status = 400
    throw error
  }

  const delim = Buffer.from(`--${boundary}`)
  const fields = {}
  let file = null

  let start = buffer.indexOf(delim)
  if (start < 0) {
    const error = new Error('Некорректный multipart: boundary не найден')
    error.status = 400
    throw error
  }

  while (start >= 0) {
    const afterBoundary = start + delim.length
    if (buffer[afterBoundary] === 0x2d && buffer[afterBoundary + 1] === 0x2d) break

    let contentStart = afterBoundary
    if (buffer[contentStart] === 0x0d && buffer[contentStart + 1] === 0x0a) {
      contentStart += 2
    }

    const next = buffer.indexOf(delim, contentStart)
    if (next < 0) break

    let partEnd = next
    if (buffer[partEnd - 2] === 0x0d && buffer[partEnd - 1] === 0x0a) {
      partEnd -= 2
    }

    const headerEnd = buffer.indexOf('\r\n\r\n', contentStart)
    if (headerEnd < 0 || headerEnd > partEnd) {
      start = next
      continue
    }

    const headers = buffer.slice(contentStart, headerEnd).toString('utf8')
    const body = buffer.slice(headerEnd + 4, partEnd)
    const nameMatch = headers.match(/name="([^"]+)"/i)
    const filenameMatch = headers.match(/filename="([^"]*)"/i)
    const typeMatch = headers.match(/Content-Type:\s*([^\r\n]+)/i)
    const fieldName = nameMatch?.[1] || ''

    if (filenameMatch) {
      file = {
        fieldName,
        filename: filenameMatch[1] || 'upload.pdf',
        mimeType: (typeMatch?.[1] || 'application/pdf').trim(),
        data: body,
      }
    } else if (fieldName) {
      fields[fieldName] = body.toString('utf8')
    }

    start = next
  }

  return { fields, file }
}

#!/usr/bin/env node

import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const ROOT_DIR = resolve(new URL('.', import.meta.url).pathname, '../..')
const ENV_PATH = resolve(ROOT_DIR, '.env')

export function parseEnvLine(line) {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith('#')) return null
  const idx = trimmed.indexOf('=')
  if (idx <= 0) return null
  const key = trimmed.slice(0, idx).trim()
  let value = trimmed.slice(idx + 1).trim()
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1)
  }
  return [key, value]
}

export async function loadEnvFromFile() {
  try {
    const raw = await readFile(ENV_PATH, 'utf8')
    for (const line of raw.split('\n')) {
      const entry = parseEnvLine(line)
      if (!entry) continue
      const [key, value] = entry
      if (!(key in process.env)) process.env[key] = value
    }
  } catch {
    // .env is optional when env vars are already injected.
  }
}

export function getAuthHeader() {
  const token = process.env.MOYSKLAD_TOKEN
  const login = process.env.MOYSKLAD_LOGIN
  const password = process.env.MOYSKLAD_PASSWORD

  if (token) return `Bearer ${token}`
  if (login && password) {
    const credentials = Buffer.from(`${login}:${password}`, 'utf8').toString('base64')
    return `Basic ${credentials}`
  }

  throw new Error('Provide MOYSKLAD_TOKEN or MOYSKLAD_LOGIN + MOYSKLAD_PASSWORD in .env')
}

export function getBaseUrl() {
  return (process.env.MOYSKLAD_BASE_URL || 'https://api.moysklad.ru/api/remap/1.2').replace(/\/+$/, '')
}

const MAX_RETRIES = 5
const BASE_RETRY_MS = 400
const REQUEST_TIMEOUT_MS = 30000

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isRateLimitError(status, data) {
  if (status === 429) return true
  const errors = Array.isArray(data?.errors) ? data.errors : []
  return errors.some((item) => Number(item?.code) === 1073)
}

// Serialize MoySklad calls process-wide to stay under concurrent request limits.
let moyskladQueue = Promise.resolve()

export async function moyskladFetch(pathname, options = {}) {
  const run = async () => {
    await loadEnvFromFile()
    const authHeader = getAuthHeader()
    const baseUrl = getBaseUrl()
    const url = pathname.startsWith('http') ? pathname : `${baseUrl}${pathname}`

    let lastError = null
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
      let response
      try {
        response = await fetch(url, {
          ...options,
          signal: controller.signal,
          headers: {
            Authorization: authHeader,
            Accept: 'application/json;charset=utf-8',
            'Content-Type': 'application/json',
            ...(options.headers || {}),
          },
        })
      } catch (err) {
        clearTimeout(timeoutId)
        const aborted = err?.name === 'AbortError'
        const error = new Error(
          aborted
            ? `MoySklad timeout after ${REQUEST_TIMEOUT_MS}ms`
            : err instanceof Error
              ? err.message
              : 'MoySklad network error',
        )
        error.status = aborted ? 504 : 502
        lastError = error
        if (attempt === MAX_RETRIES) throw error
        await sleep(BASE_RETRY_MS * 2 ** attempt)
        continue
      }
      clearTimeout(timeoutId)

      const text = await response.text()
      let data = null
      try {
        data = text ? JSON.parse(text) : null
      } catch {
        data = { raw: text }
      }

      if (response.ok) return data

      const details = typeof data === 'object' ? JSON.stringify(data) : String(text)
      const error = new Error(`MoySklad ${response.status}: ${details}`)
      error.status = response.status
      error.payload = data
      lastError = error

      if (!isRateLimitError(response.status, data) || attempt === MAX_RETRIES) {
        throw error
      }

      const retryAfterHeader = Number(response.headers.get('retry-after'))
      const waitMs = Number.isFinite(retryAfterHeader) && retryAfterHeader > 0
        ? retryAfterHeader * 1000
        : BASE_RETRY_MS * 2 ** attempt
      await sleep(waitMs)
    }

    throw lastError || new Error('MoySklad request failed')
  }

  const queued = moyskladQueue.then(run, run)
  moyskladQueue = queued.then(
    () => undefined,
    () => undefined,
  )
  return queued
}

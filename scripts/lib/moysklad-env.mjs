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

export async function moyskladFetch(pathname, options = {}) {
  await loadEnvFromFile()
  const authHeader = getAuthHeader()
  const baseUrl = getBaseUrl()
  const url = pathname.startsWith('http') ? pathname : `${baseUrl}${pathname}`

  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: authHeader,
      Accept: 'application/json;charset=utf-8',
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  })

  const text = await response.text()
  let data = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = { raw: text }
  }

  if (!response.ok) {
    const details = typeof data === 'object' ? JSON.stringify(data) : String(text)
    const error = new Error(`MoySklad ${response.status}: ${details}`)
    error.status = response.status
    error.payload = data
    throw error
  }

  return data
}

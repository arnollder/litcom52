#!/usr/bin/env node

import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const ROOT_DIR = resolve(new URL('.', import.meta.url).pathname, '..')
const ENV_PATH = resolve(ROOT_DIR, '.env')
const OUTPUT_PATH = resolve(ROOT_DIR, 'public/counterparties.json')
const PAGE_SIZE = 100

function parseEnvLine(line) {
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

async function loadEnvFromFile() {
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

function getAuthHeader() {
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

async function fetchPaged(baseUrl, authHeader, endpoint) {
  const rows = []
  let offset = 0

  while (true) {
    const url = `${baseUrl}${endpoint}?limit=${PAGE_SIZE}&offset=${offset}`
    const response = await fetch(url, {
      headers: {
        Authorization: authHeader,
        Accept: 'application/json;charset=utf-8',
      },
    })

    if (!response.ok) {
      const body = await response.text()
      throw new Error(`Request failed (${response.status}) for ${endpoint}: ${body}`)
    }

    const data = await response.json()
    const chunk = Array.isArray(data?.rows) ? data.rows : []
    rows.push(...chunk)
    if (chunk.length < PAGE_SIZE) break
    offset += PAGE_SIZE
  }

  return rows
}

function hasBuyerTag(row) {
  const tags = Array.isArray(row?.tags) ? row.tags : []
  return tags.some((tag) => String(tag || '').trim().toLowerCase() === 'покупатель')
}

function normalizeCounterparty(row) {
  const phone = row?.phone?.trim?.() || ''
  const email = row?.email?.trim?.() || ''
  const contact = email || phone

  return {
    id: String(row?.id || ''),
    name: String(row?.name || '').trim(),
    phone,
    email,
    contact,
    description: [phone, email].filter(Boolean).join(' · '),
  }
}

async function main() {
  await loadEnvFromFile()

  const authHeader = getAuthHeader()
  const baseUrl = (process.env.MOYSKLAD_BASE_URL || 'https://api.moysklad.ru/api/remap/1.2').replace(/\/+$/, '')
  const rows = await fetchPaged(baseUrl, authHeader, '/entity/counterparty')

  const normalized = rows
    .filter((row) => row && !row.archived && hasBuyerTag(row))
    .map(normalizeCounterparty)
    .filter((item) => item.id && item.name)
    .sort((a, b) => a.name.localeCompare(b.name, 'ru'))

  const deduped = Array.from(new Map(normalized.map((item) => [item.id, item])).values())
  const payload = {
    updatedAt: new Date().toISOString(),
    source: 'moysklad',
    filter: 'tag:покупатель',
    rows: deduped,
  }

  await writeFile(OUTPUT_PATH, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')

  const distPath = resolve(ROOT_DIR, 'dist/counterparties.json')
  try {
    await writeFile(distPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
    console.log(`Counterparties synced: ${deduped.length} buyers -> public/counterparties.json + dist/counterparties.json`)
  } catch {
    console.log(`Counterparties synced: ${deduped.length} buyers -> public/counterparties.json`)
  }
}

main().catch((error) => {
  console.error(error.message || error)
  process.exitCode = 1
})

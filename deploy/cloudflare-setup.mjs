#!/usr/bin/env node
/**
 * Create/update Cloudflare zone DNS for litkom-m52.ru (optional automation).
 *
 * Requires API token with Zone:Edit, DNS:Edit, Zone Settings:Edit.
 *
 *   CLOUDFLARE_API_TOKEN=... node deploy/cloudflare-setup.mjs
 *
 * Optional:
 *   CLOUDFLARE_ACCOUNT_ID=...   (auto-detected if omitted)
 *   ORIGIN_IP=62.113.110.31
 *   CLOUDFLARE_ZONE_NAME=litkom-m52.ru
 */

const ZONE_NAME = String(process.env.CLOUDFLARE_ZONE_NAME || 'litkom-m52.ru').trim()
const ORIGIN_IP = String(process.env.ORIGIN_IP || '62.113.110.31').trim()
const TOKEN = String(process.env.CLOUDFLARE_API_TOKEN || '').trim()

if (!TOKEN) {
  console.error('Set CLOUDFLARE_API_TOKEN (Zone:Edit, DNS:Edit, Zone Settings:Edit)')
  process.exit(1)
}

const API = 'https://api.cloudflare.com/client/v4'

async function cf(path, { method = 'GET', body } = {}) {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok || data.success === false) {
    const msg = data.errors?.map((e) => e.message).join('; ') || response.statusText
    throw new Error(`${method} ${path}: ${msg}`)
  }
  return data.result
}

async function getAccountId() {
  if (process.env.CLOUDFLARE_ACCOUNT_ID) return process.env.CLOUDFLARE_ACCOUNT_ID
  const accounts = await cf('/accounts')
  if (!accounts?.length) throw new Error('No Cloudflare accounts for this token')
  return accounts[0].id
}

async function getOrCreateZone(accountId) {
  const listed = await cf(`/zones?name=${encodeURIComponent(ZONE_NAME)}`)
  if (listed?.length) return listed[0]

  console.log(`Creating zone ${ZONE_NAME}…`)
  return cf('/zones', {
    method: 'POST',
    body: {
      name: ZONE_NAME,
      account: { id: accountId },
      type: 'full',
    },
  })
}

async function upsertDnsRecord(zoneId, spec) {
  const query = new URLSearchParams({ name: spec.name, type: spec.type })
  const existing = await cf(`/zones/${zoneId}/dns_records?${query}`)
  const row = existing.find((item) => item.name === spec.name && item.type === spec.type)
  const payload = {
    type: spec.type,
    name: spec.name,
    content: spec.content,
    ttl: spec.ttl ?? 1,
    proxied: spec.proxied ?? false,
    priority: spec.priority,
  }
  if (row) {
    console.log(`  update ${spec.type} ${spec.name}`)
    return cf(`/zones/${zoneId}/dns_records/${row.id}`, { method: 'PATCH', body: payload })
  }
  console.log(`  create ${spec.type} ${spec.name}`)
  return cf(`/zones/${zoneId}/dns_records`, { method: 'POST', body: payload })
}

async function setZoneSetting(zoneId, id, value) {
  console.log(`  setting ${id}=${value}`)
  await cf(`/zones/${zoneId}/settings/${id}`, { method: 'PATCH', body: { value } })
}

async function main() {
  const accountId = await getAccountId()
  const zone = await getOrCreateZone(accountId)
  const zoneId = zone.id

  console.log(`Zone: ${zone.name} (${zone.status})`)

  const records = [
    { type: 'A', name: ZONE_NAME, content: ORIGIN_IP, proxied: true },
    { type: 'A', name: `www.${ZONE_NAME}`, content: ORIGIN_IP, proxied: true },
    { type: 'A', name: `admin.${ZONE_NAME}`, content: ORIGIN_IP, proxied: true },
    { type: 'MX', name: ZONE_NAME, content: 'mx1.beget.com', priority: 10, proxied: false },
    { type: 'MX', name: ZONE_NAME, content: 'mx2.beget.com', priority: 20, proxied: false },
    { type: 'TXT', name: ZONE_NAME, content: 'v=spf1 redirect=beget.com', proxied: false },
  ]

  console.log('DNS records:')
  for (const spec of records) {
    await upsertDnsRecord(zoneId, spec)
  }

  console.log('Zone settings:')
  await setZoneSetting(zoneId, 'ssl', 'strict')
  await setZoneSetting(zoneId, 'always_use_https', 'on')
  await setZoneSetting(zoneId, 'min_tls_version', '1.2')

  const refreshed = await cf(`/zones/${zoneId}`)
  console.log('\n=== Done ===')
  console.log(`Status: ${refreshed.status}`)
  console.log('Nameservers (set these at Beget instead of Beget NS):')
  for (const ns of refreshed.name_servers || []) {
    console.log(`  ${ns}`)
  }
  console.log('\nThen on VPS: bash /opt/litcom52/deploy/setup-cloudflare-origin.sh')
  console.log('Add Cache Rule: URI Path starts with /api → Bypass cache (dashboard).')
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})

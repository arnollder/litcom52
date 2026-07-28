import { createReservedCustomerOrder } from './scripts/lib/create-customer-order.mjs'
import { fetchLiveStockMap } from './scripts/lib/fetch-stock.mjs'
import { loadEnvFromFile } from './scripts/lib/moysklad-env.mjs'

function sendJson(res, status, payload) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify(payload))
}

async function readJsonBody(req) {
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  if (!chunks.length) return {}
  const raw = Buffer.concat(chunks).toString('utf8')
  return raw ? JSON.parse(raw) : {}
}

function pathOnly(url = '') {
  return url.split('?')[0]
}

async function handleReserveOrder(req, res) {
  if (req.method === 'OPTIONS') {
    res.statusCode = 204
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
    res.end()
    return
  }

  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed' })
    return
  }

  try {
    await loadEnvFromFile()
    const body = await readJsonBody(req)
    const result = await createReservedCustomerOrder({
      counterpartyId: body.counterpartyId,
      items: body.items,
      comment: body.comment,
    })
    sendJson(res, 200, { ok: true, order: result })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Reserve failed'
    const status = error?.status && Number.isInteger(error.status) ? error.status : 500
    sendJson(res, status >= 400 && status < 600 ? status : 500, { ok: false, error: message })
  }
}

async function handleStock(req, res) {
  if (req.method === 'OPTIONS') {
    res.statusCode = 204
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
    res.end()
    return
  }

  if (req.method !== 'GET') {
    sendJson(res, 405, { error: 'Method not allowed' })
    return
  }

  try {
    await loadEnvFromFile()
    const result = await fetchLiveStockMap()
    sendJson(res, 200, { ok: true, ...result })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Stock fetch failed'
    const status = error?.status && Number.isInteger(error.status) ? error.status : 500
    sendJson(res, status >= 400 && status < 600 ? status : 500, { ok: false, error: message })
  }
}

function attachApi(middlewares) {
  middlewares.use(async (req, res, next) => {
    const pathname = pathOnly(req.url || '')
    if (pathname === '/api/orders/reserve') {
      await handleReserveOrder(req, res)
      return
    }
    if (pathname === '/api/stock') {
      await handleStock(req, res)
      return
    }
    next()
  })
}

export default function moyskladApiPlugin() {
  return {
    name: 'moysklad-api',
    configureServer(server) {
      attachApi(server.middlewares)
    },
    configurePreviewServer(server) {
      attachApi(server.middlewares)
    },
  }
}

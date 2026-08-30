function getApiBase() {
  const configured = import.meta.env.VITE_ORDER_API_URL
  if (configured) return configured.replace(/\/+$/, '')
  return ''
}

async function parseJson(response) {
  try {
    return await response.json()
  } catch {
    return null
  }
}

export async function fetchPushPublicKey() {
  const response = await fetch(`${getApiBase()}/api/push/vapid-public-key`, {
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  })
  const data = await parseJson(response)
  if (!response.ok || !data?.ok) {
    throw new Error(data?.error || `Не удалось получить ключ push (${response.status})`)
  }
  return data.publicKey || ''
}

export async function subscribePush({ counterpartyId, counterpartyName, subscription }) {
  const response = await fetch(`${getApiBase()}/api/push/subscribe`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ counterpartyId, counterpartyName, subscription }),
  })
  const data = await parseJson(response)
  if (!response.ok || !data?.ok) {
    throw new Error(data?.error || `Не удалось сохранить подписку (${response.status})`)
  }
  return data
}

export async function unsubscribePush({ endpoint }) {
  const response = await fetch(`${getApiBase()}/api/push/subscribe`, {
    method: 'DELETE',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ endpoint }),
  })
  const data = await parseJson(response)
  if (!response.ok || !data?.ok) {
    throw new Error(data?.error || `Не удалось удалить подписку (${response.status})`)
  }
  return data
}

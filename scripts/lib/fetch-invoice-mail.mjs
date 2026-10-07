#!/usr/bin/env node

import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { ImapFlow } from 'imapflow'
import { simpleParser } from 'mailparser'
import { loadEnvFromFile, parseEnvLine } from './moysklad-env.mjs'
import {
  listMailCounterparties,
  matchMailCounterparty,
} from './mail-counterparties-store.mjs'
import {
  listKnownMailInboxIds,
  listProcessedMailUids,
  makeInboxId,
  mergeMailInboxItems,
} from './mail-inbox-store.mjs'
import { parseInvoicePdf } from './parse-invoice-pdf.mjs'
import { matchPurchaseLines } from './create-purchase-order.mjs'

const ROOT_DIR = resolve(new URL('.', import.meta.url).pathname, '../..')
const ENV_PATH = resolve(ROOT_DIR, '.env')

/** Re-read MAIL_* from .env so filter/password updates apply without process restart. */
async function loadMailEnv() {
  await loadEnvFromFile()
  try {
    const raw = await readFile(ENV_PATH, 'utf8')
    for (const line of raw.split('\n')) {
      const entry = parseEnvLine(line)
      if (!entry) continue
      const [key, value] = entry
      if (key.startsWith('MAIL_')) process.env[key] = value
    }
  } catch {
    // .env optional when vars already injected
  }
}

async function mailConfig() {
  await loadMailEnv()
  const user = String(process.env.MAIL_IMAP_USER || '').trim()
  const password = String(process.env.MAIL_IMAP_PASSWORD || '').trim()
  const host = String(process.env.MAIL_IMAP_HOST || 'imap.yandex.ru').trim()
  const port = Number(process.env.MAIL_IMAP_PORT || 993)
  const counterparties = await listMailCounterparties()
  const fromFilters = counterparties.map((item) => item.email).filter(Boolean)
  const mailbox = String(process.env.MAIL_IMAP_MAILBOX || 'INBOX').trim() || 'INBOX'
  const lookbackDays = Math.min(
    Math.max(Number(process.env.MAIL_LOOKBACK_DAYS || 14) || 14, 1),
    90,
  )

  if (!user || !password) {
    const error = new Error(
      'Почта не настроена. Задайте MAIL_IMAP_USER и MAIL_IMAP_PASSWORD в .env',
    )
    error.status = 503
    throw error
  }
  if (!fromFilters.length) {
    const error = new Error(
      'Нет контрагентов для проверки почты. Добавь email в разделе «Контрагенты»',
    )
    error.status = 503
    throw error
  }

  return { user, password, host, port, counterparties, fromFilters, mailbox, lookbackDays }
}

function isPdfAttachment(att) {
  const filename = String(att?.filename || '').toLowerCase()
  const contentType = String(att?.contentType || '').toLowerCase()
  if (filename.endsWith('.pdf')) return true
  if (contentType.includes('application/pdf')) return true
  return false
}

function filtersLabel(filters) {
  if (filters.length === 1) return filters[0]
  return `${filters.length} контрагентов`
}

function fromTextFromEnvelope(envelope) {
  const from = envelope?.from
  if (!Array.isArray(from) || !from.length) return ''
  return from
    .map((v) => `${v.name || ''} ${v.address || ''}`.trim())
    .filter(Boolean)
    .join(' ')
}

/**
 * Incremental IMAP sync: skip UIDs already processed and known uid:filename ids.
 * Merges new parses into mail-inbox store and returns active (non-consumed) list.
 *
 * @returns {Promise<{
 *   messages: object[],
 *   added: number,
 *   scanned: number,
 *   matched: number,
 *   skippedKnown: number,
 *   fromFilters: string[],
 *   lookbackDays: number,
 * }>}
 */
export async function fetchInvoicePdfsFromMail() {
  const cfg = await mailConfig()
  const knownIds = await listKnownMailInboxIds()
  const processedUids = await listProcessedMailUids()

  const client = new ImapFlow({
    host: cfg.host,
    port: cfg.port,
    secure: true,
    auth: {
      user: cfg.user,
      pass: cfg.password,
    },
    logger: false,
  })

  const since = new Date()
  since.setDate(since.getDate() - cfg.lookbackDays)

  const parsedList = []
  const newlyProcessedUids = []
  let scanned = 0
  let matched = 0
  let skippedKnown = 0

  try {
    await client.connect()
    const lock = await client.getMailboxLock(cfg.mailbox)
    try {
      const uids = await client.search({ since }, { uid: true })
      const list = Array.isArray(uids) ? uids : []
      list.sort((a, b) => b - a)

      for (const uid of list.slice(0, 40)) {
        scanned += 1

        if (processedUids.has(Number(uid))) {
          skippedKnown += 1
          continue
        }

        const downloaded = await client.download(uid, undefined, { uid: true })
        if (!downloaded?.content) {
          newlyProcessedUids.push(uid)
          continue
        }

        const mail = await simpleParser(downloaded.content)
        const fromText = [
          mail.from?.text,
          ...(Array.isArray(mail.from?.value)
            ? mail.from.value.map((v) => `${v.name || ''} ${v.address || ''}`)
            : []),
          fromTextFromEnvelope(mail),
        ]
          .filter(Boolean)
          .join(' ')

        const counterparty = matchMailCounterparty(fromText, cfg.counterparties)
        if (!counterparty) {
          newlyProcessedUids.push(uid)
          continue
        }
        matched += 1

        const attachments = Array.isArray(mail.attachments) ? mail.attachments : []
        const pdfs = attachments.filter(isPdfAttachment)
        if (!pdfs.length) {
          newlyProcessedUids.push(uid)
          continue
        }

        for (const att of pdfs) {
          const buffer = Buffer.isBuffer(att.content)
            ? att.content
            : Buffer.from(att.content || [])
          if (!buffer.length) continue

          const filename = att.filename || `mail-${uid}.pdf`
          const id = makeInboxId(uid, filename)
          if (knownIds.has(id)) {
            skippedKnown += 1
            continue
          }

          try {
            const parsed = await parseInvoicePdf(buffer, { filename })
            let lines = parsed.lines
            try {
              lines = await matchPurchaseLines(parsed.lines)
            } catch (err) {
              console.error('[mail] match skipped', err)
            }
            const supplierName =
              String(counterparty.name || '').trim() || parsed.supplierName
            const row = {
              id,
              ...parsed,
              supplierName,
              lines,
              mail: {
                uid,
                messageId: mail.messageId || null,
                from: mail.from?.text || fromText,
                subject: mail.subject || '',
                date: mail.date ? new Date(mail.date).toISOString() : null,
                counterpartyId: counterparty.id,
                counterpartyName: counterparty.name || '',
                counterpartyEmail: counterparty.email,
              },
            }
            parsedList.push(row)
            knownIds.add(id)
          } catch (err) {
            console.error('[mail] pdf parse failed', filename, err)
          }
        }

        // UID считаем обработанным, только если все PDF уже в сторе (успех/дедуп).
        // Парс упал → не помечаем, следующий sync попробует снова.
        const allAccounted = pdfs.every((att) =>
          knownIds.has(makeInboxId(uid, att.filename || `mail-${uid}.pdf`)),
        )
        if (allAccounted) newlyProcessedUids.push(uid)
      }
    } finally {
      lock.release()
    }
  } finally {
    try {
      await client.logout()
    } catch {
      // ignore
    }
  }

  const merged = await mergeMailInboxItems(parsedList, newlyProcessedUids)

  // 404 только когда реально пусто: нет активных в сторе, ничего нового и нечего было скипнуть.
  if (!merged.items.length && !parsedList.length && skippedKnown === 0) {
    const label = filtersLabel(cfg.fromFilters)
    const error = new Error(
      matched
        ? `Письма от «${label}» есть, но PDF не найден или не разобран`
        : `За ${cfg.lookbackDays} дн. нет писем от «${label}»`,
    )
    error.status = 404
    throw error
  }

  return {
    messages: merged.items,
    added: merged.added,
    scanned,
    matched,
    skippedKnown,
    fromFilters: cfg.fromFilters,
    lookbackDays: cfg.lookbackDays,
  }
}

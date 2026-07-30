#!/usr/bin/env node

/**
 * Cron-friendly MoySklad sync:
 * 1) catalog.json + counterparties.json
 * 2) counterparties also written to dist/ (runtime fetch)
 * 3) optional frontend rebuild so catalog (bundled) goes live
 *
 * Env:
 *   CRON_SYNC_REBUILD=1|0   default 1 — run `npm run build` after sync
 *   CRON_SYNC_LOCK_PATH     default <root>/data/sync.lock
 */

import { mkdir, open, readFile, unlink } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const LOCK_PATH =
  process.env.CRON_SYNC_LOCK_PATH || resolve(ROOT_DIR, 'data/sync.lock')
const REBUILD = !['0', 'false', 'no'].includes(
  String(process.env.CRON_SYNC_REBUILD ?? '1').toLowerCase(),
)

function stamp() {
  return new Date().toISOString()
}

function log(message) {
  console.log(`[${stamp()}] ${message}`)
}

function run(command, args, { cwd = ROOT_DIR, env = process.env } = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd,
      env,
      stdio: 'inherit',
    })
    child.on('error', reject)
    child.on('exit', (code, signal) => {
      if (code === 0) resolvePromise()
      else {
        reject(
          new Error(
            `${command} ${args.join(' ')} failed (code=${code}, signal=${signal || 'none'})`,
          ),
        )
      }
    })
  })
}

async function acquireLock() {
  await mkdir(dirname(LOCK_PATH), { recursive: true })
  let handle
  try {
    handle = await open(LOCK_PATH, 'wx')
  } catch (error) {
    if (error && error.code === 'EEXIST') {
      let existing = ''
      try {
        existing = (await readFile(LOCK_PATH, 'utf8')).trim()
      } catch {
        /* ignore */
      }
      throw new Error(`Sync already running (lock: ${LOCK_PATH}${existing ? `, ${existing}` : ''})`)
    }
    throw error
  }
  await handle.writeFile(`${stamp()} pid=${process.pid}\n`, 'utf8')
  await handle.close()
}

async function releaseLock() {
  try {
    await unlink(LOCK_PATH)
  } catch {
    /* ignore */
  }
}

async function main() {
  log('MoySklad cron sync started')
  await acquireLock()

  try {
    await run('node', ['./scripts/sync-moysklad-catalog.mjs'])
    await run('node', ['./scripts/sync-moysklad-counterparties.mjs'])

    if (REBUILD) {
      log('Rebuilding frontend so catalog.json lands in dist/')
      await run('npm', ['run', 'build'])
      log('Rebuild finished')
    } else {
      log('Skip rebuild (CRON_SYNC_REBUILD=0); catalog changes need a later build')
    }

    log('MoySklad cron sync finished OK')
  } finally {
    await releaseLock()
  }
}

main().catch(async (error) => {
  console.error(`[${stamp()}] ${error instanceof Error ? error.message : error}`)
  await releaseLock()
  process.exitCode = 1
})

#!/usr/bin/env node

/**
 * Cron-friendly MoySklad sync:
 * 1) src/data/catalog.json + public/catalog.json + data/counterparties.json
 * 2) copy catalog into dist/ when present (no full Vite rebuild by default)
 * 3) optional full rebuild via CRON_SYNC_REBUILD=1
 *
 * Env:
 *   CRON_SYNC_REBUILD=1|0   default 0 — catalog is served as static JSON
 *   CRON_SYNC_LOCK_PATH     default <root>/data/sync.lock
 */

import { copyFile, mkdir, open, readFile, unlink } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const LOCK_PATH =
  process.env.CRON_SYNC_LOCK_PATH || resolve(ROOT_DIR, 'data/sync.lock')
const REBUILD = ['1', 'true', 'yes'].includes(
  String(process.env.CRON_SYNC_REBUILD ?? '0').toLowerCase(),
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

async function publishCatalogToDist() {
  const from = resolve(ROOT_DIR, 'public/catalog.json')
  const to = resolve(ROOT_DIR, 'dist/catalog.json')
  try {
    await copyFile(from, to)
    log('Published public/catalog.json → dist/catalog.json')
  } catch (error) {
    log(`Skip dist catalog publish: ${error instanceof Error ? error.message : error}`)
  }
}

async function main() {
  log('MoySklad cron sync started')
  await acquireLock()

  try {
    await run('node', ['./scripts/sync-moysklad-catalog.mjs'])
    await run('node', ['./scripts/sync-moysklad-counterparties.mjs'])
    await publishCatalogToDist()

    if (REBUILD) {
      log('Rebuilding frontend (CRON_SYNC_REBUILD=1)')
      await run('npm', ['run', 'build'])
      log('Rebuild finished')
    } else {
      log('Skip full rebuild (catalog is static JSON under public/ + dist/)')
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

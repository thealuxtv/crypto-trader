// core/db.js
// Persistência simples em JSON com lowdb — sem compilação nativa, funciona em Windows.
// Guarda trades e estado da wallet num ficheiro local: data/db.json

import { JSONFilePreset } from 'lowdb/node'
import { join, dirname }  from 'path'
import { fileURLToPath }  from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DB_PATH   = join(__dirname, '..', 'data', 'db.json')

const defaultData = {
  trades:      [],
  totalPnL:    0,
  totalTrades: 0,
}

let db = null

export async function getDb() {
  if (db) return db
  db = await JSONFilePreset(DB_PATH, defaultData)
  return db
}

export async function saveTrade(trade) {
  const db = await getDb()
  db.data.trades.push(trade)
  if (trade.pnl != null) {
    db.data.totalPnL    += trade.pnl
    db.data.totalTrades += 1
  }
  await db.write()
}

export async function getTrades(limit = 50) {
  const db = await getDb()
  return db.data.trades.slice(-limit).reverse()
}

export async function clearTrades() {
  const db = await getDb()
  db.data = { ...defaultData }
  await db.write()
}

import express from 'express'
import cors from 'cors'
import { createServer } from 'http'
import { WebSocketServer } from 'ws'
import 'dotenv/config'

import routes from './api/routes/index.js'
import { startTradingLoop, addSubscriber, removeSubscriber } from './core/tradingLoop.js'
import { connectDB } from './core/db.js'
import { loadState } from './core/paperTrading.js'

const app    = express()
const server = createServer(app)
const wss    = new WebSocketServer({ server })
const PORT   = process.env.PORT || 3001

app.use(cors({
  origin: '*',
  credentials: false,
}))
app.use(express.json())
app.use('/api', routes)
app.get('/', (req, res) => res.json({ name: 'Crypto AI Trader API', version: '1.0.0' }))

wss.on('connection', (ws) => {
  console.log(`[WS] Cliente ligado (${wss.clients.size} total)`)
  addSubscriber(ws)
  ws.on('close', () => { removeSubscriber(ws) })
  ws.on('error', (err) => { removeSubscriber(ws) })
  ws.send(JSON.stringify({ type: 'connected', message: 'Ligado ao Crypto AI Trader' }))
})

async function start() {
  await connectDB()
  await loadState()
  server.listen(PORT, () => {
    console.log(`\n╔═══════════════════════════════════════╗`)
    console.log(`║   Crypto AI Trader — Backend           ║`)
    console.log(`║   REST: http://localhost:${PORT}/api      ║`)
    console.log(`║   WS:   ws://localhost:${PORT}            ║`)
    console.log(`╚═══════════════════════════════════════╝\n`)
    startTradingLoop()
  })
}

start()
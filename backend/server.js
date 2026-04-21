// server.js
// Ponto de entrada: Express REST API + WebSocket para updates em tempo real

import express    from 'express'
import cors       from 'cors'
import { createServer } from 'http'
import { WebSocketServer } from 'ws'
import 'dotenv/config'

import routes                        from './api/routes/index.js'
import { startTradingLoop, addSubscriber, removeSubscriber } from './core/tradingLoop.js'

const app    = express()
const server = createServer(app)
const wss    = new WebSocketServer({ server })
const PORT   = process.env.PORT || 3001

// ── Middleware ────────────────────────────────────────────────────────────
app.use(cors())
app.use(express.json())

// ── REST API ──────────────────────────────────────────────────────────────
app.use('/api', routes)

app.get('/', (req, res) => {
  res.json({ name: 'Crypto AI Trader API', version: '1.0.0', status: 'online' })
})

// ── WebSocket ─────────────────────────────────────────────────────────────
// O frontend liga-se aqui e recebe updates a cada ciclo em tempo real.
wss.on('connection', (ws, req) => {
  console.log(`[WS] Cliente ligado (${wss.clients.size} total)`)
  addSubscriber(ws)

  ws.on('close', () => {
    removeSubscriber(ws)
    console.log(`[WS] Cliente desligado (${wss.clients.size} total)`)
  })

  ws.on('error', (err) => {
    console.error('[WS] Erro:', err.message)
    removeSubscriber(ws)
  })

  // Envia estado atual imediatamente ao ligar
  ws.send(JSON.stringify({ type: 'connected', message: 'Ligado ao Crypto AI Trader' }))
})

// ── Arranque ──────────────────────────────────────────────────────────────
server.listen(PORT, () => {
  console.log(`\n╔═══════════════════════════════════════╗`)
  console.log(`║   Crypto AI Trader — Backend           ║`)
  console.log(`║   REST: http://localhost:${PORT}/api      ║`)
  console.log(`║   WS:   ws://localhost:${PORT}            ║`)
  console.log(`╚═══════════════════════════════════════╝\n`)

  startTradingLoop()
})

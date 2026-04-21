// core/tradingLoop.js
// Orquestra o ciclo principal: obtém dados → calcula indicadores → decide → executa

import cron from 'node-cron'
import { fetchCandles, fetchTicker } from './marketData.js'
import { computeIndicators }         from './indicators.js'
import { analyzeSignals }            from '../strategies/aiStrategy.js'
import { executeOrder, checkStopAndTarget, getUnrealizedPnL } from './paperTrading.js'
import 'dotenv/config'

const SYMBOL    = process.env.SYMBOL    || 'BTC/USDT'
const TIMEFRAME = process.env.TIMEFRAME || '1h'
const INTERVAL  = parseInt(process.env.CHECK_INTERVAL || '60')   // segundos

// Guarda o último ciclo para expor via API
let lastCycle = null
const subscribers = new Set()   // WebSocket clients a notificar

export function getLastCycle() { return lastCycle }

export function addSubscriber(ws)    { subscribers.add(ws) }
export function removeSubscriber(ws) { subscribers.delete(ws) }

function broadcast(data) {
  const msg = JSON.stringify(data)
  for (const ws of subscribers) {
    if (ws.readyState === 1) ws.send(msg)   // 1 = OPEN
  }
}

// ── Ciclo principal ───────────────────────────────────────────────────────
async function runCycle() {
  try {
    console.log(`\n[Loop] ── Novo ciclo ${new Date().toISOString()} ──`)

    // 1. Dados de mercado
    const candles    = await fetchCandles(SYMBOL, TIMEFRAME, 200)
    const ticker     = await fetchTicker(SYMBOL)
    const price      = ticker.last

    // 2. Indicadores técnicos
    const indicators = computeIndicators(candles)

    // 3. Verificar stop-loss / take-profit antes de analisar
    const stopTrade  = checkStopAndTarget(price)

    // 4. Decisão da IA
    const decision   = analyzeSignals(indicators)
    console.log(`[Loop] Sinal: ${decision.action} (score: ${decision.score}, confiança: ${(decision.confidence * 100).toFixed(0)}%)`)
    decision.reasons.forEach(r => console.log(`       → ${r}`))

    // 5. Executar ordem se necessário (e se não houve stop/target neste ciclo)
    let trade = stopTrade
    if (!stopTrade && decision.action !== 'HOLD') {
      trade = executeOrder(decision.action, SYMBOL, price, decision.reasons[0])
    }

    // 6. PnL não realizado
    const unrealizedPnL = getUnrealizedPnL(price)

    // 7. Guardar estado do ciclo e notificar frontend
    lastCycle = {
      timestamp:    new Date(),
      symbol:       SYMBOL,
      price,
      ticker,
      indicators,
      decision,
      trade:        trade || null,
      unrealizedPnL,
    }
    broadcast({ type: 'cycle', data: lastCycle })

  } catch (err) {
    console.error('[Loop] Erro no ciclo:', err.message)
    broadcast({ type: 'error', message: err.message })
  }
}

// ── Arranque ──────────────────────────────────────────────────────────────
export function startTradingLoop() {
  console.log(`[Loop] A iniciar — par: ${SYMBOL} | timeframe: ${TIMEFRAME} | intervalo: ${INTERVAL}s`)

  // Corre imediatamente ao arrancar
  runCycle()

  // Agenda os próximos ciclos com node-cron
  // Para intervalos <60s usa setInterval; acima usa cron
  if (INTERVAL < 60) {
    setInterval(runCycle, INTERVAL * 1000)
  } else {
    const minutes = Math.floor(INTERVAL / 60)
    cron.schedule(`*/${minutes} * * * *`, runCycle)
  }
}

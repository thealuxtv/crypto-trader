import cron from 'node-cron'
import { fetchCandles, fetchTicker } from './marketData.js'
import { computeIndicators }         from './indicators.js'
import { analyzeSignals }            from '../strategies/aiStrategy.js'
import { executeOrder, checkStopAndTarget, getUnrealizedPnL } from './paperTrading.js'
import 'dotenv/config'

const SYMBOL    = process.env.SYMBOL    || 'BTC/USDT'
const TIMEFRAME = process.env.TIMEFRAME || '1h'
const INTERVAL  = parseInt(process.env.CHECK_INTERVAL || '60')

let lastCycle = null
const subscribers = new Set()

export function getLastCycle()       { return lastCycle }
export function addSubscriber(ws)    { subscribers.add(ws) }
export function removeSubscriber(ws) { subscribers.delete(ws) }

function broadcast(data) {
  const msg = JSON.stringify(data)
  for (const ws of subscribers) {
    if (ws.readyState === 1) ws.send(msg)
  }
}

async function runCycle() {
  try {
    const candles    = await fetchCandles(SYMBOL, TIMEFRAME, 200)
    const ticker     = await fetchTicker(SYMBOL)
    const price      = ticker.last
    const indicators = computeIndicators(candles)
    const stopTrade  = await checkStopAndTarget(price)
    const decision   = analyzeSignals(indicators)

    console.log(`[Loop] Sinal: ${decision.action} (score: ${decision.score})`)
    decision.reasons.forEach(r => console.log(`       → ${r}`))

    let trade = stopTrade
    if (!stopTrade && decision.action !== 'HOLD') {
      trade = await executeOrder(decision.action, SYMBOL, price, decision.reasons[0])
    }

    const unrealizedPnL = getUnrealizedPnL(price)
    lastCycle = { timestamp: new Date(), symbol: SYMBOL, price, ticker, indicators, decision, trade: trade || null, unrealizedPnL }
    broadcast({ type: 'cycle', data: lastCycle })
  } catch (err) {
    console.error('[Loop] Erro:', err.message)
    broadcast({ type: 'error', message: err.message })
  }
}

export function startTradingLoop() {
  console.log(`[Loop] A iniciar — ${SYMBOL} | ${TIMEFRAME} | ${INTERVAL}s`)
  runCycle()
  if (INTERVAL < 60) setInterval(runCycle, INTERVAL * 1000)
  else cron.schedule(`*/${Math.floor(INTERVAL / 60)} * * * *`, runCycle)
}
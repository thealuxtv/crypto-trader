// api/routes/index.js
// Todos os endpoints REST que o frontend consome

import { Router } from 'express'
import { getState, resetState } from '../../core/paperTrading.js'
import { getLastCycle }         from '../../core/tradingLoop.js'
import { fetchCandles }         from '../../core/marketData.js'
import { computeIndicators }    from '../../core/indicators.js'
import backtestRouter           from './backtest.js'
import 'dotenv/config'

const router = Router()

router.use('/backtest', backtestRouter)
const SYMBOL = process.env.SYMBOL || 'BTC/USDT'

// GET /api/status — estado geral da wallet e último ciclo
router.get('/status', (req, res) => {
  const wallet    = getState()
  const lastCycle = getLastCycle()

  res.json({
    ok: true,
    wallet: {
      balanceUSDT:  wallet.balanceUSDT,
      position:     wallet.position,
      totalPnL:     wallet.totalPnL,
      totalTrades:  wallet.trades.length,
    },
    lastCycle: lastCycle
      ? {
          timestamp:    lastCycle.timestamp,
          price:        lastCycle.price,
          action:       lastCycle.decision.action,
          confidence:   lastCycle.decision.confidence,
          score:        lastCycle.decision.score,
          reasons:      lastCycle.decision.reasons,
          unrealizedPnL: lastCycle.unrealizedPnL,
        }
      : null,
  })
})

// GET /api/trades — histórico de trades
router.get('/trades', (req, res) => {
  const { trades } = getState()
  const limit = parseInt(req.query.limit || '50')
  res.json({ trades: trades.slice(-limit).reverse() })
})

// GET /api/indicators — indicadores técnicos atuais
router.get('/indicators', async (req, res) => {
  try {
    const symbol    = req.query.symbol || SYMBOL
    const timeframe = req.query.timeframe || '1h'
    const candles   = await fetchCandles(symbol, timeframe, 200)
    const indicators = computeIndicators(candles)
    res.json({ symbol, timeframe, indicators })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET /api/candles — velas para o gráfico
router.get('/candles', async (req, res) => {
  try {
    const symbol    = req.query.symbol    || SYMBOL
    const timeframe = req.query.timeframe || '1h'
    const limit     = parseInt(req.query.limit || '100')
    const candles   = await fetchCandles(symbol, timeframe, limit)
    res.json({ symbol, timeframe, candles })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /api/reset — reinicia a wallet simulada
router.post('/reset', (req, res) => {
  resetState()
  res.json({ ok: true, message: 'Wallet reiniciada' })
})

export default router

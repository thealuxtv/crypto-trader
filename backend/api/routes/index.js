import { Router } from 'express'
import { getState, resetState, executeOrder } from '../../core/paperTrading.js'
import { getLastCycle }                        from '../../core/tradingLoop.js'
import { fetchCandles }                        from '../../core/marketData.js'
import { computeIndicators }                   from '../../core/indicators.js'
import backtestRouter                          from './backtest.js'
import { Trade }                               from '../../core/models.js'
import 'dotenv/config'

const router = Router()
const SYMBOL = process.env.SYMBOL || 'BTC/USDT'

router.use('/backtest', backtestRouter)

// GET /api/status
router.get('/status', (req, res) => {
  const wallet    = getState()
  const lastCycle = getLastCycle()
  res.json({
    ok: true,
    wallet: {
      balanceUSDT: wallet.balanceUSDT,
      position:    wallet.position,
      totalPnL:    wallet.totalPnL,
    },
    lastCycle: lastCycle ? {
      timestamp:     lastCycle.timestamp,
      price:         lastCycle.price,
      action:        lastCycle.decision.action,
      confidence:    lastCycle.decision.confidence,
      score:         lastCycle.decision.score,
      reasons:       lastCycle.decision.reasons,
      unrealizedPnL: lastCycle.unrealizedPnL,
    } : null,
  })
})

// GET /api/trades
router.get('/trades', async (req, res) => {
  const limit  = parseInt(req.query.limit || '50')
  const trades = await Trade.find().sort({ timestamp: -1 }).limit(limit)
  res.json({ trades })
})

// GET /api/indicators
router.get('/indicators', async (req, res) => {
  try {
    const candles    = await fetchCandles(req.query.symbol || SYMBOL, req.query.timeframe || '1h', 200)
    const indicators = computeIndicators(candles)
    res.json({ indicators })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// GET /api/candles
router.get('/candles', async (req, res) => {
  try {
    const candles = await fetchCandles(
      req.query.symbol    || SYMBOL,
      req.query.timeframe || '1h',
      parseInt(req.query.limit || '100')
    )
    res.json({ candles })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// POST /api/reset
router.post('/reset', async (req, res) => {
  await resetState()
  res.json({ ok: true, message: 'Wallet reiniciada' })
})

// POST /api/close-position
router.post('/close-position', async (req, res) => {
  const wallet = getState()
  if (!wallet.position) {
    return res.json({ ok: false, message: 'Sem posição aberta' })
  }
  const lastCycle = getLastCycle()
  const price     = lastCycle?.price || 0
  const trade     = await executeOrder('SELL', wallet.position.symbol, price, 'Fechado manualmente')
  res.json({ ok: true, trade })
})

export default router
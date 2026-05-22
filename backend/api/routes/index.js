import { Router } from 'express'
import { getState, resetState, executeOrder } from '../../core/paperTrading.js'
import { getLastCycle }                        from '../../core/tradingLoop.js'
import { fetchCandles }                        from '../../core/marketData.js'
import { computeIndicators }                   from '../../core/indicators.js'
import backtestRouter                          from './backtest.js'
import authRouter                              from './auth.js'
import { Trade }                               from '../../core/models.js'
import { requireAuth }                         from '../../core/auth.middleware.js'
import 'dotenv/config'

const router = Router()
const SYMBOL = process.env.SYMBOL || 'BTC/USDT'

router.use('/backtest', backtestRouter)
router.use('/auth',     authRouter)

// GET /api/status
router.get('/status', requireAuth, (req, res) => {
  const userId    = req.user._id.toString()
  const wallet    = getState(userId)
  const lastCycle = getLastCycle()
  res.json({
    ok: true,
    user: { id: req.user._id, name: req.user.name, email: req.user.email },
    wallet: { balanceUSDT: wallet.balanceUSDT, position: wallet.position, totalPnL: wallet.totalPnL },
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
router.get('/trades', requireAuth, async (req, res) => {
  const limit  = parseInt(req.query.limit || '50')
  const trades = await Trade.find({ userId: req.user._id }).sort({ timestamp: -1 }).limit(limit)
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
router.post('/reset', requireAuth, async (req, res) => {
  await resetState(req.user._id.toString())
  res.json({ ok: true, message: 'Wallet reiniciada' })
})

// POST /api/close-position
router.post('/close-position', requireAuth, async (req, res) => {
  const userId = req.user._id.toString()
  const wallet = getState(userId)
  if (!wallet.position)
    return res.json({ ok: false, message: 'Sem posição aberta' })
  const lastCycle = getLastCycle()
  const price     = lastCycle?.price || 0
  const trade     = await executeOrder('SELL', wallet.position.symbol, price, 'Fechado manualmente', userId)
  res.json({ ok: true, trade })
})

// POST /api/chat
router.post('/chat', async (req, res) => {
  try {
    const ML_URL    = process.env.ML_SERVICE_URL || 'http://localhost:8000'
    const lastCycle = getLastCycle()
    const context   = {
      price:      lastCycle?.price,
      action:     lastCycle?.decision?.action,
      confidence: lastCycle?.decision?.confidence,
    }
    const response = await fetch(`${ML_URL}/chat`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ message: req.body.message, context }),
    })
    const data = await response.json()
    res.json(data)
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

export default router
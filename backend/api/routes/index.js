import { Router } from 'express'
import { getState, resetState } from '../../core/paperTrading.js'
import { getLastCycle }         from '../../core/tradingLoop.js'
import { fetchCandles }         from '../../core/marketData.js'
import { computeIndicators }    from '../../core/indicators.js'
import backtestRouter           from './backtest.js'
import { Trade }                from '../../core/models.js'
import 'dotenv/config'

const router = Router()
const SYMBOL = process.env.SYMBOL || 'BTC/USDT'

router.use('/backtest', backtestRouter)

router.get('/status', (req, res) => {
  const wallet    = getState()
  const lastCycle = getLastCycle()
  res.json({
    ok: true,
    wallet: { balanceUSDT: wallet.balanceUSDT, position: wallet.position, totalPnL: wallet.totalPnL },
    lastCycle: lastCycle ? {
      timestamp: lastCycle.timestamp, price: lastCycle.price,
      action: lastCycle.decision.action, confidence: lastCycle.decision.confidence,
      score: lastCycle.decision.score, reasons: lastCycle.decision.reasons,
      unrealizedPnL: lastCycle.unrealizedPnL,
    } : null,
  })
})

router.get('/trades', async (req, res) => {
  const limit  = parseInt(req.query.limit || '50')
  const trades = await Trade.find().sort({ timestamp: -1 }).limit(limit)
  res.json({ trades })
})

router.get('/indicators', async (req, res) => {
  try {
    const candles    = await fetchCandles(req.query.symbol || SYMBOL, req.query.timeframe || '1h', 200)
    const indicators = computeIndicators(candles)
    res.json({ indicators })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

router.get('/candles', async (req, res) => {
  try {
    const candles = await fetchCandles(req.query.symbol || SYMBOL, req.query.timeframe || '1h', parseInt(req.query.limit || '100'))
    res.json({ candles })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

router.post('/reset', async (req, res) => {
  await resetState()
  res.json({ ok: true, message: 'Wallet reiniciada' })
})

export default router
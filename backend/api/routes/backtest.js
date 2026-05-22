import { Router }       from 'express'
import { fetchCandles } from '../../core/marketData.js'
import { runBacktest }  from '../../core/backtester.js'

const router = Router()

router.post('/', async (req, res) => {
  try {
    const { symbol = 'BTC/USDT', timeframe = '1h', limit = 500,
            startingBalance = 10000, stopLossPct = 0.03,
            takeProfitPct = 0.06, maxPositionPct = 0.10, feesPct = 0.001 } = req.body

    const candles = await fetchCandles(symbol, timeframe, limit)
    const result  = runBacktest(candles, { startingBalance, stopLossPct, takeProfitPct, maxPositionPct, feesPct })
    res.json({ ok: true, symbol, timeframe, candlesUsed: candles.length, ...result })
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

// POST /api/backtest/ml
router.post('/ml', async (req, res) => {
  try {
    const ML_URL = process.env.ML_SERVICE_URL || 'http://localhost:8000'
    const response = await fetch(`${ML_URL}/backtest`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(req.body),
    })
    const data = await response.json()
    res.json(data)
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

export default router
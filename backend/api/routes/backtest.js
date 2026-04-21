// api/routes/backtest.js
// Endpoint para correr backtest e devolver resultados ao frontend

import { Router }      from 'express'
import { fetchCandles } from '../../core/marketData.js'
import { runBacktest }  from '../../core/backtester.js'

const router = Router()

/**
 * POST /api/backtest
 * Body: { symbol, timeframe, limit, startingBalance, stopLossPct, takeProfitPct, maxPositionPct }
 */
router.post('/', async (req, res) => {
  try {
    const {
      symbol          = 'BTC/USDT',
      timeframe       = '1h',
      limit           = 500,
      startingBalance = 10000,
      stopLossPct     = 0.03,
      takeProfitPct   = 0.06,
      maxPositionPct  = 0.10,
      feesPct         = 0.001,
    } = req.body

    console.log(`[Backtest] A correr: ${symbol} ${timeframe} ${limit} velas`)
    const start = Date.now()

    // Obtém velas históricas
    const candles = await fetchCandles(symbol, timeframe, limit)

    // Corre o backtest
    const result = runBacktest(candles, {
      startingBalance,
      stopLossPct,
      takeProfitPct,
      maxPositionPct,
      feesPct,
    })

    const duration = ((Date.now() - start) / 1000).toFixed(2)
    console.log(`[Backtest] Concluído em ${duration}s — ${result.trades.length} trades, retorno: ${result.metrics.totalReturn}%`)

    res.json({
      ok: true,
      symbol,
      timeframe,
      candlesUsed: candles.length,
      duration,
      ...result,
    })
  } catch (err) {
    console.error('[Backtest] Erro:', err.message)
    res.status(500).json({ ok: false, error: err.message })
  }
})

export default router

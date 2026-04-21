// backend/core/backtester.js
// Testa a estratégia em dados históricos e devolve métricas de performance detalhadas.
// Usa os mesmos indicadores e estratégia do live trading — mesma lógica, dados do passado.

import { computeIndicators } from './indicators.js'
import { analyzeSignals }    from '../strategies/aiStrategy.js'

/**
 * Corre o backtest sobre um array de candles históricas.
 *
 * @param {Array}  candles         — array completo de { timestamp, open, high, low, close, volume }
 * @param {Object} config
 * @param {number} config.startingBalance  — saldo inicial em USDT (default 10000)
 * @param {number} config.maxPositionPct   — % máx do saldo por trade (default 0.10)
 * @param {number} config.stopLossPct      — stop-loss (default 0.03)
 * @param {number} config.takeProfitPct    — take-profit (default 0.06)
 * @param {number} config.feesPct          — comissão por trade (default 0.001 = 0.1%)
 * @param {number} config.warmup           — nº de velas iniciais para aquecer indicadores (default 200)
 *
 * @returns {Object} resultado com trades, equity curve, e métricas
 */
export function runBacktest(candles, config = {}) {
  const {
    startingBalance = 10000,
    maxPositionPct  = 0.10,
    stopLossPct     = 0.03,
    takeProfitPct   = 0.06,
    feesPct         = 0.001,
    warmup          = 200,
  } = config

  let balance  = startingBalance
  let position = null     // { quantity, entryPrice, stopLoss, takeProfit }
  const trades      = []
  const equityCurve = []  // { timestamp, equity } — para o gráfico

  // Precisa de pelo menos `warmup` velas para os indicadores fazerem sentido
  for (let i = warmup; i < candles.length; i++) {
    const window      = candles.slice(0, i + 1)   // janela crescente de dados
    const currentCandle = candles[i]
    const price       = currentCandle.close
    const timestamp   = currentCandle.timestamp

    // ── Verificar stop-loss e take-profit primeiro ──────────────────────
    if (position) {
      // Usa os extremos da vela (high/low) para detetar SL/TP intra-vela
      if (currentCandle.low <= position.stopLoss) {
        const exitPrice = position.stopLoss
        const pnl = closeTrade(position, exitPrice, feesPct, 'stop-loss')
        balance  += (position.quantity * exitPrice) * (1 - feesPct)
        trades.push({ ...pnl, timestamp, exitPrice })
        position = null
      } else if (currentCandle.high >= position.takeProfit) {
        const exitPrice = position.takeProfit
        const pnl = closeTrade(position, exitPrice, feesPct, 'take-profit')
        balance  += (position.quantity * exitPrice) * (1 - feesPct)
        trades.push({ ...pnl, timestamp, exitPrice })
        position = null
      }
    }

    // ── Calcular indicadores e obter sinal da IA ────────────────────────
    const indicators = computeIndicators(window)
    const decision   = analyzeSignals(indicators)

    // ── Executar decisão ────────────────────────────────────────────────
    if (decision.action === 'BUY' && !position) {
      const spend    = balance * maxPositionPct
      const fee      = spend * feesPct
      const quantity = (spend - fee) / price

      position = {
        quantity,
        entryPrice:  price,
        entryTime:   timestamp,
        stopLoss:    price * (1 - stopLossPct),
        takeProfit:  price * (1 + takeProfitPct),
        entryBalance: balance,
        reasons:     decision.reasons,
      }
      balance -= spend
    }

    if (decision.action === 'SELL' && position) {
      const pnl = closeTrade(position, price, feesPct, 'sinal-venda')
      balance  += (position.quantity * price) * (1 - feesPct)
      trades.push({ ...pnl, timestamp, exitPrice: price })
      position = null
    }

    // ── Equity curve (inclui valor da posição aberta a preço atual) ─────
    const openValue = position ? position.quantity * price : 0
    equityCurve.push({
      timestamp,
      equity:    parseFloat((balance + openValue).toFixed(2)),
      price,
    })
  }

  // Fecha posição aberta no fim do backtest
  if (position) {
    const lastPrice = candles.at(-1).close
    const pnl = closeTrade(position, lastPrice, feesPct, 'fim-backtest')
    balance  += (position.quantity * lastPrice) * (1 - feesPct)
    trades.push({ ...pnl, timestamp: candles.at(-1).timestamp, exitPrice: lastPrice })
  }

  return {
    config:       { startingBalance, maxPositionPct, stopLossPct, takeProfitPct, feesPct },
    trades,
    equityCurve,
    metrics:      computeMetrics(trades, startingBalance, balance, equityCurve),
  }
}

// ── Auxiliares ────────────────────────────────────────────────────────────

function closeTrade(position, exitPrice, feesPct, reason) {
  const gross  = position.quantity * exitPrice
  const fee    = gross * feesPct
  const net    = gross - fee
  const cost   = position.quantity * position.entryPrice
  const pnl    = net - cost
  const pnlPct = ((exitPrice - position.entryPrice) / position.entryPrice) * 100

  return {
    entryPrice:  position.entryPrice,
    entryTime:   position.entryTime,
    quantity:    position.quantity,
    pnl:         parseFloat(pnl.toFixed(2)),
    pnlPct:      parseFloat(pnlPct.toFixed(3)),
    fee:         parseFloat(fee.toFixed(2)),
    reason,
    reasons:     position.reasons,
    win:         pnl > 0,
  }
}

function computeMetrics(trades, startingBalance, finalBalance, equityCurve) {
  if (trades.length === 0) return { totalTrades: 0 }

  const wins   = trades.filter(t => t.win)
  const losses = trades.filter(t => !t.win)

  const totalPnL      = trades.reduce((s, t) => s + t.pnl, 0)
  const winRate       = (wins.length / trades.length) * 100
  const avgWin        = wins.length   ? wins.reduce((s, t) => s + t.pnlPct, 0)   / wins.length   : 0
  const avgLoss       = losses.length ? losses.reduce((s, t) => s + t.pnlPct, 0) / losses.length : 0
  const profitFactor  = losses.length
    ? Math.abs(wins.reduce((s, t) => s + t.pnl, 0) / losses.reduce((s, t) => s + t.pnl, 0))
    : Infinity
  const totalReturn   = ((finalBalance - startingBalance) / startingBalance) * 100

  // Max drawdown
  let peak = startingBalance
  let maxDrawdown = 0
  for (const point of equityCurve) {
    if (point.equity > peak) peak = point.equity
    const dd = ((peak - point.equity) / peak) * 100
    if (dd > maxDrawdown) maxDrawdown = dd
  }

  // Sharpe ratio simplificado (retorno diário vs desvio padrão)
  const returns = equityCurve.slice(1).map((p, i) =>
    (p.equity - equityCurve[i].equity) / equityCurve[i].equity
  )
  const avgReturn = returns.reduce((s, r) => s + r, 0) / returns.length
  const stdReturn = Math.sqrt(returns.reduce((s, r) => s + Math.pow(r - avgReturn, 2), 0) / returns.length)
  const sharpe    = stdReturn > 0 ? (avgReturn / stdReturn) * Math.sqrt(252) : 0

  return {
    totalTrades:   trades.length,
    wins:          wins.length,
    losses:        losses.length,
    winRate:       parseFloat(winRate.toFixed(1)),
    avgWinPct:     parseFloat(avgWin.toFixed(2)),
    avgLossPct:    parseFloat(avgLoss.toFixed(2)),
    profitFactor:  parseFloat(profitFactor.toFixed(2)),
    totalPnL:      parseFloat(totalPnL.toFixed(2)),
    totalReturn:   parseFloat(totalReturn.toFixed(2)),
    finalBalance:  parseFloat(finalBalance.toFixed(2)),
    maxDrawdown:   parseFloat(maxDrawdown.toFixed(2)),
    sharpeRatio:   parseFloat(sharpe.toFixed(2)),
  }
}

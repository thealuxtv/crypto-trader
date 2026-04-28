import { computeIndicators } from './indicators.js'
import { analyzeSignals }    from '../strategies/aiStrategy.js'

export function runBacktest(candles, config = {}) {
  const {
    startingBalance = 10000,
    maxPositionPct  = 0.10,
    stopLossPct     = 0.03,
    takeProfitPct   = 0.06,
    feesPct         = 0.001,
    warmup          = 50,
  } = config

  let balance  = startingBalance
  let position = null
  const trades      = []
  const equityCurve = []

  for (let i = warmup; i < candles.length; i++) {
    const window = candles.slice(0, i + 1)
    const candle = candles[i]
    const price  = candle.close

    if (position) {
      if (candle.low <= position.stopLoss) {
        const pnl = closeTrade(position, position.stopLoss, feesPct, 'stop-loss')
        balance  += (position.quantity * position.stopLoss) * (1 - feesPct)
        trades.push({ ...pnl, timestamp: candle.timestamp, exitPrice: position.stopLoss })
        position = null
      } else if (candle.high >= position.takeProfit) {
        const pnl = closeTrade(position, position.takeProfit, feesPct, 'take-profit')
        balance  += (position.quantity * position.takeProfit) * (1 - feesPct)
        trades.push({ ...pnl, timestamp: candle.timestamp, exitPrice: position.takeProfit })
        position = null
      }
    }

    const indicators = computeIndicators(window)
    const decision   = analyzeSignals(indicators)

    if (decision.action === 'BUY' && !position) {
      const spend    = balance * maxPositionPct
      const quantity = (spend - spend * feesPct) / price
      position = {
        quantity,
        entryPrice:  price,
        entryTime:   candle.timestamp,
        stopLoss:    price * (1 - stopLossPct),
        takeProfit:  price * (1 + takeProfitPct),
      }
      balance -= spend
    }

    if (decision.action === 'SELL' && position) {
      const pnl = closeTrade(position, price, feesPct, 'sinal-venda')
      balance  += (position.quantity * price) * (1 - feesPct)
      trades.push({ ...pnl, timestamp: candle.timestamp, exitPrice: price })
      position = null
    }

    const openValue = position ? position.quantity * price : 0
    equityCurve.push({
      timestamp: candle.timestamp,
      equity:    parseFloat((balance + openValue).toFixed(2)),
      price,
    })
  }

  if (position) {
    const lastPrice = candles.at(-1).close
    const pnl = closeTrade(position, lastPrice, feesPct, 'fim-backtest')
    balance  += (position.quantity * lastPrice) * (1 - feesPct)
    trades.push({ ...pnl, timestamp: candles.at(-1).timestamp, exitPrice: lastPrice })
  }

  return {
    config,
    trades,
    equityCurve,
    metrics: computeMetrics(trades, startingBalance, balance, equityCurve),
  }
}

function closeTrade(position, exitPrice, feesPct, reason) {
  const gross  = position.quantity * exitPrice
  const net    = gross - gross * feesPct
  const pnl    = net - position.quantity * position.entryPrice
  const pnlPct = ((exitPrice - position.entryPrice) / position.entryPrice) * 100
  return {
    entryPrice: position.entryPrice,
    entryTime:  position.entryTime,
    quantity:   position.quantity,
    pnl:        parseFloat(pnl.toFixed(2)),
    pnlPct:     parseFloat(pnlPct.toFixed(3)),
    reason,
    win:        pnl > 0,
  }
}

function computeMetrics(trades, startingBalance, finalBalance, equityCurve) {
  if (!trades.length) return { totalTrades: 0 }

  const wins   = trades.filter(t => t.win)
  const losses = trades.filter(t => !t.win)

  const totalPnL     = trades.reduce((s, t) => s + t.pnl, 0)
  const winRate      = (wins.length / trades.length) * 100
  const avgWin       = wins.length   ? wins.reduce((s, t)   => s + t.pnlPct, 0) / wins.length   : 0
  const avgLoss      = losses.length ? losses.reduce((s, t) => s + t.pnlPct, 0) / losses.length : 0
  const profitFactor = losses.length
    ? Math.abs(wins.reduce((s, t) => s + t.pnl, 0) / losses.reduce((s, t) => s + t.pnl, 0))
    : Infinity
  const totalReturn = ((finalBalance - startingBalance) / startingBalance) * 100

  let peak = startingBalance, maxDrawdown = 0
  for (const p of equityCurve) {
    if (p.equity > peak) peak = p.equity
    const dd = ((peak - p.equity) / peak) * 100
    if (dd > maxDrawdown) maxDrawdown = dd
  }

  const returns   = equityCurve.slice(1).map((p, i) => (p.equity - equityCurve[i].equity) / equityCurve[i].equity)
  const avgReturn = returns.reduce((s, r) => s + r, 0) / returns.length
  const stdReturn = Math.sqrt(returns.reduce((s, r) => s + Math.pow(r - avgReturn, 2), 0) / returns.length)
  const sharpe    = stdReturn > 0 ? (avgReturn / stdReturn) * Math.sqrt(252) : 0

  return {
    totalTrades:  trades.length,
    wins:         wins.length,
    losses:       losses.length,
    winRate:      parseFloat(winRate.toFixed(1)),
    avgWinPct:    parseFloat(avgWin.toFixed(2)),
    avgLossPct:   parseFloat(avgLoss.toFixed(2)),
    profitFactor: parseFloat(profitFactor.toFixed(2)),
    totalPnL:     parseFloat(totalPnL.toFixed(2)),
    totalReturn:  parseFloat(totalReturn.toFixed(2)),
    finalBalance: parseFloat(finalBalance.toFixed(2)),
    maxDrawdown:  parseFloat(maxDrawdown.toFixed(2)),
    sharpeRatio:  parseFloat(sharpe.toFixed(2)),
  }
}
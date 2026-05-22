// core/paperTrading.js
import 'dotenv/config'
import { Trade, Wallet } from './models.js'

const STARTING_BALANCE = parseFloat(process.env.STARTING_BALANCE || '10000')
const STOP_LOSS_PCT    = parseFloat(process.env.STOP_LOSS_PCT    || '0.03')
const TAKE_PROFIT_PCT  = parseFloat(process.env.TAKE_PROFIT_PCT  || '0.06')
const MAX_POSITION_PCT = parseFloat(process.env.MAX_POSITION_PCT || '0.10')

// Estado em memória por utilizador
const states = {}

function defaultState() {
  return { balanceUSDT: STARTING_BALANCE, position: null, totalPnL: 0 }
}

export async function loadState(userId = 'default') {
  try {
    let wallet = await Wallet.findOne({ userId })
    if (!wallet) {
      wallet = await Wallet.create({ userId, balanceUSDT: STARTING_BALANCE })
      console.log(`[PaperTrading] Wallet criada para ${userId}`)
    }
    states[userId] = {
      balanceUSDT: wallet.balanceUSDT,
      totalPnL:    wallet.totalPnL,
      position:    wallet.position?.symbol ? wallet.position : null,
    }
    console.log(`[PaperTrading] Estado carregado para ${userId} — saldo: $${states[userId].balanceUSDT.toFixed(2)}`)
  } catch (err) {
    console.error('[PaperTrading] Erro ao carregar estado:', err.message)
    states[userId] = defaultState()
  }
}

async function saveState(userId) {
  const s = states[userId]
  if (!s) return
  await Wallet.findOneAndUpdate(
    { userId },
    { balanceUSDT: s.balanceUSDT, totalPnL: s.totalPnL, position: s.position, updatedAt: new Date() },
    { upsert: true, new: true }
  )
}

export function getState(userId = 'default') {
  return { ...(states[userId] || defaultState()) }
}

export async function resetState(userId = 'default') {
  states[userId] = defaultState()
  await Wallet.findOneAndUpdate(
    { userId },
    { balanceUSDT: STARTING_BALANCE, totalPnL: 0, position: null },
    { upsert: true }
  )
  await Trade.deleteMany({ userId })
  console.log(`[PaperTrading] Estado reiniciado para ${userId}`)
}

export async function executeOrder(action, symbol, currentPrice, reason = '', userId = 'default') {
  if (!states[userId]) states[userId] = defaultState()
  const s = states[userId]

  if (action === 'BUY') {
    if (s.position) return null
    const amountToSpend = s.balanceUSDT * MAX_POSITION_PCT
    const quantity      = amountToSpend / currentPrice
    const stopLoss      = currentPrice * (1 - STOP_LOSS_PCT)
    const takeProfit    = currentPrice * (1 + TAKE_PROFIT_PCT)
    s.position     = { symbol, quantity, entryPrice: currentPrice, stopLoss, takeProfit }
    s.balanceUSDT -= amountToSpend
    const trade = await Trade.create({ userId, type: 'BUY', symbol, price: currentPrice, quantity, value: amountToSpend, stopLoss, takeProfit, reason })
    await saveState(userId)
    console.log(`[PaperTrading] BUY ${quantity.toFixed(6)} ${symbol} @ $${currentPrice.toFixed(2)} [${userId}]`)
    return trade
  }

  if (action === 'SELL') {
    if (!s.position) return null
    const { quantity, entryPrice } = s.position
    const saleValue = quantity * currentPrice
    const pnl       = saleValue - (quantity * entryPrice)
    const pnlPct    = ((currentPrice - entryPrice) / entryPrice) * 100
    s.balanceUSDT += saleValue
    s.totalPnL    += pnl
    s.position     = null
    const trade = await Trade.create({ userId, type: 'SELL', symbol, price: currentPrice, quantity, value: saleValue, pnl: parseFloat(pnl.toFixed(2)), pnlPct: parseFloat(pnlPct.toFixed(2)), reason, win: pnl > 0 })
    await saveState(userId)
    console.log(`[PaperTrading] SELL @ $${currentPrice.toFixed(2)} | PnL: $${pnl.toFixed(2)} [${userId}]`)
    return trade
  }

  return null
}

export async function checkStopAndTarget(currentPrice, userId = 'default') {
  const s = states[userId]
  if (!s?.position) return null
  const { stopLoss, takeProfit, symbol } = s.position
  if (currentPrice <= stopLoss)   return executeOrder('SELL', symbol, currentPrice, 'Stop-loss atingido', userId)
  if (currentPrice >= takeProfit) return executeOrder('SELL', symbol, currentPrice, 'Take-profit atingido', userId)
  return null
}

export function getUnrealizedPnL(currentPrice, userId = 'default') {
  const s = states[userId]
  if (!s?.position) return 0
  return (currentPrice - s.position.entryPrice) * s.position.quantity
}
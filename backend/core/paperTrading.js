import 'dotenv/config'
import { Trade, Wallet } from './models.js'

const STARTING_BALANCE = parseFloat(process.env.STARTING_BALANCE || '10000')
const STOP_LOSS_PCT    = parseFloat(process.env.STOP_LOSS_PCT    || '0.03')
const TAKE_PROFIT_PCT  = parseFloat(process.env.TAKE_PROFIT_PCT  || '0.06')
const MAX_POSITION_PCT = parseFloat(process.env.MAX_POSITION_PCT || '0.10')

let state = { balanceUSDT: STARTING_BALANCE, position: null, totalPnL: 0 }

export async function loadState() {
  try {
    let wallet = await Wallet.findOne()
    if (!wallet) {
      wallet = await Wallet.create({ balanceUSDT: STARTING_BALANCE })
      console.log('[PaperTrading] Wallet criada no MongoDB')
    }
    state.balanceUSDT = wallet.balanceUSDT
    state.totalPnL    = wallet.totalPnL
    state.position    = wallet.position?.symbol ? wallet.position : null
    console.log(`[PaperTrading] Estado carregado — saldo: $${state.balanceUSDT.toFixed(2)}`)
  } catch (err) {
    console.error('[PaperTrading] Erro ao carregar estado:', err.message)
  }
}

async function saveState() {
  await Wallet.findOneAndUpdate(
    {},
    { balanceUSDT: state.balanceUSDT, totalPnL: state.totalPnL, position: state.position, updatedAt: new Date() },
    { upsert: true, new: true }
  )
}

export function getState() { return { ...state } }

export async function resetState() {
  state = { balanceUSDT: STARTING_BALANCE, position: null, totalPnL: 0 }
  await Wallet.findOneAndUpdate({}, { balanceUSDT: STARTING_BALANCE, totalPnL: 0, position: null }, { upsert: true })
  await Trade.deleteMany({})
}

export async function executeOrder(action, symbol, currentPrice, reason = '') {
  if (action === 'BUY') {
    if (state.position) return null
    const amountToSpend = state.balanceUSDT * MAX_POSITION_PCT
    const quantity      = amountToSpend / currentPrice
    const stopLoss      = currentPrice * (1 - STOP_LOSS_PCT)
    const takeProfit    = currentPrice * (1 + TAKE_PROFIT_PCT)
    state.position     = { symbol, quantity, entryPrice: currentPrice, stopLoss, takeProfit }
    state.balanceUSDT -= amountToSpend
    const trade = await Trade.create({ type: 'BUY', symbol, price: currentPrice, quantity, value: amountToSpend, stopLoss, takeProfit, reason })
    await saveState()
    return trade
  }
  if (action === 'SELL') {
    if (!state.position) return null
    const { quantity, entryPrice } = state.position
    const saleValue = quantity * currentPrice
    const pnl       = saleValue - (quantity * entryPrice)
    const pnlPct    = ((currentPrice - entryPrice) / entryPrice) * 100
    state.balanceUSDT += saleValue
    state.totalPnL    += pnl
    state.position     = null
    const trade = await Trade.create({ type: 'SELL', symbol, price: currentPrice, quantity, value: saleValue, pnl: parseFloat(pnl.toFixed(2)), pnlPct: parseFloat(pnlPct.toFixed(2)), reason, win: pnl > 0 })
    await saveState()
    return trade
  }
  return null
}

export async function checkStopAndTarget(currentPrice) {
  if (!state.position) return null
  const { stopLoss, takeProfit, symbol } = state.position
  if (currentPrice <= stopLoss)   return executeOrder('SELL', symbol, currentPrice, 'Stop-loss atingido')
  if (currentPrice >= takeProfit) return executeOrder('SELL', symbol, currentPrice, 'Take-profit atingido')
  return null
}

export function getUnrealizedPnL(currentPrice) {
  if (!state.position) return 0
  return (currentPrice - state.position.entryPrice) * state.position.quantity
}
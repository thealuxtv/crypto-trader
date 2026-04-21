// core/paperTrading.js
// Simulador de ordens — usa preços reais mas não envia nada à exchange.
// Guarda estado em memória (podes persistir em SQLite facilmente).

import 'dotenv/config'

const STARTING_BALANCE = parseFloat(process.env.STARTING_BALANCE || '10000')
const STOP_LOSS_PCT    = parseFloat(process.env.STOP_LOSS_PCT    || '0.03')
const TAKE_PROFIT_PCT  = parseFloat(process.env.TAKE_PROFIT_PCT  || '0.06')
const MAX_POSITION_PCT = parseFloat(process.env.MAX_POSITION_PCT || '0.10')

// ── Estado da wallet ──────────────────────────────────────────────────────
let state = {
  balanceUSDT:  STARTING_BALANCE,
  position:     null,          // { symbol, quantity, entryPrice, stopLoss, takeProfit }
  trades:       [],            // histórico completo
  totalPnL:     0,
}

export function getState() {
  return {
    ...state,
    trades: [...state.trades],
  }
}

export function resetState() {
  state = {
    balanceUSDT:  STARTING_BALANCE,
    position:     null,
    trades:       [],
    totalPnL:     0,
  }
  console.log('[PaperTrading] Estado reiniciado')
}

/**
 * Executa uma ordem simulada.
 * @param {'BUY'|'SELL'} action
 * @param {string} symbol
 * @param {number} currentPrice
 * @param {string} reason — motivo dado pela IA
 */
export function executeOrder(action, symbol, currentPrice, reason = '') {
  // ── BUY ──────────────────────────────────────────────────────────────
  if (action === 'BUY') {
    if (state.position) {
      console.log('[PaperTrading] Já existe posição aberta — ignorar BUY')
      return null
    }

    const amountToSpend = state.balanceUSDT * MAX_POSITION_PCT
    const quantity      = amountToSpend / currentPrice
    const stopLoss      = currentPrice * (1 - STOP_LOSS_PCT)
    const takeProfit    = currentPrice * (1 + TAKE_PROFIT_PCT)

    state.position = { symbol, quantity, entryPrice: currentPrice, stopLoss, takeProfit }
    state.balanceUSDT -= amountToSpend

    const trade = {
      id:         state.trades.length + 1,
      type:       'BUY',
      symbol,
      price:      currentPrice,
      quantity,
      value:      amountToSpend,
      stopLoss,
      takeProfit,
      reason,
      timestamp:  new Date(),
      pnl:        null,    // preenchido ao fechar
    }
    state.trades.push(trade)

    console.log(`[PaperTrading] BUY ${quantity.toFixed(6)} ${symbol} @ $${currentPrice.toFixed(2)} | SL: $${stopLoss.toFixed(2)} | TP: $${takeProfit.toFixed(2)}`)
    return trade
  }

  // ── SELL (manual ou via stop/target) ─────────────────────────────────
  if (action === 'SELL') {
    if (!state.position) {
      console.log('[PaperTrading] Sem posição aberta — ignorar SELL')
      return null
    }

    const { quantity, entryPrice } = state.position
    const saleValue = quantity * currentPrice
    const pnl       = saleValue - (quantity * entryPrice)
    const pnlPct    = ((currentPrice - entryPrice) / entryPrice) * 100

    state.balanceUSDT += saleValue
    state.totalPnL    += pnl
    state.position     = null

    const trade = {
      id:        state.trades.length + 1,
      type:      'SELL',
      symbol,
      price:     currentPrice,
      quantity,
      value:     saleValue,
      pnl:       parseFloat(pnl.toFixed(2)),
      pnlPct:    parseFloat(pnlPct.toFixed(2)),
      reason,
      timestamp: new Date(),
    }
    state.trades.push(trade)

    console.log(`[PaperTrading] SELL ${quantity.toFixed(6)} ${symbol} @ $${currentPrice.toFixed(2)} | PnL: $${pnl.toFixed(2)} (${pnlPct.toFixed(2)}%)`)
    return trade
  }

  return null
}

/**
 * Verifica se o preço atual atingiu stop-loss ou take-profit.
 * Chama-se a cada ciclo de análise.
 */
export function checkStopAndTarget(currentPrice) {
  if (!state.position) return null

  const { stopLoss, takeProfit, symbol } = state.position

  if (currentPrice <= stopLoss) {
    console.log(`[PaperTrading] Stop-loss atingido! Preço: $${currentPrice}`)
    return executeOrder('SELL', symbol, currentPrice, 'Stop-loss atingido')
  }

  if (currentPrice >= takeProfit) {
    console.log(`[PaperTrading] Take-profit atingido! Preço: $${currentPrice}`)
    return executeOrder('SELL', symbol, currentPrice, 'Take-profit atingido')
  }

  return null
}

/**
 * Calcula o PnL não realizado da posição aberta.
 */
export function getUnrealizedPnL(currentPrice) {
  if (!state.position) return 0
  const { quantity, entryPrice } = state.position
  return (currentPrice - entryPrice) * quantity
}

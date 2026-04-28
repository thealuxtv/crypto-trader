import mongoose from 'mongoose'

const tradeSchema = new mongoose.Schema({
  type:       { type: String, enum: ['BUY', 'SELL'], required: true },
  symbol:     { type: String, required: true },
  price:      { type: Number, required: true },
  quantity:   { type: Number, required: true },
  value:      { type: Number, required: true },
  pnl:        { type: Number, default: null },
  pnlPct:     { type: Number, default: null },
  stopLoss:   { type: Number, default: null },
  takeProfit: { type: Number, default: null },
  reason:     { type: String, default: '' },
  timestamp:  { type: Date,   default: Date.now },
  win:        { type: Boolean, default: null },
})

const walletSchema = new mongoose.Schema({
  balanceUSDT: { type: Number, required: true },
  totalPnL:    { type: Number, default: 0 },
  position: {
    symbol:     String,
    quantity:   Number,
    entryPrice: Number,
    stopLoss:   Number,
    takeProfit: Number,
  },
  updatedAt: { type: Date, default: Date.now },
})

export const Trade  = mongoose.model('Trade',  tradeSchema)
export const Wallet = mongoose.model('Wallet', walletSchema)
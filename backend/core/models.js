import mongoose from 'mongoose'
import bcrypt   from 'bcryptjs'


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

// ── User ──────────────────────────────────────────────────────────────────
const userSchema = new mongoose.Schema({
  email:     { type: String, required: true, unique: true, lowercase: true, trim: true },
  password:  { type: String, required: true, minlength: 6 },
  name:      { type: String, required: true, trim: true },
  createdAt: { type: Date, default: Date.now },
})

// Hash da password antes de guardar
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next()
  this.password = await bcrypt.hash(this.password, 12)
  next()
})

// Método para verificar password
userSchema.methods.checkPassword = async function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password)
}

export const Trade  = mongoose.model('Trade',  tradeSchema)
export const Wallet = mongoose.model('Wallet', walletSchema)
export const User   = mongoose.model('User',   userSchema)

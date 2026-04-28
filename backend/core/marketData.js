import ccxt from 'ccxt'
import 'dotenv/config'

let exchange = null

export function getExchange() {
  if (exchange) return exchange
  const ExchangeClass = ccxt[process.env.EXCHANGE || 'binance']
  exchange = new ExchangeClass({
    apiKey: process.env.API_KEY,
    secret: process.env.API_SECRET,
    enableRateLimit: true,
  })
  if (process.env.SANDBOX === 'true') {
    exchange.setSandboxMode(true)
    console.log('[MarketData] Modo sandbox ativo — sem ordens reais')
  }
  return exchange
}

export async function fetchCandles(symbol, timeframe = '1h', limit = 200) {
  const ex = getExchange()
  const raw = await ex.fetchOHLCV(symbol, timeframe, undefined, limit)
  return raw.map(([timestamp, open, high, low, close, volume]) => ({
    timestamp: new Date(timestamp),
    open, high, low, close, volume,
  }))
}

export async function fetchTicker(symbol) {
  const ex = getExchange()
  const t  = await ex.fetchTicker(symbol)
  return {
    symbol:    t.symbol,
    last:      t.last,
    bid:       t.bid,
    ask:       t.ask,
    change24h: t.percentage,
    volume24h: t.quoteVolume,
    timestamp: new Date(t.timestamp),
  }
}
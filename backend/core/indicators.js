// core/indicators.js
// Calcula RSI, MACD e Bollinger Bands a partir de velas OHLCV

import {
  RSI,
  MACD,
  BollingerBands,
  EMA,
} from 'technicalindicators'

/**
 * Recebe array de candles e devolve os indicadores calculados
 * para a vela mais recente.
 *
 * @param {Array} candles — array de { open, high, low, close, volume }
 * @returns {Object} indicators
 */
export function computeIndicators(candles) {
  const closes = candles.map(c => c.close)
  const highs   = candles.map(c => c.high)
  const lows    = candles.map(c => c.low)
  const volumes = candles.map(c => c.volume)

  // ── RSI (14 períodos) ─────────────────────────────────────────────────
  // >70 = sobrecomprado (possível venda), <30 = sobrevendido (possível compra)
  const rsiValues = RSI.calculate({ values: closes, period: 14 })
  const rsi = rsiValues.at(-1)

  // ── MACD (12, 26, 9) ──────────────────────────────────────────────────
  // Cruzamento MACD > signal → tendência de alta
  // Cruzamento MACD < signal → tendência de baixa
  const macdValues = MACD.calculate({
    values: closes,
    fastPeriod: 12,
    slowPeriod: 26,
    signalPeriod: 9,
    SimpleMAOscillator: false,
    SimpleMASignal: false,
  })
  const macdLast = macdValues.at(-1)
  const macdPrev = macdValues.at(-2)

  // Detecta cruzamento nesta vela
  const macdCrossUp   = macdPrev?.MACD < macdPrev?.signal && macdLast?.MACD > macdLast?.signal
  const macdCrossDown = macdPrev?.MACD > macdPrev?.signal && macdLast?.MACD < macdLast?.signal

  // ── Bollinger Bands (20 períodos, 2 desvios padrão) ──────────────────
  // Preço próximo da banda inferior → possível reversão para cima
  // Preço próximo da banda superior → possível reversão para baixo
  const bbValues = BollingerBands.calculate({
    values: closes,
    period: 20,
    stdDev: 2,
  })
  const bb = bbValues.at(-1)
  const currentPrice = closes.at(-1)

  // Posição do preço dentro das bandas (0 = banda inf., 1 = banda sup.)
  const bbPosition = bb ? (currentPrice - bb.lower) / (bb.upper - bb.lower) : 0.5

  // ── EMA 50 e EMA 200 (tendência macro) ────────────────────────────────
  const ema50Values  = EMA.calculate({ values: closes, period: 50 })
  const ema200Values = EMA.calculate({ values: closes, period: 200 })
  const ema50  = ema50Values.at(-1)
  const ema200 = ema200Values.at(-1)

  // Tendência de longo prazo: preço acima de ambas as EMAs = bullish
  const trendBullish = ema50 && ema200 && ema50 > ema200

  // ── Volume relativo ───────────────────────────────────────────────────
  // Volume atual vs. média das últimas 20 velas
  const avgVolume = volumes.slice(-20).reduce((a, b) => a + b, 0) / 20
  const relativeVolume = volumes.at(-1) / avgVolume

  return {
    price: currentPrice,
    rsi,
    macd: {
      value:      macdLast?.MACD,
      signal:     macdLast?.signal,
      histogram:  macdLast?.histogram,
      crossUp:    macdCrossUp,
      crossDown:  macdCrossDown,
    },
    bollingerBands: {
      upper:    bb?.upper,
      middle:   bb?.middle,
      lower:    bb?.lower,
      position: bbPosition,   // 0–1
    },
    ema: { ema50, ema200, trendBullish },
    volume: { current: volumes.at(-1), average: avgVolume, relative: relativeVolume },
  }
}

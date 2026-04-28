import { RSI, MACD, BollingerBands, EMA } from 'technicalindicators'

export function computeIndicators(candles) {
  const closes  = candles.map(c => c.close)
  const volumes = candles.map(c => c.volume)

  const rsiValues = RSI.calculate({ values: closes, period: 14 })
  const rsi = rsiValues.at(-1)

  const macdValues = MACD.calculate({
    values: closes, fastPeriod: 12, slowPeriod: 26, signalPeriod: 9,
    SimpleMAOscillator: false, SimpleMASignal: false,
  })
  const macdLast = macdValues.at(-1)
  const macdPrev = macdValues.at(-2)
  const macdCrossUp   = macdPrev?.MACD < macdPrev?.signal && macdLast?.MACD > macdLast?.signal
  const macdCrossDown = macdPrev?.MACD > macdPrev?.signal && macdLast?.MACD < macdLast?.signal

  const bbValues = BollingerBands.calculate({ values: closes, period: 20, stdDev: 2 })
  const bb = bbValues.at(-1)
  const currentPrice = closes.at(-1)
  const bbPosition = bb ? (currentPrice - bb.lower) / (bb.upper - bb.lower) : 0.5

  const ema50Values  = EMA.calculate({ values: closes, period: 50 })
  const ema200Values = EMA.calculate({ values: closes, period: 200 })
  const ema50  = ema50Values.at(-1)
  const ema200 = ema200Values.at(-1)
  const trendBullish = ema50 && ema200 && ema50 > ema200

  const avgVolume = volumes.slice(-20).reduce((a, b) => a + b, 0) / 20
  const relativeVolume = volumes.at(-1) / avgVolume

  return {
    price: currentPrice,
    rsi,
    macd: {
      value: macdLast?.MACD, signal: macdLast?.signal,
      histogram: macdLast?.histogram, crossUp: macdCrossUp, crossDown: macdCrossDown,
    },
    bollingerBands: {
      upper: bb?.upper, middle: bb?.middle, lower: bb?.lower, position: bbPosition,
    },
    ema: { ema50, ema200, trendBullish },
    volume: { current: volumes.at(-1), average: avgVolume, relative: relativeVolume },
  }
}
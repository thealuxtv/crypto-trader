export function analyzeSignals(indicators) {
  const { rsi, macd, bollingerBands: bb, ema, volume } = indicators
  const reasons = []

  let rsiSignal = 0
  if (rsi < 30)      { rsiSignal = 1;  reasons.push(`RSI ${rsi.toFixed(1)} — sobrevendido`) }
  else if (rsi > 70) { rsiSignal = -1; reasons.push(`RSI ${rsi.toFixed(1)} — sobrecomprado`) }
  else               {                 reasons.push(`RSI ${rsi.toFixed(1)} — zona neutra`) }

  let macdSignal = 0
  if (macd.crossUp)        { macdSignal = 1;    reasons.push('MACD cruzou acima — bullish') }
  else if (macd.crossDown) { macdSignal = -1;   reasons.push('MACD cruzou abaixo — bearish') }
  else if (macd.histogram > 0) { macdSignal = 0.5;  reasons.push('MACD histograma positivo') }
  else if (macd.histogram < 0) { macdSignal = -0.5; reasons.push('MACD histograma negativo — tendência de baixa em curso') }

  let bbSignal = 0
  if (bb.position < 0.1)      { bbSignal = 1;  reasons.push('Preço na banda inferior de Bollinger') }
  else if (bb.position > 0.9) { bbSignal = -1; reasons.push('Preço na banda superior de Bollinger') }
  else { reasons.push(`Preço no meio das bandas (posição: ${(bb.position * 100).toFixed(0)}%)`) }

  let trendSignal = 0
  if (ema.trendBullish)                            { trendSignal = 0.5;  reasons.push('EMA50 acima de EMA200 — tendência macro bullish') }
  else if (ema.ema50 && ema.ema200 && ema.ema50 < ema.ema200) { trendSignal = -0.5; reasons.push('EMA50 abaixo de EMA200 — tendência macro bearish') }

  let volumeMultiplier = 1
  if (volume.relative > 1.5)      { volumeMultiplier = 1.2; reasons.push(`Volume ${volume.relative.toFixed(1)}x acima da média`) }
  else if (volume.relative < 0.7) { volumeMultiplier = 0.7; reasons.push(`Volume ${volume.relative.toFixed(1)}x abaixo da média`) }

  const score = (
    rsiSignal * 0.30 + macdSignal * 0.30 +
    bbSignal  * 0.25 + trendSignal * 0.15
  ) * volumeMultiplier

  const confidence = Math.min(Math.abs(score), 1)
  const THRESHOLD  = 0.35
  let action = 'HOLD'
  if (score >= THRESHOLD)  action = 'BUY'
  if (score <= -THRESHOLD) action = 'SELL'

  return {
    action, confidence: parseFloat(confidence.toFixed(4)),
    score: parseFloat(score.toFixed(4)),
    signals: { rsi: rsiSignal, macd: macdSignal, bb: bbSignal, trend: trendSignal },
    reasons, timestamp: new Date(),
  }
}
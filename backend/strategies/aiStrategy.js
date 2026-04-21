// strategies/aiStrategy.js
// Motor de decisão: combina sinais dos indicadores e devolve BUY | SELL | HOLD
// Cada indicador "vota" com um peso. A ação só é executada com consenso >= 65%.

/**
 * @param {Object} indicators — output de computeIndicators()
 * @returns {Object} decision
 *   {
 *     action:     'BUY' | 'SELL' | 'HOLD',
 *     confidence: 0–1,          // nível de consenso
 *     score:      -1 a +1,      // positivo = bullish, negativo = bearish
 *     signals:    { ... },      // voto de cada indicador
 *     reasons:    string[],     // explicação em texto
 *   }
 */
export function analyzeSignals(indicators) {
  const { rsi, macd, bollingerBands: bb, ema, volume } = indicators
  const reasons = []

  // ── Cada sinal devolve -1 (vender), 0 (neutro), +1 (comprar) ─────────

  // RSI
  let rsiSignal = 0
  if (rsi < 30) {
    rsiSignal = 1
    reasons.push(`RSI ${rsi.toFixed(1)} — sobrevendido, possível reversão para cima`)
  } else if (rsi > 70) {
    rsiSignal = -1
    reasons.push(`RSI ${rsi.toFixed(1)} — sobrecomprado, possível reversão para baixo`)
  } else {
    reasons.push(`RSI ${rsi.toFixed(1)} — zona neutra`)
  }

  // MACD
  let macdSignal = 0
  if (macd.crossUp) {
    macdSignal = 1
    reasons.push('MACD cruzou acima do sinal — momentum bullish')
  } else if (macd.crossDown) {
    macdSignal = -1
    reasons.push('MACD cruzou abaixo do sinal — momentum bearish')
  } else if (macd.histogram > 0) {
    macdSignal = 0.5
    reasons.push('MACD histograma positivo — tendência de alta em curso')
  } else if (macd.histogram < 0) {
    macdSignal = -0.5
    reasons.push('MACD histograma negativo — tendência de baixa em curso')
  }

  // Bollinger Bands
  let bbSignal = 0
  if (bb.position < 0.1) {
    bbSignal = 1
    reasons.push('Preço na banda inferior de Bollinger — zona de suporte')
  } else if (bb.position > 0.9) {
    bbSignal = -1
    reasons.push('Preço na banda superior de Bollinger — zona de resistência')
  } else {
    reasons.push(`Preço no meio das bandas (posição: ${(bb.position * 100).toFixed(0)}%)`)
  }

  // Tendência macro (EMA 50 vs EMA 200)
  let trendSignal = 0
  if (ema.trendBullish) {
    trendSignal = 0.5
    reasons.push('EMA50 acima de EMA200 — tendência macro bullish')
  } else if (ema.ema50 && ema.ema200 && ema.ema50 < ema.ema200) {
    trendSignal = -0.5
    reasons.push('EMA50 abaixo de EMA200 — tendência macro bearish')
  }

  // Volume (confirma ou enfraquece o sinal)
  let volumeMultiplier = 1
  if (volume.relative > 1.5) {
    volumeMultiplier = 1.2   // volume alto → reforça o sinal
    reasons.push(`Volume ${volume.relative.toFixed(1)}x acima da média — sinal mais forte`)
  } else if (volume.relative < 0.7) {
    volumeMultiplier = 0.7   // volume baixo → sinal mais fraco
    reasons.push(`Volume ${volume.relative.toFixed(1)}x abaixo da média — sinal mais fraco`)
  }

  // ── Cálculo do score final com pesos ─────────────────────────────────
  const weights = {
    rsi:    0.30,
    macd:   0.30,
    bb:     0.25,
    trend:  0.15,
  }

  const rawScore =
    rsiSignal    * weights.rsi   +
    macdSignal   * weights.macd  +
    bbSignal     * weights.bb    +
    trendSignal  * weights.trend

  const score      = rawScore * volumeMultiplier
  const confidence = Math.abs(score)          // 0–1 (quanto mais alto, mais convicto)

  // ── Decisão final ─────────────────────────────────────────────────────
  const THRESHOLD = 0.35   // mínimo de consenso para agir (35% de score normalizado)

  let action = 'HOLD'
  if (score >= THRESHOLD)  action = 'BUY'
  if (score <= -THRESHOLD) action = 'SELL'

  return {
    action,
    confidence: Math.min(confidence, 1),
    score: parseFloat(score.toFixed(4)),
    signals: {
      rsi:    rsiSignal,
      macd:   macdSignal,
      bb:     bbSignal,
      trend:  trendSignal,
    },
    reasons,
    timestamp: new Date(),
  }
}

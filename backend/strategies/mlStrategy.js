// backend/strategies/mlStrategy.js
const ML_URL = process.env.ML_SERVICE_URL || 'http://localhost:8000'

export async function analyzeWithML(indicators) {
  const { rsi, macd, bollingerBands: bb, ema, volume, price } = indicators

  try {
    // Calcula features adicionais a partir dos indicadores disponíveis
    const bbWidth = bb?.upper && bb?.lower && bb?.middle
      ? (bb.upper - bb.lower) / bb.middle : 0

    const ema50Dist = ema?.ema50 && price
      ? (price - ema.ema50) / ema.ema50 : 0

    const ema200Dist = ema?.ema200 && price
      ? (price - ema.ema200) / ema.ema200 : 0

    const body = {
      rsi:              rsi ?? 50,
      rsi_7:            rsi ?? 50,   // aproximação — idealmente calculado separadamente
      rsi_21:           rsi ?? 50,   // aproximação
      macd:             macd?.value ?? 0,
      macd_signal:      macd?.signal ?? 0,
      macd_hist:        macd?.histogram ?? 0,
      bb_position:      bb?.position ?? 0.5,
      bb_width:         bbWidth,
      ema50_dist:       ema50Dist,
      ema200_dist:      ema200Dist,
      ema_cross:        ema?.trendBullish ? 1 : 0,
      sma20_dist:       ema50Dist,   // aproximação
      sma50_dist:       ema50Dist,   // aproximação
      volume_ratio:     volume?.relative ?? 1,
      return_1:         0,
      return_3:         0,
      return_6:         0,
      momentum_3:       0,
      momentum_6:       0,
      momentum_12:      0,
      volatility_6:     0,
      volatility_12:    0,
      high_low_ratio:   0,
      close_open_ratio: 0,
    }

    const res  = await fetch(`${ML_URL}/predict`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    })

    const data = await res.json()
    console.log(`[ML] ${data.action} (confiança: ${(data.confidence * 100).toFixed(0)}%) | ${data.reasons[0]}`)

    return {
      action:     data.action,
      confidence: data.confidence,
      score:      data.score,
      signals:    {},
      reasons:    data.reasons,
      proba:      data.proba,
      timestamp:  new Date(),
      source:     'xgboost',
    }
  } catch (err) {
    console.error('[ML] Erro:', err.message)
    return {
      action:     'HOLD',
      confidence: 0,
      score:      0,
      signals:    {},
      reasons:    ['ML Service indisponível'],
      timestamp:  new Date(),
      source:     'fallback',
    }
  }
}
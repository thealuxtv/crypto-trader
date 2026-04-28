import { useEffect, useRef } from 'react'
import { createChart } from 'lightweight-charts'

export default function CandleChart({ candles, indicators }) {
  const containerRef = useRef(null)
  const chartRef     = useRef(null)
  const candleRef    = useRef(null)
  const bbUpperRef   = useRef(null)
  const bbLowerRef   = useRef(null)
  const bbMiddleRef  = useRef(null)

  useEffect(() => {
    if (!containerRef.current) return

    // ── Criar gráfico ──────────────────────────────────────────────────
    const chart = createChart(containerRef.current, {
      width:  containerRef.current.clientWidth,
      height: 380,
      layout: {
        background: { color: '#0d0d1a' },
        textColor:  '#555',
      },
      grid: {
        vertLines: { color: '#1a1a2e' },
        horzLines: { color: '#1a1a2e' },
      },
      crosshair: {
        mode: 1,
      },
      rightPriceScale: {
        borderColor: '#1e1e2e',
      },
      timeScale: {
        borderColor:     '#1e1e2e',
        timeVisible:     true,
        secondsVisible:  false,
      },
    })

    chartRef.current = chart

    // ── Série de velas ─────────────────────────────────────────────────
    const candleSeries = chart.addCandlestickSeries({
      upColor:        '#22c97b',
      downColor:      '#f05252',
      borderUpColor:  '#22c97b',
      borderDownColor:'#f05252',
      wickUpColor:    '#22c97b',
      wickDownColor:  '#f05252',
    })
    candleRef.current = candleSeries

    // ── Bollinger Bands ────────────────────────────────────────────────
    const bbUpper = chart.addLineSeries({
      color:       'rgba(100, 100, 200, 0.6)',
      lineWidth:   1,
      lineStyle:   2,   // dashed
      priceLineVisible: false,
      lastValueVisible: false,
    })
    const bbMiddle = chart.addLineSeries({
      color:       'rgba(100, 100, 200, 0.3)',
      lineWidth:   1,
      priceLineVisible: false,
      lastValueVisible: false,
    })
    const bbLower = chart.addLineSeries({
      color:       'rgba(100, 100, 200, 0.6)',
      lineWidth:   1,
      lineStyle:   2,
      priceLineVisible: false,
      lastValueVisible: false,
    })

    bbUpperRef.current  = bbUpper
    bbMiddleRef.current = bbMiddle
    bbLowerRef.current  = bbLower

    // ── Resize ─────────────────────────────────────────────────────────
    const handleResize = () => {
      if (containerRef.current) {
        chart.applyOptions({ width: containerRef.current.clientWidth })
      }
    }
    window.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('resize', handleResize)
      chart.remove()
    }
  }, [])

  // ── Atualiza dados quando as velas mudam ───────────────────────────
  useEffect(() => {
    if (!candles?.length || !candleRef.current) return

    // Converte para o formato do lightweight-charts
    const formatted = candles
      .filter(c => c.timestamp && c.open && c.high && c.low && c.close)
      .map(c => ({
        time:  Math.floor(new Date(c.timestamp).getTime() / 1000),
        open:  c.open,
        high:  c.high,
        low:   c.low,
        close: c.close,
      }))
      .sort((a, b) => a.time - b.time)
      // Remove duplicados
      .filter((c, i, arr) => i === 0 || c.time !== arr[i - 1].time)

    if (!formatted.length) return

    candleRef.current.setData(formatted)

    // ── Bollinger Bands calculadas sobre as velas ──────────────────────
    const closes = candles.map(c => c.close)
    const period = 20

    const bbData = formatted.map((c, i) => {
      const idx = candles.findIndex(cv =>
        Math.floor(new Date(cv.timestamp).getTime() / 1000) === c.time
      )
      if (idx < period - 1) return null

      const slice  = closes.slice(idx - period + 1, idx + 1)
      const mean   = slice.reduce((s, v) => s + v, 0) / period
      const std    = Math.sqrt(slice.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / period)

      return {
        time:   c.time,
        upper:  mean + 2 * std,
        middle: mean,
        lower:  mean - 2 * std,
      }
    }).filter(Boolean)

    if (bbData.length) {
      bbUpperRef.current.setData(bbData.map(d => ({ time: d.time, value: d.upper  })))
      bbMiddleRef.current.setData(bbData.map(d => ({ time: d.time, value: d.middle })))
      bbLowerRef.current.setData(bbData.map(d => ({ time: d.time, value: d.lower  })))
    }

    chartRef.current?.timeScale().fitContent()
  }, [candles])

  return (
    <div style={{ background: '#111120', border: '1px solid #1e1e2e', borderRadius: 12, padding: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <h2 style={{ margin: 0, fontSize: 13, color: '#555', textTransform: 'uppercase', letterSpacing: 1 }}>
          Gráfico de velas
        </h2>
        <div style={{ display: 'flex', gap: 16, fontSize: 11 }}>
          <span style={{ color: 'rgba(100,100,200,0.8)' }}>— Bollinger Bands</span>
          <span style={{ color: '#22c97b' }}>▲ Alta</span>
          <span style={{ color: '#f05252' }}>▼ Baixa</span>
        </div>
      </div>
      <div ref={containerRef} />
    </div>
  )
}
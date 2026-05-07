import { useEffect, useRef } from 'react'
import { createChart } from 'lightweight-charts'

export default function CandleChart({ candles, onTimeframeChange }) {
  const containerRef = useRef(null)
  const chartRef     = useRef(null)
  const candleRef    = useRef(null)
  const bbUpperRef   = useRef(null)
  const bbLowerRef   = useRef(null)
  const bbMiddleRef  = useRef(null)
  const priceLineRef = useRef(null)

  useEffect(() => {
    if (!containerRef.current) return

    const chart = createChart(containerRef.current, {
      width:  containerRef.current.clientWidth,
      height: 500,
      layout: {
        background: { color: '#0d0d1a' },
        textColor:  '#555',
      },
      grid: {
        vertLines: { color: '#1a1a2e' },
        horzLines: { color: '#1a1a2e' },
      },
      crosshair: { mode: 1 },
      rightPriceScale: { borderColor: '#1e1e2e' },
      timeScale: {
        borderColor:    '#1e1e2e',
        timeVisible:    true,
        secondsVisible: false,
      },
    })

    chartRef.current = chart

    // Velas
    const candleSeries = chart.addCandlestickSeries({
      upColor:         '#22c97b',
      downColor:       '#f05252',
      borderUpColor:   '#22c97b',
      borderDownColor: '#f05252',
      wickUpColor:     '#22c97b',
      wickDownColor:   '#f05252',
      priceFormat: {
        type:      'price',
        precision: 2,
        minMove:   0.01,
      },
    })
    candleRef.current = candleSeries

    // Bollinger Bands
    const bbUpper = chart.addLineSeries({
      color: 'rgba(100,100,200,0.6)', lineWidth: 1, lineStyle: 2,
      priceLineVisible: false, lastValueVisible: false,
    })
    const bbMiddle = chart.addLineSeries({
      color: 'rgba(100,100,200,0.3)', lineWidth: 1,
      priceLineVisible: false, lastValueVisible: false,
    })
    const bbLower = chart.addLineSeries({
      color: 'rgba(100,100,200,0.6)', lineWidth: 1, lineStyle: 2,
      priceLineVisible: false, lastValueVisible: false,
    })
    bbUpperRef.current  = bbUpper
    bbMiddleRef.current = bbMiddle
    bbLowerRef.current  = bbLower

    // Linha de preço atual
    const priceLine = chart.addLineSeries({
      color:            '#f5a623',
      lineWidth:        1,
      lineStyle:        1,
      priceLineVisible: true,
      lastValueVisible: true,
      title:            'atual',
    })
    priceLineRef.current = priceLine

    const handleResize = () => {
      if (containerRef.current)
        chart.applyOptions({ width: containerRef.current.clientWidth })
    }
    window.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('resize', handleResize)
      chart.remove()
    }
  }, [])

  useEffect(() => {
    if (!candles?.length || !candleRef.current) return

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
      .filter((c, i, arr) => i === 0 || c.time !== arr[i - 1].time)

    if (!formatted.length) return

    candleRef.current.setData(formatted)

    // Bollinger Bands
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
      return { time: c.time, upper: mean + 2 * std, middle: mean, lower: mean - 2 * std }
    }).filter(Boolean)

    if (bbData.length) {
      bbUpperRef.current.setData(bbData.map(d => ({ time: d.time, value: d.upper  })))
      bbMiddleRef.current.setData(bbData.map(d => ({ time: d.time, value: d.middle })))
      bbLowerRef.current.setData(bbData.map(d => ({ time: d.time, value: d.lower  })))
    }

    // Linha de preço atual — última vela
    if (priceLineRef.current && formatted.length) {
      const lastCandle = formatted.at(-1)
      priceLineRef.current.setData([{ time: lastCandle.time, value: lastCandle.close }])
    }

    chartRef.current?.timeScale().fitContent()

    // Mostra apenas as últimas 60 velas para as velas ficarem maiores
    const visibleCandles = Math.min(60, formatted.length)
    chartRef.current?.timeScale().setVisibleLogicalRange({
      from: formatted.length - visibleCandles,
      to:   formatted.length - 1,
    })
  }, [candles])

  return (
    <div style={{ background: '#111120', border: '1px solid #1e1e2e', borderRadius: 12, padding: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <h2 style={{ margin: 0, fontSize: 13, color: '#555', textTransform: 'uppercase', letterSpacing: 1 }}>
          Gráfico de velas
        </h2>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {['15m','1h','4h','1d'].map(tf => (
            <button
              key={tf}
              onClick={() => onTimeframeChange?.(tf)}
              style={{
                padding: '4px 10px', fontSize: 11, borderRadius: 6, cursor: 'pointer',
                background: 'transparent', border: '1px solid #2a2a40', color: '#555',
              }}
            >
              {tf}
            </button>
          ))}
          <span style={{ color: '#f5a623', fontSize: 11 }}>— Preço atual</span>
          <span style={{ color: 'rgba(100,100,200,0.8)', fontSize: 11 }}>— Bollinger</span>
          <span style={{ color: '#22c97b', fontSize: 11 }}>▲ Alta</span>
          <span style={{ color: '#f05252', fontSize: 11 }}>▼ Baixa</span>
        </div>
      </div>
      <div ref={containerRef} />
    </div>
  )
}
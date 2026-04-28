import { useState, useEffect, useCallback } from 'react'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api'
const WS_URL  = import.meta.env.VITE_WS_URL  || 'ws://localhost:3001'

export function useTrader() {
  const [status,     setStatus]     = useState(null)
  const [trades,     setTrades]     = useState([])
  const [indicators, setIndicators] = useState(null)
  const [candles,    setCandles]    = useState([])
  const [connected,  setConnected]  = useState(false)
  const [lastUpdate, setLastUpdate] = useState(null)

  const loadInitial = useCallback(async () => {
    try {
      const [statusRes, tradesRes] = await Promise.all([
        fetch(`${API_URL}/status`),
        fetch(`${API_URL}/trades?limit=20`),
      ])
      const statusData = await statusRes.json()
      const tradesData = await tradesRes.json()
      setStatus(statusData)
      setTrades(tradesData.trades)
    } catch (err) {
      console.error('Erro ao carregar estado inicial:', err)
    }
  }, [])

  const loadCandles = useCallback(async (symbol = 'BTC/USDT', timeframe = '1h') => {
    try {
      const res  = await fetch(`${API_URL}/candles?symbol=${symbol}&timeframe=${timeframe}&limit=100`)
      const data = await res.json()
      setCandles(data.candles || [])
    } catch (err) {
      console.error('Erro ao carregar velas:', err)
    }
  }, [])

  const resetWallet = useCallback(async () => {
    await fetch(`${API_URL}/reset`, { method: 'POST' })
    await loadInitial()
  }, [loadInitial])

  useEffect(() => {
    loadInitial()
    loadCandles()

    const ws = new WebSocket(WS_URL)

    ws.onopen = () => {
      setConnected(true)
      console.log('[WS] Ligado ao backend')
    }

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data)

      if (msg.type === 'cycle') {
        const { data } = msg
        setLastUpdate(new Date())

        setStatus(prev => ({
          ...prev,
          wallet: {
            ...prev?.wallet,
            position:      data.indicators?.position,
            unrealizedPnL: data.unrealizedPnL,
          },
          lastCycle: {
            timestamp:     data.timestamp,
            price:         data.price,
            action:        data.decision.action,
            confidence:    data.decision.confidence,
            score:         data.decision.score,
            reasons:       data.decision.reasons,
            unrealizedPnL: data.unrealizedPnL,
          },
        }))

        setIndicators(data.indicators)

        if (data.trade) {
          setTrades(prev => [data.trade, ...prev].slice(0, 50))
        }
      }
    }

    ws.onclose  = () => { setConnected(false) }
    ws.onerror  = ()  => { setConnected(false) }

    return () => ws.close()
  }, [loadInitial, loadCandles])

  return { status, trades, indicators, candles, connected, lastUpdate, resetWallet, loadCandles }
}
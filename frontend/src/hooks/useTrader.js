import { useState, useEffect, useCallback } from 'react'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api'
const WS_URL  = import.meta.env.VITE_WS_URL  || 'ws://localhost:3001'

export function useTrader(token) {
  const [status,     setStatus]     = useState(null)
  const [trades,     setTrades]     = useState([])
  const [indicators, setIndicators] = useState(null)
  const [candles,    setCandles]    = useState([])
  const [connected,  setConnected]  = useState(false)
  const [lastUpdate, setLastUpdate] = useState(null)

  const headers = { 'Authorization': `Bearer ${token}` }

  const loadInitial = useCallback(async () => {
    if (!token) return
    try {
      const [statusRes, tradesRes] = await Promise.all([
        fetch(`${API_URL}/status`,        { headers }),
        fetch(`${API_URL}/trades?limit=20`, { headers }),
      ])
      const statusData = await statusRes.json()
      const tradesData = await tradesRes.json()
      setStatus(statusData)
      setTrades(tradesData.trades || [])
    } catch (err) {
      console.error('Erro ao carregar estado inicial:', err)
    }
  }, [token])

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
    await fetch(`${API_URL}/reset`, { method: 'POST', headers })
    await loadInitial()
  }, [token, loadInitial])

  useEffect(() => {
    if (!token) return
    loadInitial()
    loadCandles()

    const ws = new WebSocket(WS_URL)

    ws.onopen = () => { setConnected(true) }

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data)
      if (msg.type === 'cycle') {
        const { data } = msg
        setLastUpdate(new Date())

        setCandles(prev => {
          if (!prev?.length) return prev
          const last = { ...prev[prev.length - 1] }
          last.close = data.price
          if (data.price > last.high) last.high = data.price
          if (data.price < last.low)  last.low  = data.price
          return [...prev.slice(0, -1), last]
        })

        setStatus(prev => ({
          ...prev,
          wallet: { ...prev?.wallet, unrealizedPnL: data.unrealizedPnL },
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
          loadInitial()
        }
      }
    }

    ws.onclose  = () => { setConnected(false) }
    ws.onerror  = ()  => { setConnected(false) }

    return () => ws.close()
  }, [token, loadInitial, loadCandles])

  return {
    status, trades, indicators, candles,
    connected, lastUpdate, resetWallet,
    loadCandles, loadStatus: loadInitial,
  }
}
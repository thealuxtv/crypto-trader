import { useState, useEffect } from 'react'
import { useTrader }    from './hooks/useTrader'
import Backtest         from './components/Backtest'
import CandleChart      from './components/CandleChart'
import ChatBot          from './components/ChatBot'
import Login            from './pages/Login'
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine
} from 'recharts'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api'

const fmt  = (n, d = 2) => n != null ? Number(n).toFixed(d) : '—'
const fmtK = (n)        => n != null ? `$${Number(n).toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'

function SignalBadge({ action }) {
  const map = {
    BUY:  { bg: '#0d3d2a', color: '#22c97b', label: '▲ COMPRAR' },
    SELL: { bg: '#3d0d0d', color: '#f05252', label: '▼ VENDER'  },
    HOLD: { bg: '#1e1e2e', color: '#888',    label: '⏸ AGUARDAR' },
  }
  const s = map[action] || map.HOLD
  return (
    <span style={{
      background: s.bg, color: s.color, fontFamily: 'monospace',
      fontSize: 13, fontWeight: 700, padding: '4px 14px',
      borderRadius: 20, letterSpacing: 1,
    }}>
      {s.label}
    </span>
  )
}

function IndicatorBar({ label, value, min, max, lowGood }) {
  const pct   = Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100))
  const color = lowGood
    ? (value < 30 ? '#22c97b' : value > 70 ? '#f05252' : '#f5a623')
    : (pct > 60   ? '#22c97b' : pct < 40   ? '#f05252' : '#f5a623')
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontSize: 12, color: '#888' }}>{label}</span>
        <span style={{ fontSize: 12, fontWeight: 600, color, fontFamily: 'monospace' }}>{fmt(value)}</span>
      </div>
      <div style={{ height: 5, background: '#1e1e2e', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 3, transition: 'width .6s' }} />
      </div>
    </div>
  )
}

function TradeRow({ trade }) {
  const isBuy    = trade.type === 'BUY'
  const pnlColor = trade.pnl > 0 ? '#22c97b' : trade.pnl < 0 ? '#f05252' : '#888'
  return (
    <tr style={{ borderBottom: '1px solid #1e1e2e' }}>
      <td style={{ padding: '8px 6px', fontSize: 11, color: '#888' }}>
        {new Date(trade.timestamp).toLocaleTimeString('pt-PT')}
      </td>
      <td style={{ padding: '8px 6px' }}>
        <span style={{ fontSize: 11, fontWeight: 700, fontFamily: 'monospace', color: isBuy ? '#22c97b' : '#f05252' }}>
          {isBuy ? '▲' : '▼'} {trade.type}
        </span>
      </td>
      <td style={{ padding: '8px 6px', fontSize: 12, fontFamily: 'monospace', color: '#ccc' }}>
        {fmtK(trade.price)}
      </td>
      <td style={{ padding: '8px 6px', fontSize: 11, color: '#888', fontFamily: 'monospace' }}>
        {fmt(trade.quantity, 6)}
      </td>
      <td style={{ padding: '8px 6px', fontSize: 12, fontFamily: 'monospace', color: pnlColor, textAlign: 'right' }}>
        {trade.pnl != null ? (trade.pnl > 0 ? '+' : '') + fmtK(trade.pnl) : '—'}
      </td>
    </tr>
  )
}

// ── Login wrapper ─────────────────────────────────────────────────────────

export default function App() {
  const [token, setToken] = useState(() => localStorage.getItem('token'))
  const [user,  setUser]  = useState(() => {
    try { return JSON.parse(localStorage.getItem('user')) } catch { return null }
  })

  const handleLogin = (userData, userToken) => {
    setToken(userToken)
    setUser(userData)
  }

  const handleLogout = () => {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    setToken(null)
    setUser(null)
  }

  useEffect(() => {
    if (!token) return
    fetch(`${API_URL}/auth/me`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => { if (!d.ok) handleLogout() })
      .catch(() => handleLogout())
  }, [])

  if (!token || !user) return <Login onLogin={handleLogin} />
  return <Dashboard token={token} user={user} onLogout={handleLogout} />
}

// ── Dashboard ─────────────────────────────────────────────────────────────

function Dashboard({ token, user, onLogout }) {
  const [page, setPage] = useState('live')
  const { status, trades, indicators, candles, connected, lastUpdate, resetWallet, loadCandles, loadStatus } = useTrader(token)

  const wallet    = status?.wallet
  const lastCycle = status?.lastCycle
  const ind       = indicators

  const pnlHistory = trades
    .filter(t => t.pnl != null)
    .reverse()
    .reduce((acc, t, i) => {
      const prev = acc[i - 1]?.cumulative || 0
      acc.push({ i: i + 1, pnl: t.pnl, cumulative: prev + t.pnl })
      return acc
    }, [])

  return (
    <div style={{
      minHeight: '100vh', background: '#0a0a12', color: '#e0e0e0',
      fontFamily: '"IBM Plex Sans", system-ui, sans-serif', padding: '24px 28px',
    }}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, letterSpacing: -0.5, color: '#fff' }}>
              ◈ Crypto AI Trader
            </h1>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: '#555' }}>Modo simulação • Paper trading</p>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {[{ id: 'live', label: '● Live' }, { id: 'backtest', label: '⏪ Backtest' }].map(p => (
              <button key={p.id} onClick={() => setPage(p.id)} style={{
                padding: '6px 16px', fontSize: 13, borderRadius: 8, cursor: 'pointer',
                background: page === p.id ? '#1a1a3a' : 'transparent',
                border: `1px solid ${page === p.id ? '#4444aa' : '#2a2a40'}`,
                color: page === p.id ? '#aaaaff' : '#555',
              }}>{p.label}</button>
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 12, color: '#555' }}>👤 {user.name}</span>
          <span style={{
            fontSize: 11, padding: '4px 10px', borderRadius: 20,
            background: connected ? '#0d3d2a' : '#3d0d0d',
            color: connected ? '#22c97b' : '#f05252',
          }}>
            {connected ? '● LIVE' : '○ OFFLINE'}
          </span>
          <button onClick={resetWallet} style={{
            fontSize: 12, padding: '6px 14px', borderRadius: 8,
            background: 'transparent', border: '1px solid #333', color: '#888', cursor: 'pointer',
          }}>
            Reiniciar wallet
          </button>
          <button onClick={onLogout} style={{
            fontSize: 12, padding: '6px 14px', borderRadius: 8,
            background: 'transparent', border: '1px solid #3d0d0d', color: '#f05252', cursor: 'pointer',
          }}>
            Sair
          </button>
        </div>
      </div>

      {/* ── Página Live ── */}
      {page === 'live' && <>

        {/* Métricas topo */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
          {[
            { label: 'Saldo USDT',       value: fmtK(wallet?.balanceUSDT),       sub: 'disponível' },
            { label: 'Preço atual',       value: fmtK(lastCycle?.price),          sub: 'BTC/USDT' },
            { label: 'PnL realizado',     value: fmtK(wallet?.totalPnL),          sub: `${status?.wallet?.totalTrades || 0} trades`, color: wallet?.totalPnL > 0 ? '#22c97b' : wallet?.totalPnL < 0 ? '#f05252' : '#888' },
            { label: 'PnL não realizado', value: fmtK(lastCycle?.unrealizedPnL),  sub: 'posição aberta', color: lastCycle?.unrealizedPnL > 0 ? '#22c97b' : lastCycle?.unrealizedPnL < 0 ? '#f05252' : '#888' },
          ].map(m => (
            <div key={m.label} style={{ background: '#111120', border: '1px solid #1e1e2e', borderRadius: 12, padding: '14px 16px' }}>
              <p style={{ margin: '0 0 6px', fontSize: 11, color: '#555', textTransform: 'uppercase', letterSpacing: 1 }}>{m.label}</p>
              <p style={{ margin: 0, fontSize: 22, fontWeight: 700, fontFamily: 'monospace', color: m.color || '#fff' }}>{m.value}</p>
              <p style={{ margin: '4px 0 0', fontSize: 11, color: '#555' }}>{m.sub}</p>
            </div>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 16 }}>

          {/* Coluna esquerda */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Gráfico de velas */}
            <CandleChart candles={candles} indicators={ind} onTimeframeChange={(tf) => loadCandles('BTC/USDT', tf)} />

            {/* Sinal da IA */}
            <div style={{ background: '#111120', border: '1px solid #1e1e2e', borderRadius: 12, padding: 18 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                <h2 style={{ margin: 0, fontSize: 13, color: '#555', textTransform: 'uppercase', letterSpacing: 1 }}>Sinal da IA</h2>
                {lastCycle && <SignalBadge action={lastCycle.action} />}
              </div>
              {lastCycle && (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ fontSize: 12, color: '#555' }}>Confiança</span>
                    <span style={{ fontSize: 12, fontFamily: 'monospace', color: '#ccc' }}>
                      {fmt(lastCycle.confidence * 100, 0)}%
                    </span>
                  </div>
                  <div style={{ height: 6, background: '#1e1e2e', borderRadius: 3, marginBottom: 14, overflow: 'hidden' }}>
                    <div style={{
                      width: `${lastCycle.confidence * 100}%`, height: '100%',
                      background: lastCycle.action === 'BUY' ? '#22c97b' : lastCycle.action === 'SELL' ? '#f05252' : '#555',
                      borderRadius: 3, transition: 'width .6s',
                    }} />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {(lastCycle.reasons || []).map((r, i) => (
                      <div key={i} style={{
                        fontSize: 12, color: '#888', padding: '6px 10px',
                        background: '#0d0d1a', borderRadius: 6, borderLeft: '2px solid #2a2a40',
                      }}>
                        {r}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* PnL acumulado */}
            {pnlHistory.length > 1 && (
              <div style={{ background: '#111120', border: '1px solid #1e1e2e', borderRadius: 12, padding: 18 }}>
                <h2 style={{ margin: '0 0 14px', fontSize: 13, color: '#555', textTransform: 'uppercase', letterSpacing: 1 }}>PnL acumulado</h2>
                <ResponsiveContainer width="100%" height={140}>
                  <AreaChart data={pnlHistory}>
                    <defs>
                      <linearGradient id="pnlGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor="#22c97b" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#22c97b" stopOpacity={0}   />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="i" hide />
                    <YAxis hide />
                    <ReferenceLine y={0} stroke="#333" strokeDasharray="4 4" />
                    <Tooltip
                      contentStyle={{ background: '#111120', border: '1px solid #1e1e2e', borderRadius: 8, fontSize: 12 }}
                      formatter={(v) => [`$${Number(v).toFixed(2)}`, 'PnL acumulado']}
                    />
                    <Area type="monotone" dataKey="cumulative" stroke="#22c97b" fill="url(#pnlGrad)" strokeWidth={2} dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Histórico de trades */}
            <div style={{ background: '#111120', border: '1px solid #1e1e2e', borderRadius: 12, padding: 18 }}>
              <h2 style={{ margin: '0 0 14px', fontSize: 13, color: '#555', textTransform: 'uppercase', letterSpacing: 1 }}>Histórico de trades</h2>
              {trades.length === 0
                ? <p style={{ fontSize: 12, color: '#444', textAlign: 'center', padding: '20px 0' }}>Sem trades ainda</p>
                : (
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        {['Hora', 'Tipo', 'Preço', 'Qtd.', 'PnL'].map(h => (
                          <th key={h} style={{ fontSize: 10, color: '#444', textAlign: 'left', padding: '0 6px 8px', textTransform: 'uppercase', letterSpacing: 1 }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {trades.slice(0, 15).map((t, i) => <TradeRow key={i} trade={t} />)}
                    </tbody>
                  </table>
                )
              }
            </div>
          </div>

          {/* Coluna direita */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ background: '#111120', border: '1px solid #1e1e2e', borderRadius: 12, padding: 18 }}>
              <h2 style={{ margin: '0 0 18px', fontSize: 13, color: '#555', textTransform: 'uppercase', letterSpacing: 1 }}>Indicadores técnicos</h2>
              {ind ? (
                <>
                  <IndicatorBar label="RSI (14)"            value={ind.rsi}                                      min={0}    max={100} lowGood />
                  <IndicatorBar label="MACD histograma"     value={ind.macd?.histogram}                          min={-200} max={200} />
                  <IndicatorBar label="Bollinger (posição)" value={(ind.bollingerBands?.position || 0) * 100}    min={0}    max={100} />
                  <IndicatorBar label="Volume relativo"     value={(ind.volume?.relative || 1) * 50}             min={0}    max={100} />
                  <div style={{ marginTop: 18, paddingTop: 14, borderTop: '1px solid #1e1e2e' }}>
                    <p style={{ fontSize: 11, color: '#555', margin: '0 0 10px', textTransform: 'uppercase', letterSpacing: 1 }}>Detalhes</p>
                    {[
                      ['RSI',       fmt(ind.rsi)],
                      ['MACD',      fmt(ind.macd?.value, 4)],
                      ['BB Upper',  fmtK(ind.bollingerBands?.upper)],
                      ['BB Lower',  fmtK(ind.bollingerBands?.lower)],
                      ['EMA 50',    fmtK(ind.ema?.ema50)],
                      ['EMA 200',   fmtK(ind.ema?.ema200)],
                      ['Tendência', ind.ema?.trendBullish ? '▲ Bullish' : '▼ Bearish'],
                    ].map(([k, v]) => (
                      <div key={k} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                        <span style={{ fontSize: 12, color: '#555' }}>{k}</span>
                        <span style={{ fontSize: 12, fontFamily: 'monospace', color: '#ccc' }}>{v}</span>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <p style={{ fontSize: 12, color: '#444', textAlign: 'center', padding: '20px 0' }}>A aguardar dados...</p>
              )}
            </div>

            {/* Posição aberta */}
            {wallet?.position && (
              <div style={{ background: '#0d2a1a', border: '1px solid #0d4a2a', borderRadius: 12, padding: 18 }}>
                <h2 style={{ margin: '0 0 14px', fontSize: 13, color: '#22c97b', textTransform: 'uppercase', letterSpacing: 1 }}>Posição aberta</h2>
                {[
                  ['Par',         wallet.position.symbol],
                  ['Entrada',     fmtK(wallet.position.entryPrice)],
                  ['Quantidade',  fmt(wallet.position.quantity, 6)],
                  ['Stop-loss',   fmtK(wallet.position.stopLoss)],
                  ['Take-profit', fmtK(wallet.position.takeProfit)],
                ].map(([k, v]) => (
                  <div key={k} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span style={{ fontSize: 12, color: '#0d8a4a' }}>{k}</span>
                    <span style={{ fontSize: 12, fontFamily: 'monospace', color: '#22c97b' }}>{v}</span>
                  </div>
                ))}
                <button
                  onClick={async () => {
                    await fetch(`${API_URL}/close-position`, {
                      method: 'POST',
                      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
                    })
                    await loadStatus()
                  }}
                  style={{
                    width: '100%', marginTop: 12, padding: '9px 0',
                    background: '#3d0d0d', border: '1px solid #6a1a1a',
                    color: '#f05252', borderRadius: 8, fontSize: 13,
                    fontWeight: 600, cursor: 'pointer',
                  }}
                >
                  ✕ Fechar posição
                </button>
              </div>
            )}

            {lastUpdate && (
              <p style={{ fontSize: 11, color: '#333', textAlign: 'center', margin: 0 }}>
                Atualizado às {lastUpdate.toLocaleTimeString('pt-PT')}
              </p>
            )}
          </div>
        </div>
      </>}

      {/* ── Página Backtest ── */}
      {page === 'backtest' && (
        <div style={{ marginTop: 0 }}>
          <Backtest />
        </div>
      )}

      <ChatBot />
    </div>
  )
}
import { useState, useCallback } from 'react'
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  ReferenceLine, CartesianGrid, BarChart, Bar, Cell,
} from 'recharts'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api'

const fmt     = (n, d = 2) => n != null ? Number(n).toFixed(d) : '—'
const fmtK    = (n)        => n != null ? `$${Number(n).toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'
const fmtDate = (ts)       => ts ? new Date(ts).toLocaleDateString('pt-PT', { day: '2-digit', month: 'short' }) : ''

const METRIC_THRESHOLDS = {
  winRate:      { good: 50,  great: 60  },
  profitFactor: { good: 1.2, great: 1.5 },
  maxDrawdown:  { good: 15,  great: 8, invert: true },
  sharpeRatio:  { good: 0.5, great: 1.0 },
}

function metricColor(key, value) {
  const t = METRIC_THRESHOLDS[key]
  if (!t) return '#888'
  const isGreat = t.invert ? value <= t.great : value >= t.great
  const isGood  = t.invert ? value <= t.good  : value >= t.good
  if (isGreat) return '#22c97b'
  if (isGood)  return '#f5a623'
  return '#f05252'
}

function MetricCard({ label, value, unit = '', metricKey, sub }) {
  const color = metricKey ? metricColor(metricKey, parseFloat(value)) : '#fff'
  return (
    <div style={{ background: '#111120', border: '1px solid #1e1e2e', borderRadius: 12, padding: '14px 16px' }}>
      <p style={{ margin: '0 0 6px', fontSize: 11, color: '#555', textTransform: 'uppercase', letterSpacing: 1 }}>{label}</p>
      <p style={{ margin: 0, fontSize: 20, fontWeight: 700, fontFamily: 'monospace', color }}>
        {value}{unit}
      </p>
      {sub && <p style={{ margin: '4px 0 0', fontSize: 11, color: '#444' }}>{sub}</p>}
    </div>
  )
}

function SliderField({ label, name, value, min, max, step, format, onChange }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
        <label style={{ fontSize: 12, color: '#888' }}>{label}</label>
        <span style={{ fontSize: 12, fontFamily: 'monospace', color: '#ccc' }}>{format(value)}</span>
      </div>
      <input
        type="range" name={name} min={min} max={max} step={step} value={value}
        onChange={e => onChange(name, parseFloat(e.target.value))}
        style={{ width: '100%' }}
      />
    </div>
  )
}

function buildHistogram(values, buckets = 10) {
  const clean = (values || []).filter(v => v != null && !isNaN(v))
  if (!clean.length) return []
  const min  = Math.min(...clean)
  const max  = Math.max(...clean)
  if (min === max) return []
  const size = (max - min) / buckets
  const bins = Array.from({ length: buckets }, (_, i) => ({
    label:    `${(min + i * size).toFixed(1)}%`,
    midpoint: min + (i + 0.5) * size,
    count:    0,
  }))
  clean.forEach(v => {
    const idx = Math.min(Math.floor((v - min) / size), buckets - 1)
    if (bins[idx]) bins[idx].count++
  })
  return bins
}

export default function Backtest() {
  const [config, setConfig] = useState({
    symbol: 'BTC/USDT', timeframe: '1h', limit: 500,
    startingBalance: 10000, stopLossPct: 0.03,
    takeProfitPct: 0.06, maxPositionPct: 0.10, feesPct: 0.001,
  })
  const [result,  setResult]  = useState(null)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState(null)
  const [tab,     setTab]     = useState('equity')

  const handleChange = useCallback((name, value) => {
    setConfig(prev => ({ ...prev, [name]: value }))
  }, [])

  const runBacktest = async (useML = false) => {
    setLoading(true); setError(null); setResult(null)
    try {
      const endpoint = useML ? `${API_URL}/backtest/ml` : `${API_URL}/backtest`
      const body = useML
        ? {
            symbol:           config.symbol,
            timeframe:        config.timeframe,
            limit:            config.limit,
            starting_balance: config.startingBalance,
            stop_loss_pct:    config.stopLossPct,
            take_profit_pct:  config.takeProfitPct,
            max_position_pct: config.maxPositionPct,
            fees_pct:         config.feesPct,
          }
        : config

      const res  = await fetch(endpoint, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
      })
      const data = await res.json()
      if (!data.ok) throw new Error(data.error)
      setResult(data); setTab('equity')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const m = result?.metrics?.totalTrades > 0 ? result.metrics : null
  const pnlBuckets = result?.trades?.length ? buildHistogram(result.trades.map(t => t.pnlPct).filter(v => v != null), 10) : []

  return (
    <div style={{ color: '#e0e0e0', fontFamily: '"IBM Plex Sans", system-ui, sans-serif' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 20, marginBottom: 24 }}>

        {/* Configuração */}
        <div style={{ background: '#111120', border: '1px solid #1e1e2e', borderRadius: 12, padding: 20 }}>
          <h2 style={{ margin: '0 0 20px', fontSize: 13, color: '#555', textTransform: 'uppercase', letterSpacing: 1 }}>Configuração</h2>

          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 12, color: '#888', display: 'block', marginBottom: 6 }}>Par</label>
            <select
              value={config.symbol}
              onChange={e => handleChange('symbol', e.target.value)}
              style={{ width: '100%', background: '#0d0d1a', border: '1px solid #2a2a40', color: '#ccc', borderRadius: 8, padding: '7px 10px', fontSize: 13 }}
            >
              {['BTC/USDT','ETH/USDT','SOL/USDT','BNB/USDT','XRP/USDT'].map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 12, color: '#888', display: 'block', marginBottom: 6 }}>Timeframe</label>
            <div style={{ display: 'flex', gap: 6 }}>
              {['15m','1h','4h','1d'].map(tf => (
                <button key={tf} onClick={() => handleChange('timeframe', tf)} style={{
                  flex: 1, padding: '6px 0', fontSize: 12, borderRadius: 8, cursor: 'pointer',
                  background: config.timeframe === tf ? '#1a1a3a' : 'transparent',
                  border: `1px solid ${config.timeframe === tf ? '#4444aa' : '#2a2a40'}`,
                  color: config.timeframe === tf ? '#aaaaff' : '#666',
                }}>{tf}</button>
              ))}
            </div>
          </div>

          <SliderField label="Nº de velas"    name="limit"           value={config.limit}           min={200}  max={1000} step={100}   format={v => `${v}`}                  onChange={handleChange} />
          <SliderField label="Saldo inicial"  name="startingBalance" value={config.startingBalance} min={1000} max={50000} step={1000} format={v => `$${v.toLocaleString()}`} onChange={handleChange} />
          <SliderField label="Stop-loss"      name="stopLossPct"     value={config.stopLossPct}     min={0.01} max={0.10} step={0.005}  format={v => `${(v*100).toFixed(1)}%`} onChange={handleChange} />
          <SliderField label="Take-profit"    name="takeProfitPct"   value={config.takeProfitPct}   min={0.01} max={0.20} step={0.005}  format={v => `${(v*100).toFixed(1)}%`} onChange={handleChange} />
          <SliderField label="Tamanho posição" name="maxPositionPct" value={config.maxPositionPct}  min={0.05} max={0.50} step={0.05}   format={v => `${(v*100).toFixed(0)}%`} onChange={handleChange} />

          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          <button
            onClick={() => runBacktest(false)}
            disabled={loading}
            style={{
              flex: 1, padding: '11px 0',
              background: loading ? '#1a1a2a' : '#1a1a4a',
              border: `1px solid ${loading ? '#333' : '#3333aa'}`,
              color: loading ? '#555' : '#aaaaff',
              borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer',
            }}
          >
            {loading ? '⏳ A correr...' : '▶ Regras fixas'}
          </button>
          <button
            onClick={() => runBacktest(true)}
            disabled={loading}
            style={{
              flex: 1, padding: '11px 0',
              background: loading ? '#1a1a2a' : '#0d2a1a',
              border: `1px solid ${loading ? '#333' : '#0d4a2a'}`,
              color: loading ? '#555' : '#22c97b',
              borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer',
            }}
          >
            {loading ? '⏳ A correr...' : '🤖 Modelo ML'}
          </button>
        </div>

          {error && <p style={{ fontSize: 12, color: '#f05252', marginTop: 10, textAlign: 'center' }}>{error}</p>}
        </div>

        {/* Métricas */}
        <div>
          {!result && !loading && (
            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px dashed #1e1e2e', borderRadius: 12, color: '#333', fontSize: 13 }}>
              Configura e corre o backtest para ver os resultados
            </div>
          )}
          {loading && (
            <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', border: '1px solid #1e1e2e', borderRadius: 12, gap: 14 }}>
              <div style={{ width: 36, height: 36, border: '3px solid #1e1e2e', borderTopColor: '#4444aa', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
              <p style={{ fontSize: 13, color: '#555', margin: 0 }}>A processar {config.limit} velas...</p>
              <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </div>
          )}
          {m && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
                <MetricCard label="Retorno total"  value={`${m.totalReturn > 0 ? '+' : ''}${fmt(m.totalReturn)}`} unit="%" sub={`${fmtK(config.startingBalance)} → ${fmtK(m.finalBalance)}`} />
                <MetricCard label="Taxa de acerto" value={fmt(m.winRate)}      unit="%" metricKey="winRate"      sub={`${m.wins}W / ${m.losses}L de ${m.totalTrades} trades`} />
                <MetricCard label="Profit factor"  value={fmt(m.profitFactor)}          metricKey="profitFactor" sub="rácio ganhos/perdas" />
                <MetricCard label="Max. drawdown"  value={fmt(m.maxDrawdown)}  unit="%" metricKey="maxDrawdown"  sub="queda máxima do pico" />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
                <MetricCard label="Sharpe ratio"  value={fmt(m.sharpeRatio)}           metricKey="sharpeRatio" sub="retorno ajustado ao risco" />
                <MetricCard label="PnL total"     value={fmtK(m.totalPnL)}             sub="após comissões" />
                <MetricCard label="Média ganhos"  value={`+${fmt(m.avgWinPct)}`} unit="%" sub="por trade vencedor" />
                <MetricCard label="Média perdas"  value={fmt(m.avgLossPct)}     unit="%" sub="por trade perdedor" />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Gráficos */}
      {result && (
        <div style={{ background: '#111120', border: '1px solid #1e1e2e', borderRadius: 12, padding: 20 }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
            {[
              { id: 'equity',       label: 'Equity curve' },
              { id: 'trades',       label: `Trades (${result.trades.length})` },
              { id: 'distribution', label: 'Distribuição PnL' },
            ].map(t => (
              <button key={t.id} onClick={() => setTab(t.id)} style={{
                padding: '6px 14px', fontSize: 12, borderRadius: 8, cursor: 'pointer',
                background: tab === t.id ? '#1a1a3a' : 'transparent',
                border: `1px solid ${tab === t.id ? '#4444aa' : '#2a2a40'}`,
                color: tab === t.id ? '#aaaaff' : '#555',
              }}>{t.label}</button>
            ))}
            <span style={{ marginLeft: 'auto', fontSize: 11, color: '#333', alignSelf: 'center' }}>
              {result.candlesUsed} velas · {result.duration}s
            </span>
          </div>

          {tab === 'equity' && (
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={result.equityCurve}>
                <defs>
                  <linearGradient id="eqGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#4444aa" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#4444aa" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#1a1a2a" strokeDasharray="4 4" />
                <XAxis dataKey="timestamp" tickFormatter={fmtDate} tick={{ fontSize: 10, fill: '#555' }} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 10, fill: '#555' }} tickFormatter={v => `$${(v/1000).toFixed(0)}k`} />
                <ReferenceLine y={config.startingBalance} stroke="#333" strokeDasharray="4 4" />
                <Tooltip
                  contentStyle={{ background: '#111120', border: '1px solid #1e1e2e', borderRadius: 8, fontSize: 12 }}
                  labelFormatter={fmtDate}
                  formatter={(v) => [fmtK(v), 'Capital']}
                />
                <Area type="monotone" dataKey="equity" stroke="#6666cc" fill="url(#eqGrad)" strokeWidth={2} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          )}

          {tab === 'trades' && (
            <div style={{ maxHeight: 380, overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead style={{ position: 'sticky', top: 0, background: '#111120' }}>
                  <tr>
                    {['#','Entrada','Saída','Preço entrada','Preço saída','PnL','PnL %','Motivo'].map(h => (
                      <th key={h} style={{ padding: '8px', textAlign: 'left', fontSize: 10, color: '#444', textTransform: 'uppercase', letterSpacing: 1, borderBottom: '1px solid #1e1e2e' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.trades.map((t, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid #0d0d1a' }}>
                      <td style={{ padding: '7px 8px', color: '#555' }}>{i + 1}</td>
                      <td style={{ padding: '7px 8px', color: '#666', fontFamily: 'monospace' }}>{fmtDate(t.entryTime)}</td>
                      <td style={{ padding: '7px 8px', color: '#666', fontFamily: 'monospace' }}>{fmtDate(t.timestamp)}</td>
                      <td style={{ padding: '7px 8px', fontFamily: 'monospace', color: '#ccc' }}>{fmtK(t.entryPrice)}</td>
                      <td style={{ padding: '7px 8px', fontFamily: 'monospace', color: '#ccc' }}>{fmtK(t.exitPrice)}</td>
                      <td style={{ padding: '7px 8px', fontFamily: 'monospace', color: t.win ? '#22c97b' : '#f05252' }}>
                        {t.pnl > 0 ? '+' : ''}{fmtK(t.pnl)}
                      </td>
                      <td style={{ padding: '7px 8px', fontFamily: 'monospace', color: t.win ? '#22c97b' : '#f05252' }}>
                        {t.pnlPct > 0 ? '+' : ''}{fmt(t.pnlPct)}%
                      </td>
                      <td style={{ padding: '7px 8px', color: '#555', fontSize: 11 }}>{t.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {tab === 'distribution' && (
            <div>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={pnlBuckets}>
                  <CartesianGrid stroke="#1a1a2a" strokeDasharray="4 4" />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#555' }} />
                  <YAxis tick={{ fontSize: 10, fill: '#555' }} />
                  <Tooltip
                    contentStyle={{ background: '#111120', border: '1px solid #1e1e2e', borderRadius: 8, fontSize: 12 }}
                    formatter={(v) => [`${v} trades`, 'Frequência']}
                  />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                    {pnlBuckets.map((b, i) => (
                      <Cell key={i} fill={b.midpoint >= 0 ? '#1a4a2a' : '#3a1a1a'} stroke={b.midpoint >= 0 ? '#22c97b' : '#f05252'} strokeWidth={1} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <p style={{ fontSize: 11, color: '#444', marginTop: 10, textAlign: 'center' }}>
                Verde = trades positivos · Vermelho = trades negativos
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
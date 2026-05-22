import { useState, useRef, useEffect } from 'react'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api'

export default function ChatBot() {
  const [open,     setOpen]     = useState(false)
  const [messages, setMessages] = useState([
    { role: 'bot', text: 'Olá! Sou o assistente do Crypto AI Trader. Pergunta-me sobre indicadores, o modelo ML, ou o estado atual do sistema. Escreve "ajuda" para ver os tópicos disponíveis.' }
  ])
  const [input,    setInput]    = useState('')
  const [loading,  setLoading]  = useState(false)
  const bottomRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const send = async () => {
    if (!input.trim() || loading) return
    const userMsg = input.trim()
    setInput('')
    setMessages(prev => [...prev, { role: 'user', text: userMsg }])
    setLoading(true)

    try {
      const res  = await fetch(`${API_URL}/chat`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ message: userMsg }),
      })
      const data = await res.json()
      setMessages(prev => [...prev, { role: 'bot', text: data.answer }])
    } catch {
      setMessages(prev => [...prev, { role: 'bot', text: 'Erro ao contactar o assistente. Verifica se o serviço Python está a correr.' }])
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      {/* Botão flutuante */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          position: 'fixed', bottom: 28, right: 28, zIndex: 1000,
          width: 52, height: 52, borderRadius: '50%',
          background: '#1a1a4a', border: '1px solid #4444aa',
          color: '#aaaaff', fontSize: 22, cursor: 'pointer',
          boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        {open ? '✕' : '💬'}
      </button>

      {/* Janela do chat */}
      {open && (
        <div style={{
          position: 'fixed', bottom: 92, right: 28, zIndex: 999,
          width: 360, height: 480,
          background: '#111120', border: '1px solid #1e1e2e',
          borderRadius: 16, display: 'flex', flexDirection: 'column',
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
          fontFamily: '"IBM Plex Sans", system-ui, sans-serif',
        }}>

          {/* Header */}
          <div style={{
            padding: '14px 16px', borderBottom: '1px solid #1e1e2e',
            display: 'flex', alignItems: 'center', gap: 10,
          }}>
            <span style={{ fontSize: 18 }}>🤖</span>
            <div>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: '#fff' }}>Assistente</p>
              <p style={{ margin: 0, fontSize: 11, color: '#555' }}>Crypto AI Trader</p>
            </div>
          </div>

          {/* Mensagens */}
          <div style={{
            flex: 1, overflowY: 'auto', padding: '12px 14px',
            display: 'flex', flexDirection: 'column', gap: 10,
          }}>
            {messages.map((msg, i) => (
              <div key={i} style={{
                display: 'flex',
                justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
              }}>
                <div style={{
                  maxWidth: '85%', padding: '8px 12px', borderRadius: 12,
                  fontSize: 12, lineHeight: 1.6,
                  background: msg.role === 'user' ? '#1a1a4a' : '#0d0d1a',
                  color:      msg.role === 'user' ? '#aaaaff' : '#ccc',
                  border:     `1px solid ${msg.role === 'user' ? '#3333aa' : '#1e1e2e'}`,
                  whiteSpace: 'pre-wrap',
                }}>
                  {msg.text}
                </div>
              </div>
            ))}
            {loading && (
              <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                <div style={{
                  padding: '8px 12px', borderRadius: 12, fontSize: 12,
                  background: '#0d0d1a', border: '1px solid #1e1e2e', color: '#555',
                }}>
                  A escrever...
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div style={{
            padding: '10px 12px', borderTop: '1px solid #1e1e2e',
            display: 'flex', gap: 8,
          }}>
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && send()}
              placeholder="Escreve uma pergunta..."
              style={{
                flex: 1, background: '#0d0d1a', border: '1px solid #2a2a40',
                borderRadius: 8, padding: '8px 12px', fontSize: 12,
                color: '#ccc', outline: 'none',
              }}
            />
            <button
              onClick={send}
              disabled={loading || !input.trim()}
              style={{
                padding: '8px 14px', borderRadius: 8, fontSize: 12,
                background: '#1a1a4a', border: '1px solid #3333aa',
                color: '#aaaaff', cursor: 'pointer', fontWeight: 600,
              }}
            >
              ➤
            </button>
          </div>
        </div>
      )}
    </>
  )
}
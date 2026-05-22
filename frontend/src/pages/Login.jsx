import { useState } from 'react'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api'

function validate(mode, form) {
  const errors = {}

  if (mode === 'register') {
    if (!form.name.trim())
      errors.name = 'Nome é obrigatório'
    else if (form.name.trim().length < 2)
      errors.name = 'Nome deve ter pelo menos 2 caracteres'
  }

  if (!form.email.trim())
    errors.email = 'Email é obrigatório'
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email))
    errors.email = 'Email inválido'

  if (!form.password)
    errors.password = 'Password é obrigatória'
  else if (form.password.length < 6)
    errors.password = 'Password deve ter pelo menos 6 caracteres'

  if (mode === 'register') {
    if (!form.confirmPassword)
      errors.confirmPassword = 'Confirma a password'
    else if (form.password !== form.confirmPassword)
      errors.confirmPassword = 'As passwords não coincidem'
  }

  return errors
}

function Field({ label, name, type = 'text', value, onChange, error, placeholder }) {
  const [show, setShow] = useState(false)
  const isPassword = type === 'password'

  return (
    <div>
      <label style={{ fontSize: 12, color: '#888', display: 'block', marginBottom: 6 }}>{label}</label>
      <div style={{ position: 'relative' }}>
        <input
          name={name}
          type={isPassword && show ? 'text' : type}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          style={{
            width: '100%', background: '#0d0d1a',
            border: `1px solid ${error ? '#f05252' : '#2a2a40'}`,
            borderRadius: 8, padding: '10px 12px',
            paddingRight: isPassword ? 40 : 12,
            fontSize: 13, color: '#ccc', outline: 'none',
            boxSizing: 'border-box',
            transition: 'border-color .2s',
          }}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setShow(s => !s)}
            style={{
              position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
              background: 'none', border: 'none', cursor: 'pointer',
              color: '#555', fontSize: 14, padding: 0,
            }}
          >
            {show ? '🙈' : '👁️'}
          </button>
        )}
      </div>
      {error && (
        <p style={{ fontSize: 11, color: '#f05252', margin: '4px 0 0' }}>⚠ {error}</p>
      )}
    </div>
  )
}

export default function Login({ onLogin }) {
  const [mode,    setMode]    = useState('login')
  const [form,    setForm]    = useState({ name: '', email: '', password: '', confirmPassword: '' })
  const [errors,  setErrors]  = useState({})
  const [apiError, setApiError] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState('')

  const handle = e => {
    const { name, value } = e.target
    setForm(p => ({ ...p, [name]: value }))
    // Limpa erro do campo ao escrever
    if (errors[name]) setErrors(p => ({ ...p, [name]: '' }))
    setApiError('')
  }

  const switchMode = (m) => {
    setMode(m)
    setErrors({})
    setApiError('')
    setSuccess('')
    setForm({ name: '', email: '', password: '', confirmPassword: '' })
  }

  const submit = async () => {
    const validationErrors = validate(mode, form)
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors)
      return
    }

    setApiError('')
    setLoading(true)

    try {
      const endpoint = mode === 'login' ? '/auth/login' : '/auth/register'
      const body     = mode === 'login'
        ? { email: form.email.trim(), password: form.password }
        : { name: form.name.trim(), email: form.email.trim(), password: form.password }

      const res  = await fetch(`${API_URL}${endpoint}`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
      })
      const data = await res.json()

      if (!data.ok) {
        setApiError(data.message)
        return
      }

      if (mode === 'register') {
        setSuccess('Conta criada com sucesso! A entrar...')
        setTimeout(() => {
          localStorage.setItem('token', data.token)
          localStorage.setItem('user',  JSON.stringify(data.user))
          onLogin(data.user, data.token)
        }, 1000)
      } else {
        localStorage.setItem('token', data.token)
        localStorage.setItem('user',  JSON.stringify(data.user))
        onLogin(data.user, data.token)
      }
    } catch {
      setApiError('Erro de ligação ao servidor. Verifica se o backend está a correr.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh', background: '#0a0a12',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: '"IBM Plex Sans", system-ui, sans-serif',
    }}>
      <div style={{
        background: '#111120', border: '1px solid #1e1e2e',
        borderRadius: 16, padding: '40px 36px', width: 400,
        boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
      }}>

        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>◈</div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#fff' }}>
            Crypto AI Trader
          </h1>
          <p style={{ margin: '8px 0 0', fontSize: 13, color: '#555' }}>
            {mode === 'login' ? 'Entra na tua conta' : 'Cria uma conta nova'}
          </p>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', marginBottom: 28, background: '#0d0d1a', borderRadius: 10, padding: 4 }}>
          {['login', 'register'].map(m => (
            <button
              key={m}
              onClick={() => switchMode(m)}
              style={{
                flex: 1, padding: '8px 0', fontSize: 13, borderRadius: 8,
                cursor: 'pointer', fontWeight: 500, transition: 'all .2s',
                background: mode === m ? '#1a1a3a' : 'transparent',
                border:     mode === m ? '1px solid #3333aa' : '1px solid transparent',
                color:      mode === m ? '#aaaaff' : '#555',
              }}
            >
              {m === 'login' ? 'Entrar' : 'Registar'}
            </button>
          ))}
        </div>

        {/* Campos */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {mode === 'register' && (
            <Field
              label="Nome completo"
              name="name"
              value={form.name}
              onChange={handle}
              error={errors.name}
              placeholder="O teu nome"
            />
          )}

          <Field
            label="Email"
            name="email"
            type="email"
            value={form.email}
            onChange={handle}
            error={errors.email}
            placeholder="email@exemplo.com"
          />

          <Field
            label="Password"
            name="password"
            type="password"
            value={form.password}
            onChange={handle}
            error={errors.password}
            placeholder="Mínimo 6 caracteres"
          />

          {mode === 'register' && (
            <Field
              label="Confirmar password"
              name="confirmPassword"
              type="password"
              value={form.confirmPassword}
              onChange={handle}
              error={errors.confirmPassword}
              placeholder="Repete a password"
            />
          )}

          {/* Erro da API */}
          {apiError && (
            <div style={{
              fontSize: 12, color: '#f05252', padding: '10px 12px',
              background: '#1a0a0a', border: '1px solid #3d1a1a',
              borderRadius: 8, textAlign: 'center',
            }}>
              ⚠ {apiError}
            </div>
          )}

          {/* Sucesso */}
          {success && (
            <div style={{
              fontSize: 12, color: '#22c97b', padding: '10px 12px',
              background: '#0a1a0d', border: '1px solid #0d4a2a',
              borderRadius: 8, textAlign: 'center',
            }}>
              ✓ {success}
            </div>
          )}

          {/* Botão submit */}
          <button
            onClick={submit}
            disabled={loading}
            onKeyDown={e => e.key === 'Enter' && submit()}
            style={{
              padding: '12px 0', marginTop: 4, borderRadius: 10,
              background: loading ? '#1a1a2a' : '#1a1a4a',
              border: `1px solid ${loading ? '#333' : '#3333aa'}`,
              color: loading ? '#555' : '#aaaaff',
              fontSize: 14, fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer',
              transition: 'all .2s',
            }}
          >
            {loading
              ? '⏳ A processar...'
              : mode === 'login' ? '→ Entrar' : '→ Criar conta'
            }
          </button>

          {/* Link para mudar de modo */}
          <p style={{ textAlign: 'center', fontSize: 12, color: '#555', margin: 0 }}>
            {mode === 'login' ? 'Não tens conta? ' : 'Já tens conta? '}
            <button
              onClick={() => switchMode(mode === 'login' ? 'register' : 'login')}
              style={{
                background: 'none', border: 'none', color: '#aaaaff',
                cursor: 'pointer', fontSize: 12, padding: 0, textDecoration: 'underline',
              }}
            >
              {mode === 'login' ? 'Regista-te' : 'Entra aqui'}
            </button>
          </p>
        </div>
      </div>
    </div>
  )
}
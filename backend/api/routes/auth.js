// api/routes/auth.js
import { Router } from 'express'
import jwt        from 'jsonwebtoken'
import { User, Wallet } from '../../core/models.js'
import 'dotenv/config'

const router = Router()
const STARTING_BALANCE = parseFloat(process.env.STARTING_BALANCE || '10000')

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const { name, email, password } = req.body

    if (!name || !email || !password)
      return res.status(400).json({ ok: false, message: 'Nome, email e password são obrigatórios' })

    if (password.length < 6)
      return res.status(400).json({ ok: false, message: 'Password deve ter pelo menos 6 caracteres' })

    const exists = await User.findOne({ email })
    if (exists)
      return res.status(400).json({ ok: false, message: 'Este email já está registado' })

    // Cria utilizador
    const user = await User.create({ name, email, password })

    // Cria wallet para o utilizador
    await Wallet.create({ userId: user._id, balanceUSDT: STARTING_BALANCE })

    // Gera token JWT
    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' })

    res.status(201).json({
      ok: true,
      token,
      user: { id: user._id, name: user.name, email: user.email },
    })
  } catch (err) {
    console.error('[Auth] Erro no registo:', err.message)
    res.status(500).json({ ok: false, message: 'Erro interno do servidor' })
  }
})

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body

    if (!email || !password)
      return res.status(400).json({ ok: false, message: 'Email e password são obrigatórios' })

    const user = await User.findOne({ email })
    if (!user)
      return res.status(401).json({ ok: false, message: 'Email ou password incorretos' })

    const valid = await user.checkPassword(password)
    if (!valid)
      return res.status(401).json({ ok: false, message: 'Email ou password incorretos' })

    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' })

    res.json({
      ok: true,
      token,
      user: { id: user._id, name: user.name, email: user.email },
    })
  } catch (err) {
    console.error('[Auth] Erro no login:', err.message)
    res.status(500).json({ ok: false, message: 'Erro interno do servidor' })
  }
})

// GET /api/auth/me — verifica token e devolve utilizador
router.get('/me', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1]
    if (!token)
      return res.status(401).json({ ok: false, message: 'Token não fornecido' })

    const decoded = jwt.verify(token, process.env.JWT_SECRET)
    const user    = await User.findById(decoded.userId).select('-password')
    if (!user)
      return res.status(401).json({ ok: false, message: 'Utilizador não encontrado' })

    res.json({ ok: true, user: { id: user._id, name: user.name, email: user.email } })
  } catch (err) {
    res.status(401).json({ ok: false, message: 'Token inválido' })
  }
})

export default router
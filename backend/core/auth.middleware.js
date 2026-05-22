// core/auth.middleware.js
import jwt  from 'jsonwebtoken'
import { User } from './models.js'
import 'dotenv/config'

export async function requireAuth(req, res, next) {
  try {
    const token = req.headers.authorization?.split(' ')[1]
    if (!token)
      return res.status(401).json({ ok: false, message: 'Não autenticado' })

    const decoded = jwt.verify(token, process.env.JWT_SECRET)
    const user    = await User.findById(decoded.userId).select('-password')
    if (!user)
      return res.status(401).json({ ok: false, message: 'Utilizador não encontrado' })

    req.user = user
    next()
  } catch {
    res.status(401).json({ ok: false, message: 'Token inválido ou expirado' })
  }
}
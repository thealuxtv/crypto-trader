import mongoose from 'mongoose'
import 'dotenv/config'

export async function connectDB() {
  try {
    await mongoose.connect(process.env.MONGODB_URI)
    console.log('[DB] MongoDB ligado com sucesso')
  } catch (err) {
    console.error('[DB] Erro ao ligar ao MongoDB:', err.message)
    process.exit(1)
  }
}
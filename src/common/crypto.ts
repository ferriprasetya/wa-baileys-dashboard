import argon2 from 'argon2'
import crypto from 'crypto'

export const hashPassword = async (password: string): Promise<string> => {
  return await argon2.hash(password)
}

export const verifyPassword = async (hash: string, plain: string): Promise<boolean> => {
  try {
    return await argon2.verify(hash, plain)
  } catch (_err) {
    return false
  }
}

export const generateApiKey = (): string => {
  // Generate 32 bytes random hex
  return crypto.randomBytes(32).toString('hex')
}

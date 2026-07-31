import { createHash } from 'crypto'
import bcrypt from 'bcryptjs'

const MIN_PASSWORD_LENGTH = 6
const BCRYPT_ROUNDS = 10

/** 密码哈希（bcrypt，随机盐内嵌于结果） */
export async function hashPassword(plain: string, rounds = BCRYPT_ROUNDS): Promise<string> {
  if (plain.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`password must be at least ${MIN_PASSWORD_LENGTH} characters`)
  }
  return bcrypt.hash(plain, rounds)
}

/** 密码验证 */
export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash)
}

/** SHA-256 十六进制摘要（token 哈希等场景） */
export function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex')
}

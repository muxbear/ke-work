import jwt from 'jsonwebtoken'
import type { WorkMode } from '../mode/work-mode'

export interface TokenPayload {
  sub: string
  mode: WorkMode
}

export interface SignOptions {
  expiresInSec: number
}

/** 签发 JWT */
export function signToken(payload: TokenPayload, secret: string, options: SignOptions): string {
  return jwt.sign({ ...payload, type: 'access' }, secret, {
    expiresIn: options.expiresInSec
  })
}

/** 验证 JWT 并返回载荷；无效/过期/篡改时抛错 */
export function verifyToken(token: string, secret: string): TokenPayload {
  const decoded = jwt.verify(token, secret) as jwt.JwtPayload & TokenPayload
  return { sub: decoded.sub, mode: decoded.mode }
}

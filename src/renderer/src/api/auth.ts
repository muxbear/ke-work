import request from '../util/request'

export interface AuthResponse {
  token: string
  user: {
    id: string
    name: string
    mobile: string
  }
}

const useMock = import.meta.env.VITE_USE_MOCK === 'true' || import.meta.env.DEV

const mockUser = {
  id: '1',
  name: 'wangke',
  mobile: '15091545831'
}

export const sendSmsCode = async (mobile: string) => {
  if (useMock) {
    return Promise.resolve({ success: true })
  }
  return request.post('/auth/send-code', { mobile })
}

export const loginBySms = async (mobile: string, code: string): Promise<AuthResponse> => {
  if (useMock) {
    if (code === '123456') {
      return Promise.resolve({ token: 'mock-token-sms', user: mockUser })
    }
    return Promise.reject(new Error('验证码错误'))
  }

  const response = await request.post<AuthResponse>('/auth/login-sms', { mobile, code })
  return response.data
}

export const loginByPassword = async (account: string, password: string): Promise<AuthResponse> => {
  if (useMock) {
    const matches = (account === 'wangke' || account === mockUser.mobile) && password === '83Muxu%!'
    if (matches) {
      return Promise.resolve({ token: 'mock-token-pwd', user: mockUser })
    }
    return Promise.reject(new Error('用户名或密码错误'))
  }

  const response = await request.post<AuthResponse>('/auth/login-password', { account, password })
  return response.data
}

export const exchangeWechatCode = async (code: string): Promise<AuthResponse> => {
  if (useMock) {
    // accept any non-empty code in mock
    if (code) {
      return Promise.resolve({ token: 'mock-token-wechat', user: mockUser })
    }
    return Promise.reject(new Error('微信授权失败'))
  }

  const response = await request.post<AuthResponse>('/auth/login-wechat', { code })
  return response.data
}

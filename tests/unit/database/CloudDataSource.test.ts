import { beforeEach, describe, expect, it } from 'vitest'
import MockAdapter from 'axios-mock-adapter'
import { CloudDataSource, CloudApiError } from '../../../src/main/database/cloud/CloudDataSource'

describe('CloudDataSource', () => {
  let ds: CloudDataSource
  let mock: MockAdapter

  beforeEach(() => {
    ds = new CloudDataSource({ baseUrl: 'https://api.example.com' })
    mock = new MockAdapter(ds['client'])
  })

  it('CLD-01: 请求带 Authorization Bearer token', async () => {
    ds.setTokenStore({ getAccessToken: () => 'tok-123' })
    mock.onGet('/api/test').reply((config) => {
      expect(config.headers?.Authorization).toBe('Bearer tok-123')
      return [200, { code: 0, data: 'ok' }]
    })
    await expect(ds.get('/api/test')).resolves.toBe('ok')
  })

  it('无 token 时不带 Authorization', async () => {
    ds.setTokenStore({ getAccessToken: () => null })
    mock.onGet('/api/test').reply((config) => {
      expect(config.headers?.Authorization).toBeUndefined()
      return [200, { code: 0, data: 'ok' }]
    })
    await expect(ds.get('/api/test')).resolves.toBe('ok')
  })

  it('CLD-05: 解包 {code:0, data} 响应', async () => {
    mock.onGet('/api/test').reply(200, { code: 0, data: { id: 1 } })
    expect(await ds.get('/api/test')).toEqual({ id: 1 })
  })

  it('非 0 code 抛 CloudApiError', async () => {
    mock.onPost('/api/auth/login-password').reply(200, { code: 1001, message: '账号或密码错误' })
    await expect(ds.post('/api/auth/login-password', {})).rejects.toThrow(/账号或密码错误/)
  })

  it('CLD-06: 网络错误归一化为 CloudApiError', async () => {
    mock.onGet('/api/test').networkError()
    await expect(ds.get('/api/test')).rejects.toThrow(/网络/)
  })

  it('HTTP 401 抛未授权错误（不自动刷新时）', async () => {
    mock.onGet('/api/test').reply(401, { code: 401, message: 'unauthorized' })
    await expect(ds.get('/api/test')).rejects.toBeInstanceOf(CloudApiError)
  })
})

describe('CloudDataSource 401 刷新重试', () => {
  let ds: CloudDataSource
  let mock: MockAdapter
  let refreshCalls: number

  beforeEach(() => {
    ds = new CloudDataSource({ baseUrl: 'https://api.example.com' })
    mock = new MockAdapter(ds['client'])
    refreshCalls = 0
    let token: string | null = 'old-token'
    ds.setTokenStore({ getAccessToken: () => token })
    ds.setUnauthorizedHandler(async () => {
      refreshCalls++
      token = 'new-token'
      return true
    })
  })

  it('CLD-03: 401 后自动刷新 token 并重试成功', async () => {
    let first = true
    mock.onGet('/api/data').reply(() => {
      if (first) {
        first = false
        return [401, { code: 401, message: 'expired' }]
      }
      return [200, { code: 0, data: 'retried' }]
    })
    expect(await ds.get('/api/data')).toBe('retried')
    expect(refreshCalls).toBe(1)
  })

  it('CLD-04: 刷新失败抛会话过期错误', async () => {
    ds.setUnauthorizedHandler(async () => false)
    mock.onGet('/api/data').reply(401, { code: 401, message: 'expired' })
    await expect(ds.get('/api/data')).rejects.toThrow(/登录已过期|未授权/)
  })

  it('并发请求共享同一次刷新（单飞）', async () => {
    mock.onGet('/api/data').reply(() => [401, { code: 401 }])
    mock.onGet('/api/data2').reply(() => [401, { code: 401 }])
    await Promise.allSettled([ds.get('/api/data'), ds.get('/api/data2')])
    expect(refreshCalls).toBe(1)
  })
})

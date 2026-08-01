import { beforeEach, describe, expect, it } from 'vitest'
import MockAdapter from 'axios-mock-adapter'
import { CloudDataSource } from '../../../src/main/database/cloud/CloudDataSource'
import { CloudAuthRepository } from '../../../src/main/database/cloud/CloudAuthRepository'
import { CloudConfigRepository } from '../../../src/main/database/cloud/CloudConfigRepository'

function setup(): { ds: CloudDataSource; mock: MockAdapter } {
  const ds = new CloudDataSource({ baseUrl: 'https://api.example.com' })
  ds.setTokenStore({ getAccessToken: () => 'tok' })
  const mock = new MockAdapter(ds['client'])
  return { ds, mock }
}

describe('CloudAuthRepository', () => {
  let ds: CloudDataSource
  let mock: MockAdapter
  let repo: CloudAuthRepository

  beforeEach(() => {
    ;({ ds, mock } = setup())
    repo = new CloudAuthRepository(ds)
  })

  it('AUTH-03: 密码登录成功解析 token+user', async () => {
    mock.onPost('/api/auth/login-password').reply(200, {
      code: 0,
      data: {
        token: 't1',
        refreshToken: 'r1',
        user: { id: 'u1', username: 'wangke', mobile: '138' }
      }
    })
    const result = await repo.loginByPassword('wangke', 'Secret123!')
    expect(result.token).toBe('t1')
    expect(result.user.username).toBe('wangke')
  })

  it('AUTH-04: 云端 401 抛业务错误', async () => {
    mock.onPost('/api/auth/login-password').reply(401, { code: 401, message: '账号或密码错误' })
    await expect(repo.loginByPassword('wangke', 'wrong')).rejects.toThrow('账号或密码错误')
  })

  it('AUTH-08: 微信 code 交换', async () => {
    mock.onPost('/api/auth/login-wechat').reply(200, {
      code: 0,
      data: { token: 't', refreshToken: 'r', user: { id: 'u', username: 'wx', mobile: undefined } }
    })
    const result = await repo.loginByWechat('code-abc')
    expect(result.user.id).toBe('u')
  })

  it('refreshToken 调用 /api/auth/refresh', async () => {
    mock
      .onPost('/api/auth/refresh')
      .reply(200, { code: 0, data: { token: 't2', refreshToken: 'r2' } })
    const result = await repo.refreshToken('r-old')
    expect(result.token).toBe('t2')
  })

  it('云端不维护本地锁定/计数（no-op 适配）', async () => {
    const user = await repo.createUser({ username: 'x', passwordHash: 'h' }).catch(() => null)
    expect(user).toBeNull()
    await repo.recordLoginFailure('u1', 5, 900_000, Date.now())
    await repo.resetLoginFailures('u1')
    await repo.updateToken('u1', 'h', 1)
    // 以上不抛错即为通过（服务端管理这些状态）
  })
})

describe('CloudConfigRepository', () => {
  let ds: CloudDataSource
  let mock: MockAdapter
  let repo: CloudConfigRepository

  beforeEach(() => {
    ;({ ds, mock } = setup())
    repo = new CloudConfigRepository(ds)
  })

  it('get 返回配置值', async () => {
    mock.onGet('/api/config/k1').reply(200, { code: 0, data: 'v1' })
    expect(await repo.get('k1')).toBe('v1')
  })

  it('set 调 PUT 接口', async () => {
    mock.onPut('/api/config/k1').reply(200, { code: 0, data: null })
    await expect(repo.set('k1', 'v1')).resolves.toBeUndefined()
  })
})

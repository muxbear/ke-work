import { beforeEach, describe, expect, it, vi } from 'vitest'

const { initChatModelMock } = vi.hoisted(() => ({ initChatModelMock: vi.fn() }))

vi.mock('langchain', async (importOriginal) => {
  const actual = await importOriginal<typeof import('langchain')>()
  return { ...actual, initChatModel: initChatModelMock }
})

import { createModelOverrideMiddleware } from '../../../src/main/agent/ModelOverrideMiddleware'
import type { ModelService } from '../../../src/main/model/ModelService'

interface Credential {
  id: string
  name: string
  apiKey: string
  url: string
}

/** 假 ModelService：getCredential 按 id 返回（不存在返回 null） */
function createFakeModelService(credential: Credential | null): ModelService {
  return {
    getCredential: (id: string) => (credential && credential.id === id ? credential : null)
  } as unknown as ModelService
}

function makeRequest(configurable?: Record<string, unknown>): Record<string, unknown> {
  return { model: 'default-model', runtime: configurable ? { configurable } : undefined }
}

/** 提取 wrapModelCall 钩子（AgentMiddleware 上可选，测试直调） */
function getWrap(mw: ReturnType<typeof createModelOverrideMiddleware>) {
  return mw.wrapModelCall as unknown as (
    request: Record<string, unknown>,
    handler: (request: Record<string, unknown>) => Promise<unknown>
  ) => Promise<unknown>
}

describe('ModelOverrideMiddleware（运行期模型覆盖）', () => {
  beforeEach(() => {
    initChatModelMock.mockClear()
  })

  it('MO-01: 无 model_override 时原参转发，不调 initChatModel', async () => {
    const wrap = getWrap(createModelOverrideMiddleware(createFakeModelService(null)))
    const request = makeRequest()
    const handler = vi.fn().mockResolvedValue('ok')
    const result = await wrap(request, handler)
    expect(handler).toHaveBeenCalledWith(request)
    expect(initChatModelMock).not.toHaveBeenCalled()
    expect(result).toBe('ok')
  })

  it('MO-02: model_override 非字符串时原参转发', async () => {
    const wrap = getWrap(createModelOverrideMiddleware(createFakeModelService(null)))
    const request = makeRequest({ model_override: 42 })
    const handler = vi.fn().mockResolvedValue('ok')
    await wrap(request, handler)
    expect(handler).toHaveBeenCalledWith(request)
    expect(initChatModelMock).not.toHaveBeenCalled()
  })

  it('MO-03: 有 model_override 且记录存在 → initChatModel 以 (id, 凭据) 构造并替换 model', async () => {
    const credential = {
      id: 'gpt-4o',
      name: 'gpt-4o',
      apiKey: 'sk-secret',
      url: 'https://api.example.com/v1/chat/completions'
    }
    const wrap = getWrap(createModelOverrideMiddleware(createFakeModelService(credential)))
    initChatModelMock.mockResolvedValue('configurable-model')
    const request = makeRequest({ model_override: 'gpt-4o' })
    const handler = vi.fn().mockResolvedValue('ok')
    await wrap(request, handler)

    expect(initChatModelMock).toHaveBeenCalledWith('gpt-4o', {
      modelProvider: 'openai',
      apiKey: 'sk-secret',
      configuration: { baseURL: 'https://api.example.com/v1' }
    })
    expect(handler).toHaveBeenCalledWith({ ...request, model: 'configurable-model' })
  })

  it('MO-04: 端点去 /chat/completions 前缀得到 baseURL', async () => {
    const credential = {
      id: 'm1',
      name: 'm1',
      apiKey: 'sk',
      url: 'https://x.com/chat/completions'
    }
    const wrap = getWrap(createModelOverrideMiddleware(createFakeModelService(credential)))
    initChatModelMock.mockResolvedValue('model')
    await wrap(makeRequest({ model_override: 'm1' }), vi.fn().mockResolvedValue('ok'))
    expect(initChatModelMock.mock.calls[0][1].configuration.baseURL).toBe('https://x.com')
  })

  it('MO-05: 记录不存在（已删除/伪造 id）→ 原参转发回退默认模型', async () => {
    const wrap = getWrap(createModelOverrideMiddleware(createFakeModelService(null)))
    const request = makeRequest({ model_override: 'deleted-model' })
    const handler = vi.fn().mockResolvedValue('ok')
    await wrap(request, handler)
    expect(handler).toHaveBeenCalledWith(request)
    expect(initChatModelMock).not.toHaveBeenCalled()
  })

  it('MO-06: 中间件名为 modelOverrideMiddleware（AgentManager 断言复用）', () => {
    const mw = createModelOverrideMiddleware(createFakeModelService(null))
    expect(mw.name).toBe('modelOverrideMiddleware')
    expect(typeof mw.wrapModelCall).toBe('function')
  })
})

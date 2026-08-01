import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

// mock deepagents：捕获 createDeepAgent 的配置参数
const createDeepAgentMock = vi.fn()
vi.mock('deepagents', () => ({
  createDeepAgent: (config: unknown) => {
    createDeepAgentMock(config)
    return { id: 'mock-agent' }
  },
  FilesystemBackend: class {
    constructor(public opts: unknown) {}
  },
  StoreBackend: class {
    constructor(public opts: unknown) {}
  }
}))

// mock checkpoint 包
vi.mock('@langchain/langgraph-checkpoint-sqlite', () => ({
  SqliteSaver: class {
    static fromConnString(path: string) {
      return { kind: 'SqliteSaver', path }
    }
  }
}))
vi.mock('@langchain/langgraph-checkpoint-postgres', () => ({
  PostgresSaver: class {
    static fromConnString(conn: string) {
      return { kind: 'PostgresSaver', conn }
    }
  }
}))
vi.mock('@langchain/langgraph-checkpoint-postgres/store', () => ({
  PostgresStore: class {
    static fromConnString(conn: string) {
      return { kind: 'PostgresStore', conn, setup: async () => {} }
    }
    async setup() {}
  }
}))
vi.mock('@langchain/langgraph', () => ({
  InMemoryStore: class {
    constructor() {
      return { kind: 'InMemoryStore' }
    }
  }
}))

import { createAgentBuilder } from '../../../src/main/agent/AgentBuilder'

describe('AgentBuilder', () => {
  let workDir: string

  beforeEach(() => {
    workDir = mkdtempSync(join(tmpdir(), 'kw-agent-'))
    createDeepAgentMock.mockClear()
  })

  it('AG-01: local 默认配置（FilesystemBackend + SqliteSaver）', async () => {
    await createAgentBuilder('local', workDir, join(workDir, 'checkpoints.sqlite'))
      .setModel('deepseek:deepseek-v4-pro')
      .build()
    const config = createDeepAgentMock.mock.calls[0][0] as Record<string, never>
    expect((config.backend as { opts: { rootDir: string } }).opts.rootDir).toBe(workDir)
    expect((config.checkpointer as { kind: string }).kind).toBe('SqliteSaver')
  })

  it('AG-06: local checkpointer 路径为数据库文件而非工作目录', async () => {
    await createAgentBuilder('local', workDir, join(workDir, 'checkpoints.sqlite')).setModel('m').build()
    const checkpointer = (createDeepAgentMock.mock.calls[0][0] as {
      checkpointer: { kind: string; path: string }
    }).checkpointer
    expect(checkpointer.kind).toBe('SqliteSaver')
    expect(checkpointer.path).not.toBe(workDir) // 回归：目录路径会导致 SQLITE_CANTOPEN_ISDIR
    expect(checkpointer.path.endsWith('.sqlite')).toBe(true)
  })

  it('AG-02: cloud 默认配置（PostgresSaver + PostgresStore）', async () => {
    process.env.CLOUD_POSTGRES_CONN_STRING = 'postgres://mock'
    await createAgentBuilder('cloud', workDir, join(workDir, 'checkpoints.sqlite'))
      .setModel('deepseek:deepseek-v4-pro')
      .build()
    const config = createDeepAgentMock.mock.calls[0][0] as Record<string, never>
    expect((config.checkpointer as { kind: string }).kind).toBe('PostgresSaver')
    expect((config.store as { kind: string }).kind).toBe('PostgresStore')
    delete process.env.CLOUD_POSTGRES_CONN_STRING
  })

  it('AG-03: 链式覆盖自定义 backend', async () => {
    const customBackend = { kind: 'custom' }
    await createAgentBuilder('local', workDir, join(workDir, 'checkpoints.sqlite')).setModel('m').setBackend(customBackend).build()
    const config = createDeepAgentMock.mock.calls[0][0] as { backend: unknown }
    expect(config.backend).toBe(customBackend)
  })

  it('AG-04: 未设置模型时 build 不注入 model', async () => {
    const builder = await createAgentBuilder('local', workDir, join(workDir, 'checkpoints.sqlite'))
    await builder.build()
    expect((createDeepAgentMock.mock.calls[0][0] as { model?: string }).model).toBeUndefined()
  })

  it('AG-05: setMode 保留自定义项，重载默认 backend/记忆', async () => {
    const builder = await createAgentBuilder('local', workDir, join(workDir, 'checkpoints.sqlite'))
    builder.setModel('m1').setSkills(['/skills/'])
    await builder.setMode('cloud').withModeDefaults()
    await builder.build()
    const config = createDeepAgentMock.mock.calls[0][0] as Record<string, never>
    expect(config.model).toBe('m1') // 自定义保留
    expect(config.skills).toEqual(['/skills/']) // 自定义保留
    expect((config.checkpointer as { kind: string }).kind).toBe('PostgresSaver') // 模式默认更新
  })
})

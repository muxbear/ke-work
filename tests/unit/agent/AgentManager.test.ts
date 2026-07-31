import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

const createDeepAgentMock = vi.fn()
vi.mock('deepagents', () => ({
  createDeepAgent: (config: unknown) => {
    createDeepAgentMock(config)
    return { id: 'mock-agent', dispose: vi.fn().mockResolvedValue(undefined) }
  },
  FilesystemBackend: class {
    constructor(public opts: unknown) {}
  },
  StoreBackend: class {
    constructor(public opts: unknown) {}
  }
}))
vi.mock('@langchain/langgraph-checkpoint-sqlite', () => ({
  SqliteSaver: class {
    static fromConnString(path: string) {
      return { kind: 'SqliteSaver', path }
    }
  }
}))
vi.mock('@langchain/langgraph-checkpoint-postgres', () => ({
  PostgresSaver: class {
    static fromConnString() {
      return { kind: 'PostgresSaver' }
    }
  }
}))
vi.mock('@langchain/langgraph-checkpoint-postgres/store', () => ({
  PostgresStore: class {
    static fromConnString() {
      return { kind: 'PostgresStore', setup: async () => {} }
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

import { AgentManager } from '../../../src/main/agent/AgentManager'

describe('AgentManager', () => {
  let workDir: string
  let manager: AgentManager

  beforeEach(() => {
    workDir = mkdtempSync(join(tmpdir(), 'kw-am-'))
    createDeepAgentMock.mockClear()
    manager = new AgentManager(workDir)
  })

  it('AG-06a: init 后 getAgent 返回实例', async () => {
    await manager.init('local')
    expect(manager.getAgent()).not.toBeNull()
  })

  it('AG-06b: 模式切换重建 agent，保留自定义配置', async () => {
    await manager.init('local')
    const first = manager.getAgent()
    manager.setModel('deepseek:deepseek-v4-pro').setSkills(['/skills/'])
    await manager.switchMode('cloud')
    const second = manager.getAgent()
    expect(second).not.toBe(first)
    const config = createDeepAgentMock.mock.calls[1][0] as Record<string, never>
    expect(config.model).toBe('deepseek:deepseek-v4-pro')
    expect((config.checkpointer as { kind: string }).kind).toBe('PostgresSaver')
  })

  it('AG-07: 未 init 时 switchMode 抛错', async () => {
    await expect(manager.switchMode('cloud')).rejects.toThrow(/not initialized/i)
  })
})

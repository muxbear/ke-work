import { mkdtempSync, readFileSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { beforeEach, describe, expect, it } from 'vitest'
import { ModelService } from '../../../src/main/model/ModelService'
import { SEED_PROVIDERS } from '../../../src/main/model/types'

function createBaseDir(): string {
  return mkdtempSync(join(tmpdir(), 'kw-model-'))
}

function validInput(overrides: Record<string, string> = {}): {
  id: string
  name: string
  vendor: string
  url: string
  apiKey: string
} {
  return {
    id: 'deepseek-chat',
    name: 'DeepSeek Chat',
    vendor: 'DeepSeek',
    url: 'https://api.deepseek.com/chat/completions',
    apiKey: 'sk-test',
    ...overrides
  }
}

describe('ModelService', () => {
  let baseDir: string
  let service: ModelService

  beforeEach(() => {
    baseDir = createBaseDir()
    service = new ModelService(baseDir)
  })

  it('MS-01: add → list 往返含全部字段', () => {
    const record = service.add(validInput())
    const list = service.list()
    expect(list).toHaveLength(1)
    expect(list[0]).toEqual({
      id: 'deepseek-chat',
      name: 'DeepSeek Chat',
      vendor: 'DeepSeek',
      url: 'https://api.deepseek.com/chat/completions',
      apiKey: 'sk-test',
      supportsToolCall: true,
      supportsImages: false,
      supportsReasoning: false
    })
    expect(record.id).toBe('deepseek-chat')
  })

  it('MS-02: 落盘为合并结构 { version, providers, models }，apiKey 明文', () => {
    service.add(validInput())
    const raw = JSON.parse(readFileSync(join(baseDir, 'models.json'), 'utf-8'))
    expect(raw.version).toBe(1)
    expect(Array.isArray(raw.providers)).toBe(true)
    expect(raw.providers).toHaveLength(SEED_PROVIDERS.length)
    expect(Array.isArray(raw.models)).toBe(true)
    expect(raw.models).toHaveLength(1)
    expect(raw.models[0].apiKey).toBe('sk-test')
    expect(raw.models[0].supportsToolCall).toBe(true)
  })

  it('MS-03: 新实例重建后数据仍在（持久化）', () => {
    service.add(validInput())
    const reloaded = new ModelService(baseDir)
    expect(reloaded.list()).toHaveLength(1)
    expect(reloaded.list()[0].id).toBe('deepseek-chat')
    // getCredential 返回调用凭据
    expect(reloaded.getCredential('deepseek-chat')).toEqual({
      id: 'deepseek-chat',
      name: 'DeepSeek Chat',
      apiKey: 'sk-test',
      url: 'https://api.deepseek.com/chat/completions'
    })
  })

  it('MS-03b: 旧版顶层数组格式兼容（视为 models，providers 用种子）且加载即迁移落盘', () => {
    const legacy = JSON.stringify(
      [{ ...validInput(), supportsToolCall: true, supportsImages: false, supportsReasoning: false }],
      null,
      2
    )
    writeFileSync(join(baseDir, 'models.json'), legacy, 'utf-8')
    const reloaded = new ModelService(baseDir)
    expect(reloaded.list()).toHaveLength(1)
    expect(reloaded.list()[0].id).toBe('deepseek-chat')
    expect(reloaded.listProviders()).toHaveLength(SEED_PROVIDERS.length)
    // 加载即迁移：磁盘已为合并结构（含 providers 种子）
    const raw = JSON.parse(readFileSync(join(baseDir, 'models.json'), 'utf-8'))
    expect(raw.version).toBe(1)
    expect(raw.providers).toHaveLength(SEED_PROVIDERS.length)
    expect(raw.models).toHaveLength(1)
    expect(raw.models[0].id).toBe('deepseek-chat')
  })

  it('MS-04: getCredential 对不存在/未知 id 返回 null', () => {
    expect(service.getCredential('nope')).toBeNull()
  })

  it('MS-05: 损坏 models.json 从 .bak 恢复', () => {
    service.add(validInput())
    // 伪造 .bak（模拟上一次成功备份；须为合并结构且含全部必填字段）
    const bak = JSON.stringify(
      {
        version: 1,
        providers: SEED_PROVIDERS,
        models: [
          {
            ...validInput(),
            id: 'from-bak',
            supportsToolCall: true,
            supportsImages: false,
            supportsReasoning: false
          }
        ]
      },
      null,
      2
    )
    writeFileSync(join(baseDir, 'models.json.bak'), bak, 'utf-8')
    writeFileSync(join(baseDir, 'models.json'), 'not-json{{{', 'utf-8')
    const reloaded = new ModelService(baseDir)
    expect(reloaded.list()).toHaveLength(1)
    expect(reloaded.list()[0].id).toBe('from-bak')
  })

  it('MS-06: 损坏 models.json 且无 .bak 时回退空数组 + 种子提供商', () => {
    writeFileSync(join(baseDir, 'models.json'), 'not-json{{{', 'utf-8')
    const reloaded = new ModelService(baseDir)
    expect(reloaded.list()).toEqual([])
    expect(reloaded.listProviders()).toHaveLength(SEED_PROVIDERS.length)
  })

  it('MS-07: 缺失文件时提供商用内置种子（9 家含 其它）且立即落盘可见', () => {
    expect(service.listProviders()).toHaveLength(SEED_PROVIDERS.length)
    const names = service.listProviders().map((p) => p.name)
    expect(names).toContain('深度求索')
    expect(names).toContain('智谱')
    expect(names).toContain('月之暗面')
    expect(names).toContain('MiniMax')
    expect(names).toContain('小米')
    expect(names).toContain('阿里')
    expect(names).toContain('腾讯')
    expect(names).toContain('字节')
    expect(names).toContain('其它')
    // 中文名 + 英文名 + LOGO + 各家模型列表
    const deepseek = service.listProviders().find((p) => p.id === 'deepseek')!
    expect(deepseek.nameEn).toBe('DeepSeek')
    expect(deepseek.logo).toBe('deepseek')
    expect(deepseek.models).toContain('deepseek-chat')
    // 其它提供商无预设模型（自由输入）
    expect(service.listProviders().find((p) => p.id === 'custom')!.models).toEqual([])
    // 构造后文件即存在且含 providers 种子（磁盘文件即配置源，打开可见）
    const raw = JSON.parse(readFileSync(join(baseDir, 'models.json'), 'utf-8'))
    expect(raw.version).toBe(1)
    expect(raw.providers).toHaveLength(SEED_PROVIDERS.length)
    expect(raw.models).toEqual([])
  })

  it('MS-07c: 文件存在但 providers 缺失/为空 → 补种子并落盘', () => {
    writeFileSync(
      join(baseDir, 'models.json'),
      JSON.stringify({ version: 1, models: [] }),
      'utf-8'
    )
    const reloaded = new ModelService(baseDir)
    expect(reloaded.listProviders()).toHaveLength(SEED_PROVIDERS.length)
    const raw = JSON.parse(readFileSync(join(baseDir, 'models.json'), 'utf-8'))
    expect(raw.providers).toHaveLength(SEED_PROVIDERS.length)
  })

  it('MS-07d: 旧种子文件（无 models 字段）→ 各提供商模型数据自动补齐并落盘初始化', () => {
    // 模拟旧版本落盘的 providers（无 models 字段），models 空数组
    const legacyProviders = SEED_PROVIDERS.map(({ models: _m, ...rest }) => rest)
    writeFileSync(
      join(baseDir, 'models.json'),
      JSON.stringify({ version: 1, providers: legacyProviders, models: [] }),
      'utf-8'
    )
    const reloaded = new ModelService(baseDir)
    // 每家提供商 models 已初始化（与种子一致）
    for (const seed of SEED_PROVIDERS) {
      const p = reloaded.listProviders().find((x) => x.id === seed.id)!
      expect(p.models).toEqual(seed.models)
    }
    // 已落盘（磁盘文件即初始化后的数据源）
    const raw = JSON.parse(readFileSync(join(baseDir, 'models.json'), 'utf-8'))
    const deepseek = raw.providers.find((p: { id: string }) => p.id === 'deepseek')
    expect(deepseek.models).toContain('deepseek-chat')
    expect(deepseek.models.length).toBeGreaterThan(1)
  })

  it('MS-07e: 旧种子文件已手改 models（非空）→ 保留用户值不被覆盖', () => {
    const legacyProviders = SEED_PROVIDERS.map((p) => ({ ...p, models: p.id === 'deepseek' ? ['my-model'] : [] }))
    writeFileSync(
      join(baseDir, 'models.json'),
      JSON.stringify({ version: 1, providers: legacyProviders, models: [] }),
      'utf-8'
    )
    const reloaded = new ModelService(baseDir)
    expect(reloaded.listProviders().find((p) => p.id === 'deepseek')!.models).toEqual(['my-model'])
  })

  it('MS-07f: 手改过提供商（增删，id 集合不同）→ 完全以文件值为准，不补种子', () => {
    writeFileSync(
      join(baseDir, 'models.json'),
      JSON.stringify({
        version: 1,
        providers: [{ id: 'my-provider', name: '我的服务商', defaultUrl: 'https://my.dev/v1', plans: [{ type: 'Token Plan' }] }],
        models: []
      }),
      'utf-8'
    )
    const reloaded = new ModelService(baseDir)
    expect(reloaded.listProviders()).toHaveLength(1)
    expect(reloaded.listProviders()[0].models).toEqual([])
  })

  it('MS-07b: 文件内自定义 providers 优先于种子（用户手改生效）；缺 logo/models 回填默认', () => {
    writeFileSync(
      join(baseDir, 'models.json'),
      JSON.stringify({
        version: 1,
        providers: [{ id: 'my-provider', name: '我的服务商', defaultUrl: 'https://my.dev/v1', plans: [{ type: 'Token Plan' }] }],
        models: []
      }),
      'utf-8'
    )
    const reloaded = new ModelService(baseDir)
    expect(reloaded.listProviders()).toHaveLength(1)
    expect(reloaded.listProviders()[0].name).toBe('我的服务商')
    // 旧文件无 logo/models 字段 → 回填默认（logo=id、models 空）
    expect(reloaded.listProviders()[0].logo).toBe('my-provider')
    expect(reloaded.listProviders()[0].models).toEqual([])
  })

  it('MS-08: 同 id 模型拒绝添加', () => {
    service.add(validInput())
    expect(() => service.add(validInput())).toThrow(/已存在同名模型/)
  })

  it('MS-09: 入参校验（空白 id / 非法 url / 空 apiKey / 空 vendor）', () => {
    expect(() => service.add(validInput({ id: '  ' }))).toThrow(/模型标识/)
    expect(() => service.add(validInput({ url: 'ftp://x' }))).toThrow(/http/)
    expect(() => service.add(validInput({ apiKey: '  ' }))).toThrow(/API Key/)
    expect(() => service.add(validInput({ vendor: '' }))).toThrow(/提供商/)
    expect(() => service.add(validInput({ name: '  ' }))).toThrow(/模型名称/)
  })

  it('MS-10: remove 幂等', () => {
    service.add(validInput())
    service.remove('deepseek-chat')
    expect(service.list()).toEqual([])
    // 再次移除不报错
    expect(() => service.remove('deepseek-chat')).not.toThrow()
  })

  it('MS-11: remove 落盘持久化', () => {
    service.add(validInput())
    service.remove('deepseek-chat')
    const reloaded = new ModelService(baseDir)
    expect(reloaded.list()).toEqual([])
  })

  it('MS-12: add 的 id 去空白并 trim', () => {
    service.add(validInput({ id: '  gpt-4o  ', name: '  gpt-4o  ' }))
    const record = service.list()[0]
    expect(record.id).toBe('gpt-4o')
    expect(record.name).toBe('gpt-4o')
  })

  it('MS-13: update 修改字段并持久化（id 不变，其余可改）', () => {
    service.add(validInput())
    const updated = service.update('deepseek-chat', validInput({ name: '改名', url: 'https://new.dev/v1', apiKey: 'sk-new' }))
    expect(updated.name).toBe('改名')
    expect(updated.url).toBe('https://new.dev/v1')
    expect(updated.apiKey).toBe('sk-new')
    expect(updated.id).toBe('deepseek-chat')
    // 能力字段保留
    expect(updated.supportsToolCall).toBe(true)
    // 持久化
    const reloaded = new ModelService(baseDir)
    expect(reloaded.list()[0].name).toBe('改名')
    // getCredential 反映新凭据
    expect(reloaded.getCredential('deepseek-chat')?.apiKey).toBe('sk-new')
  })

  it('MS-13b: update 改名即改 id（全局唯一性校验，排除自身）', () => {
    service.add(validInput())
    service.add(validInput({ id: 'gpt-4o', name: 'gpt-4o' }))
    // 改名为不冲突的新 id → 生效，旧 id 不再可查
    const updated = service.update('deepseek-chat', validInput({ id: 'deepseek-v4', name: 'DeepSeek V4' }))
    expect(updated.id).toBe('deepseek-v4')
    expect(updated.name).toBe('DeepSeek V4')
    expect(service.getCredential('deepseek-chat')).toBeNull()
    expect(service.getCredential('deepseek-v4')?.name).toBe('DeepSeek V4')
    // 持久化后新 id 可查
    const reloaded = new ModelService(baseDir)
    expect(reloaded.getCredential('deepseek-v4')).not.toBeNull()
    // 改为与其他模型冲突的 id → 拒绝且原记录不变
    expect(() => service.update('deepseek-v4', validInput({ id: 'gpt-4o' }))).toThrow(/已存在同名模型/)
    expect(service.getCredential('deepseek-v4')).not.toBeNull()
  })

  it('MS-14: update 不存在/非法入参抛错且不改动原记录', () => {
    service.add(validInput())
    expect(() => service.update('nope', validInput())).toThrow(/模型不存在/)
    expect(() => service.update('deepseek-chat', validInput({ apiKey: '' }))).toThrow(/API Key/)
    expect(() => service.update('deepseek-chat', validInput({ id: '  ' }))).toThrow(/模型标识/)
    expect(service.list()[0].apiKey).toBe('sk-test')
    expect(service.list()[0].id).toBe('deepseek-chat')
  })
})

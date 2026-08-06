/**
 * 单元测试：catalog store（「+」菜单数据与状态）
 * - 模式 radio 互斥
 * - 专家单选 + 最近使用（去重 / 置顶 / 上限 5）
 * - 技能多选切换（不持久化，随输入框会话状态）
 * - localStorage 持久化 round-trip 与坏数据回退
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useCatalogStore, experts, skillItems } from '../../src/renderer/src/store/catalog'

const STORAGE_KEY = 'ke-work:task-selection'

/** node 环境下 localStorage stub（store 内部有 typeof 守卫，无 stub 也能跑，持久化断言需 stub） */
const storage = new Map<string, string>()
vi.stubGlobal('localStorage', {
  getItem: (k: string): string | null => storage.get(k) ?? null,
  setItem: (k: string, v: string): void => {
    storage.set(k, v)
  },
  removeItem: (k: string): void => {
    storage.delete(k)
  },
  clear: (): void => {
    storage.clear()
  }
})

beforeEach(() => {
  storage.clear()
  setActivePinia(createPinia())
})

describe('catalog store: 模式 radio 互斥', () => {
  it('默认模式 default', () => {
    const store = useCatalogStore()
    expect(store.mode).toBe('default')
  })

  it('开启一个自动关闭其余；点当前项无操作', () => {
    const store = useCatalogStore()
    store.setMode('local')
    expect(store.mode).toBe('local')
    store.setMode('knowledge')
    expect(store.mode).toBe('knowledge')
    // 点当前已开启项：保持不变（不允许全关）
    store.setMode('knowledge')
    expect(store.mode).toBe('knowledge')
  })
})

describe('catalog store: 专家单选与最近使用', () => {
  it('选中专家生成提示词并记入最近使用', () => {
    const store = useCatalogStore()
    store.setExpert(1)
    expect(store.selectedExpertId).toBe(1)
    expect(store.selectedExpertPrompt).toContain('林晓雯')
    expect(store.selectedExpertPrompt).toContain('内容创作专家')
    expect(store.recentExpertIds).toEqual([1])
    // 单选：切换专家替换
    store.setExpert(2)
    expect(store.selectedExpertId).toBe(2)
    expect(store.selectedExpertPrompt).toContain('陈法鉴')
  })

  it('最近使用：去重置顶、上限 5', () => {
    const store = useCatalogStore()
    store.setExpert(1)
    store.setExpert(2)
    store.setExpert(3)
    expect(store.recentExpertIds).toEqual([3, 2, 1])
    // 重复使用 1 → 置顶
    store.setExpert(1)
    expect(store.recentExpertIds).toEqual([1, 3, 2])
    // 超过 5 个 → 截断
    store.setExpert(4)
    store.setExpert(5)
    store.setExpert(6)
    expect(store.recentExpertIds).toEqual([6, 5, 4, 1, 3])
    expect(store.recentExpertIds.length).toBe(5)
  })

  it('clearExpert 清空 id 与提示词', () => {
    const store = useCatalogStore()
    store.setExpert(1)
    store.clearExpert()
    expect(store.selectedExpertId).toBeNull()
    expect(store.selectedExpertPrompt).toBe('')
  })

  it('不存在的专家 id 无副作用', () => {
    const store = useCatalogStore()
    store.setExpert(9999)
    expect(store.selectedExpertId).toBeNull()
    expect(store.recentExpertIds).toEqual([])
  })
})

describe('catalog store: 技能多选', () => {
  it('按选择顺序追加，可切换移除', () => {
    const store = useCatalogStore()
    store.toggleSkill(1)
    store.toggleSkill(2)
    expect(store.selectedSkillIds).toEqual([1, 2])
    expect(store.selectedSkills.map((s) => s.id)).toEqual([1, 2])
    store.toggleSkill(1)
    expect(store.selectedSkillIds).toEqual([2])
  })

  it('clearSkills 清空全部技能', () => {
    const store = useCatalogStore()
    store.toggleSkill(1)
    store.toggleSkill(2)
    store.clearSkills()
    expect(store.selectedSkillIds).toEqual([])
    expect(store.selectedSkills).toEqual([])
  })
})

describe('catalog store: 持久化', () => {
  it('round-trip：重建 store 恢复 mode/专家/最近使用（技能不持久化）', () => {
    const store = useCatalogStore()
    store.setMode('local')
    store.setExpert(3)
    store.toggleSkill(1)
    store.toggleSkill(2)
    // 重建 pinia 与 store（模拟应用重启）
    setActivePinia(createPinia())
    const fresh = useCatalogStore()
    expect(fresh.mode).toBe('local')
    expect(fresh.selectedExpertId).toBe(3)
    expect(fresh.selectedSkillIds).toEqual([])
    expect(fresh.recentExpertIds).toEqual([3])
    // 存储 JSON 不含技能字段
    const persisted = JSON.parse(storage.get(STORAGE_KEY) ?? '{}') as Record<string, unknown>
    expect(persisted).not.toHaveProperty('selectedSkillIds')
  })

  it('坏 JSON → 回退默认值', () => {
    storage.set(STORAGE_KEY, '{oops not json')
    const store = useCatalogStore()
    expect(store.mode).toBe('default')
    expect(store.selectedExpertId).toBeNull()
    expect(store.selectedSkillIds).toEqual([])
  })

  it('结构不合法 → 字段级回退（非法字段取默认，合法字段保留）', () => {
    storage.set(
      STORAGE_KEY,
      JSON.stringify({
        mode: 'bogus',
        selectedExpertId: 'not-a-number',
        selectedExpertPrompt: 123,
        selectedSkillIds: ['a', 1, 2.5],
        recentExpertIds: [2, 'x', 3, 4, 5, 6, 7]
      })
    )
    const store = useCatalogStore()
    expect(store.mode).toBe('default')
    expect(store.selectedExpertId).toBeNull()
    expect(store.selectedExpertPrompt).toBe('')
    // 技能字段不再解析：任何持久化数据下均为空
    expect(store.selectedSkillIds).toEqual([])
    expect(store.recentExpertIds).toEqual([2, 3, 4, 5, 6]) // 去非法项 + 截断 5 之后是 [2,3,4,5,6]？→ slice(0,5) 后为 [2,3,4,5,6]
  })
})

describe('catalog store: 数据源', () => {
  it('专家/技能数据与页面共源（非空且含预期条目）', () => {
    expect(experts.length).toBe(8)
    expect(skillItems.length).toBe(6)
    const store = useCatalogStore()
    expect(store.experts.length).toBe(8)
    expect(store.experts[0].name).toBe('林晓雯')
    expect(store.connectorItems.length).toBe(7)
    expect(store.connectorItems[0].name).toBe('GitHub')
    expect(store.connectorItems.some((c) => c.name === '钉钉')).toBe(true)
  })

  it('gotoTab 切换导航目标', () => {
    const store = useCatalogStore()
    store.gotoTab('skill')
    expect(store.pageTab).toBe('skill')
  })
})

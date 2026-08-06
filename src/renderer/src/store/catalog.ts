import { defineStore } from 'pinia'
import { computed, nextTick, ref } from 'vue'

/**
 * 目录数据与「+」菜单状态管理（渲染层）
 * 数据源与"专家·技能·连接器"页（ExpertPage）共用；选择类状态经 localStorage 持久化
 */

export type Mode = 'default' | 'local' | 'knowledge'
export type CatalogTab = 'expert' | 'skill' | 'connector'

export interface Expert {
  id: number
  name: string
  title: string
  tags: string[]
  desc: string
  color: string
  initials: string
  category: string
  rating: number
  users: string
}

export interface SkillItem {
  id: number
  name: string
  desc: string
  color: string
  count: string
}

export interface ConnectorItem {
  id: number
  name: string
  desc: string
  color: string
  connected: boolean
}

export interface AttachedFile {
  name: string
  path: string
}

/** 本地文件（专家页数据同源，此处唯一声明，ExpertPage 引用） */
export const experts: Expert[] = [
  {
    id: 1,
    name: '林晓雯',
    title: '内容创作专家',
    tags: ['小红书', '品牌文案'],
    desc: '擅长小红书种草内容、品牌故事撰写，已服务超过 300+ 品牌方。',
    color: 'linear-gradient(135deg,#f59e0b,#d97706)',
    initials: '林',
    category: 'AI工具专家',
    rating: 4.9,
    users: '2.1k'
  },
  {
    id: 2,
    name: '陈法鉴',
    title: '法律顾问专家',
    tags: ['合同审查', '公司法'],
    desc: '10 年执业律师，专注商事合同审查与知识产权保护领域。',
    color: 'linear-gradient(135deg,#6366f1,#4f46e5)',
    initials: '陈',
    category: '法律财税',
    rating: 4.8,
    users: '1.7k'
  },
  {
    id: 3,
    name: 'Kira Zhang',
    title: '前端开发 & 设计',
    tags: ['React', 'Figma', 'Tailwind'],
    desc: '全栈设计工程师，专注 React 生态与 Design System 落地。',
    color: 'linear-gradient(135deg,#0891b2,#0e7490)',
    initials: 'K',
    category: '技术研发',
    rating: 4.9,
    users: '3.4k'
  },
  {
    id: 4,
    name: '赵研究员',
    title: '行业信息研究员',
    tags: ['市场调研', '竞品分析'],
    desc: '深度行业研究，覆盖消费、科技、新能源等十余个赛道。',
    color: 'linear-gradient(135deg,#8b5cf6,#7c3aed)',
    initials: '赵',
    category: 'SPC',
    rating: 4.7,
    users: '980'
  },
  {
    id: 5,
    name: '美团工程师',
    title: '美团前工程师',
    tags: ['高并发', 'Go', '微服务'],
    desc: '曾任美团基础架构组 P7，擅长高并发系统设计与性能调优。',
    color: 'linear-gradient(135deg,#f97316,#ea580c)',
    initials: '美',
    category: '技术研发',
    rating: 4.8,
    users: '2.8k'
  },
  {
    id: 6,
    name: '周财税',
    title: '财务合伙人',
    tags: ['税务筹划', '财务报告'],
    desc: 'CPA 注册会计师，专注中小企业税务筹划与融资前财务规划。',
    color: 'linear-gradient(135deg,#10b981,#059669)',
    initials: '周',
    category: '法律财税',
    rating: 4.6,
    users: '1.2k'
  },
  {
    id: 7,
    name: '沈产品',
    title: '资深产品经理',
    tags: ['0→1', '用户研究', 'PRD'],
    desc: '前字节跳动产品负责人，主导过多款 DAU 千万级产品。',
    color: 'linear-gradient(135deg,#06b6d4,#0891b2)',
    initials: '沈',
    category: '产品设计',
    rating: 4.9,
    users: '4.1k'
  },
  {
    id: 8,
    name: '投研小组',
    title: '创投分析团队',
    tags: ['VC', '尽调', '估值'],
    desc: '由 3 位前头部 VC 分析师组成，专注早期项目尽调与估值建模。',
    color: 'linear-gradient(135deg,#ec4899,#db2777)',
    initials: '投',
    category: '创业投资',
    rating: 4.7,
    users: '760'
  }
]

export const skillItems: SkillItem[] = [
  {
    id: 1,
    name: 'PDF 深度解析',
    desc: '上传 PDF 自动提炼核心摘要、数据与结论',
    color: 'linear-gradient(135deg,#0891b2,#0e7490)',
    count: '12k+'
  },
  {
    id: 2,
    name: '数据图表生成',
    desc: '自然语言描述需求，一键生成可交互图表',
    color: 'linear-gradient(135deg,#8b5cf6,#7c3aed)',
    count: '8.3k+'
  },
  {
    id: 3,
    name: '代码审查助手',
    desc: '自动检测安全漏洞、性能问题与规范违反',
    color: 'linear-gradient(135deg,#f97316,#ea580c)',
    count: '6.1k+'
  },
  {
    id: 4,
    name: '多语言翻译',
    desc: '支持 50+ 语种，保留专业术语与原文格式',
    color: 'linear-gradient(135deg,#10b981,#059669)',
    count: '21k+'
  },
  {
    id: 5,
    name: '会议纪要提炼',
    desc: '上传录音或文字，自动生成结构化纪要',
    color: 'linear-gradient(135deg,#06b6d4,#0891b2)',
    count: '9.7k+'
  },
  {
    id: 6,
    name: '智能 PPT 生成',
    desc: '输入主题与大纲，自动排版美观的演示文稿',
    color: 'linear-gradient(135deg,#ec4899,#db2777)',
    count: '15k+'
  }
]

export const connectorItems: ConnectorItem[] = [
  {
    id: 1,
    name: 'GitHub',
    desc: '同步仓库、PR、Issue，代码直接入上下文',
    color: 'linear-gradient(135deg,#1f2937,#374151)',
    connected: true
  },
  {
    id: 2,
    name: 'Notion',
    desc: '读写 Notion 页面与数据库，知识无缝流动',
    color: 'linear-gradient(135deg,#1a1a1a,#333)',
    connected: false
  },
  {
    id: 3,
    name: '飞书',
    desc: '同步飞书文档、多维表格与日历事件',
    color: 'linear-gradient(135deg,#2f6fe5,#1652c4)',
    connected: true
  },
  {
    id: 4,
    name: '钉钉',
    desc: '同步钉钉审批、文档与工作群消息',
    color: 'linear-gradient(135deg,#2489ff,#0067e6)',
    connected: false
  },
  {
    id: 5,
    name: '数据库',
    desc: '直连 MySQL / PostgreSQL，自然语言查询',
    color: 'linear-gradient(135deg,#f59e0b,#d97706)',
    connected: false
  },
  {
    id: 6,
    name: 'Slack',
    desc: '发送消息、查看频道，团队协作更顺畅',
    color: 'linear-gradient(135deg,#4a154b,#611f69)',
    connected: false
  },
  {
    id: 7,
    name: 'Google Drive',
    desc: '读取与创建 Google Docs / Sheets / Slides',
    color: 'linear-gradient(135deg,#34a853,#1e8e3e)',
    connected: false
  }
]

const STORAGE_KEY = 'ke-work:task-selection'

interface PersistedState {
  mode: Mode
  selectedExpertId: number | null
  selectedExpertPrompt: string
  recentExpertIds: number[]
}

const DEFAULT_STATE: PersistedState = {
  mode: 'default',
  selectedExpertId: null,
  selectedExpertPrompt: '',
  recentExpertIds: []
}

/** node 测试环境/localStorage 不可用时不抛错 */
function readStorage(): string | null {
  if (typeof localStorage === 'undefined') return null
  try {
    return localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

function writeStorage(state: PersistedState): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // 存储满/被禁用：静默忽略，仅本次会话有效
  }
}

/** 懒加载持久化状态；坏 JSON/结构不合法 → 回退默认值（字段级校验） */
function loadPersisted(): PersistedState {
  const raw = readStorage()
  if (!raw) return { ...DEFAULT_STATE }
  try {
    const data: unknown = JSON.parse(raw)
    if (typeof data !== 'object' || data === null) return { ...DEFAULT_STATE }
    const d = data as Record<string, unknown>
    const out: PersistedState = { ...DEFAULT_STATE }
    if (d.mode === 'default' || d.mode === 'local' || d.mode === 'knowledge') out.mode = d.mode
    if (typeof d.selectedExpertId === 'number' || d.selectedExpertId === null) {
      out.selectedExpertId = d.selectedExpertId
    }
    if (typeof d.selectedExpertPrompt === 'string')
      out.selectedExpertPrompt = d.selectedExpertPrompt
    if (Array.isArray(d.recentExpertIds)) {
      out.recentExpertIds = d.recentExpertIds
        .filter((n): n is number => typeof n === 'number' && Number.isInteger(n))
        .slice(0, 5)
    }
    return out
  } catch {
    return { ...DEFAULT_STATE }
  }
}

/** 专家使用提示词模板（插入输入框的可编辑文本，删除专家时按原文移除） */
function buildExpertPrompt(expert: Expert): string {
  return `请以【${expert.name}·${expert.title}】的身份协助我完成以下任务：`
}

export const useCatalogStore = defineStore('catalog', () => {
  // ====== 状态(State) ======
  /** 专家·技能·连接器页当前标签页（导航目标） */
  const pageTab = ref<CatalogTab>('expert')
  /** 任务模式（互斥）：default=默认 / local=本地文件 / knowledge=知识库 */
  const mode = ref<Mode>(loadPersisted().mode)
  const selectedExpertId = ref<number | null>(loadPersisted().selectedExpertId)
  /** 插入输入框的专家提示词原文（切换/删除专家时用于移除） */
  const selectedExpertPrompt = ref<string>(loadPersisted().selectedExpertPrompt)
  /** 已选技能 id（选择顺序即展示顺序；不持久化，随输入框会话状态） */
  const selectedSkillIds = ref<number[]>([])
  /** 最近使用专家 id（最近在前，上限 5） */
  const recentExpertIds = ref<number[]>(loadPersisted().recentExpertIds)
  /** 已挂载本地文件（任务级，不持久化） */
  const attachedFiles = ref<AttachedFile[]>([])
  /** 连接器定位目标（一次性：跳转后高亮对应授权连接卡片） */
  const focusConnectorId = ref<number | null>(null)

  // ====== 计算属性(Getters) ======
  const selectedExpert = computed(
    () => experts.find((e) => e.id === selectedExpertId.value) ?? null
  )
  const selectedSkills = computed(() =>
    selectedSkillIds.value
      .map((id) => skillItems.find((s) => s.id === id))
      .filter((s): s is SkillItem => !!s)
  )
  const recentExperts = computed(() =>
    recentExpertIds.value
      .map((id) => experts.find((e) => e.id === id))
      .filter((e): e is Expert => !!e)
  )

  // ====== 持久化 ======
  function persist(): void {
    writeStorage({
      mode: mode.value,
      selectedExpertId: selectedExpertId.value,
      selectedExpertPrompt: selectedExpertPrompt.value,
      recentExpertIds: [...recentExpertIds.value]
    })
  }

  // ====== 方法(Actions) ======

  /** 设置任务模式（radio：打开一个自动关闭其余；点当前项无操作） */
  function setMode(m: Mode): void {
    if (mode.value === m) return
    mode.value = m
    persist()
  }

  /** 记录专家使用（去重置顶、上限 5） */
  function recordExpertUse(id: number): void {
    recentExpertIds.value = [id, ...recentExpertIds.value.filter((x) => x !== id)].slice(0, 5)
    persist()
  }

  /** 选择专家（单选；生成提示词并记入最近使用） */
  function setExpert(id: number): void {
    const expert = experts.find((e) => e.id === id)
    if (!expert) return
    selectedExpertId.value = id
    selectedExpertPrompt.value = buildExpertPrompt(expert)
    recordExpertUse(id)
  }

  /** 取消专家选择（提示词由页面从输入框移除） */
  function clearExpert(): void {
    selectedExpertId.value = null
    selectedExpertPrompt.value = ''
    persist()
  }

  /** 技能多选切换（不持久化，随输入框会话状态） */
  function toggleSkill(id: number): void {
    const idx = selectedSkillIds.value.indexOf(id)
    if (idx === -1) {
      selectedSkillIds.value = [...selectedSkillIds.value, id]
    } else {
      selectedSkillIds.value = selectedSkillIds.value.filter((x) => x !== id)
    }
  }

  /** 清空全部技能（发送成功后调用） */
  function clearSkills(): void {
    selectedSkillIds.value = []
  }

  /** 追加本地文件（系统选择器选中后调用） */
  function addLocalFiles(paths: string[]): void {
    for (const p of paths) {
      if (!p || attachedFiles.value.some((f) => f.path === p)) continue
      const name = p.split(/[\\/]/).pop() || p
      attachedFiles.value = [...attachedFiles.value, { name, path: p }]
    }
  }

  /** 移除本地文件 */
  function removeFile(path: string): void {
    attachedFiles.value = attachedFiles.value.filter((f) => f.path !== path)
  }

  /** 跳转到专家·技能·连接器页某标签页 */
  function gotoTab(tab: CatalogTab): void {
    pageTab.value = tab
  }

  /**
   * 跳转到连接器标签页并定位到指定连接器的授权连接卡片
   * 先清空再写入（nextTick 后），保证连续点击同一连接器也能触发 ExpertPage 的 watch
   */
  function gotoConnector(id: number): void {
    pageTab.value = 'connector'
    focusConnectorId.value = null
    nextTick(() => {
      focusConnectorId.value = id
    })
  }

  return {
    // 数据
    experts,
    skillItems,
    connectorItems,
    // 状态
    pageTab,
    mode,
    selectedExpertId,
    selectedExpertPrompt,
    selectedSkillIds,
    recentExpertIds,
    attachedFiles,
    focusConnectorId,
    // 计算
    selectedExpert,
    selectedSkills,
    recentExperts,
    // 方法
    setMode,
    recordExpertUse,
    setExpert,
    clearExpert,
    toggleSkill,
    clearSkills,
    addLocalFiles,
    removeFile,
    gotoTab,
    gotoConnector
  }
})

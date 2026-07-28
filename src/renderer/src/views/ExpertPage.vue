<script setup lang="ts">
import { computed, ref } from 'vue'

type PageTab = 'expert' | 'skill' | 'connector'

const pageTab = ref<PageTab>('expert')
const expertFilter = ref('全部')
const sort = ref<'综合' | '最新'>('综合')
const search = ref('')

const featuredScenes = [
  { id: 'content', label: '内容创作', color: 'linear-gradient(135deg,#f59e0b,#d97706)', bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.2)', items: ['内容创作专家团队', '内容创作专家', '小红书创作专家'] },
  { id: 'invest', label: '投资分析', color: 'linear-gradient(135deg,#0891b2,#0e7490)', bg: 'rgba(8,145,178,0.08)', border: 'rgba(8,145,178,0.2)', items: ['分众分析图团队', '股权投资研究专家', '腾讯投研配置策略'] },
  { id: 'legal', label: '法律查查', color: 'linear-gradient(135deg,#6366f1,#4f46e5)', bg: 'rgba(99,102,241,0.08)', border: 'rgba(99,102,241,0.2)', items: ['深海律法专家团队', '合同审查专家', '财务合同专家'] },
  { id: 'sme', label: '小微企业', color: 'linear-gradient(135deg,#10b981,#059669)', bg: 'rgba(16,185,129,0.08)', border: 'rgba(16,185,129,0.2)', items: ['小微企业经营顾问', '财税合规专家', '企业增长策略师'] }
]

const expertFilters = ['全部', 'SPC', 'AI工具专家', '产品设计', '技术研发', '创业投资', '法律财税']

const experts = [
  { id: 1, name: '林晓雯', title: '内容创作专家', tags: ['小红书', '品牌文案'], desc: '擅长小红书种草内容、品牌故事撰写，已服务超过 300+ 品牌方。', color: 'linear-gradient(135deg,#f59e0b,#d97706)', initials: '林', category: 'AI工具专家', rating: 4.9, users: '2.1k' },
  { id: 2, name: '陈法鉴', title: '法律顾问专家', tags: ['合同审查', '公司法'], desc: '10 年执业律师，专注商事合同审查与知识产权保护领域。', color: 'linear-gradient(135deg,#6366f1,#4f46e5)', initials: '陈', category: '法律财税', rating: 4.8, users: '1.7k' },
  { id: 3, name: 'Kira Zhang', title: '前端开发 & 设计', tags: ['React', 'Figma', 'Tailwind'], desc: '全栈设计工程师，专注 React 生态与 Design System 落地。', color: 'linear-gradient(135deg,#0891b2,#0e7490)', initials: 'K', category: '技术研发', rating: 4.9, users: '3.4k' },
  { id: 4, name: '赵研究员', title: '行业信息研究员', tags: ['市场调研', '竞品分析'], desc: '深度行业研究，覆盖消费、科技、新能源等十余个赛道。', color: 'linear-gradient(135deg,#8b5cf6,#7c3aed)', initials: '赵', category: 'SPC', rating: 4.7, users: '980' },
  { id: 5, name: '美团工程师', title: '美团前工程师', tags: ['高并发', 'Go', '微服务'], desc: '曾任美团基础架构组 P7，擅长高并发系统设计与性能调优。', color: 'linear-gradient(135deg,#f97316,#ea580c)', initials: '美', category: '技术研发', rating: 4.8, users: '2.8k' },
  { id: 6, name: '周财税', title: '财务合伙人', tags: ['税务筹划', '财务报告'], desc: 'CPA 注册会计师，专注中小企业税务筹划与融资前财务规划。', color: 'linear-gradient(135deg,#10b981,#059669)', initials: '周', category: '法律财税', rating: 4.6, users: '1.2k' },
  { id: 7, name: '沈产品', title: '资深产品经理', tags: ['0→1', '用户研究', 'PRD'], desc: '前字节跳动产品负责人，主导过多款 DAU 千万级产品。', color: 'linear-gradient(135deg,#06b6d4,#0891b2)', initials: '沈', category: '产品设计', rating: 4.9, users: '4.1k' },
  { id: 8, name: '投研小组', title: '创投分析团队', tags: ['VC', '尽调', '估值'], desc: '由 3 位前头部 VC 分析师组成，专注早期项目尽调与估值建模。', color: 'linear-gradient(135deg,#ec4899,#db2777)', initials: '投', category: '创业投资', rating: 4.7, users: '760' }
]

const skillItems = [
  { id: 1, name: 'PDF 深度解析', desc: '上传 PDF 自动提炼核心摘要、数据与结论', color: 'linear-gradient(135deg,#0891b2,#0e7490)', count: '12k+' },
  { id: 2, name: '数据图表生成', desc: '自然语言描述需求，一键生成可交互图表', color: 'linear-gradient(135deg,#8b5cf6,#7c3aed)', count: '8.3k+' },
  { id: 3, name: '代码审查助手', desc: '自动检测安全漏洞、性能问题与规范违反', color: 'linear-gradient(135deg,#f97316,#ea580c)', count: '6.1k+' },
  { id: 4, name: '多语言翻译', desc: '支持 50+ 语种，保留专业术语与原文格式', color: 'linear-gradient(135deg,#10b981,#059669)', count: '21k+' },
  { id: 5, name: '会议纪要提炼', desc: '上传录音或文字，自动生成结构化纪要', color: 'linear-gradient(135deg,#06b6d4,#0891b2)', count: '9.7k+' },
  { id: 6, name: '智能 PPT 生成', desc: '输入主题与大纲，自动排版美观的演示文稿', color: 'linear-gradient(135deg,#ec4899,#db2777)', count: '15k+' }
]

const connectorItems = [
  { id: 1, name: 'GitHub', desc: '同步仓库、PR、Issue，代码直接入上下文', color: 'linear-gradient(135deg,#1f2937,#374151)', connected: true },
  { id: 2, name: 'Notion', desc: '读写 Notion 页面与数据库，知识无缝流动', color: 'linear-gradient(135deg,#1a1a1a,#333)', connected: false },
  { id: 3, name: '飞书', desc: '同步飞书文档、多维表格与日历事件', color: 'linear-gradient(135deg,#2f6fe5,#1652c4)', connected: true },
  { id: 4, name: '数据库', desc: '直连 MySQL / PostgreSQL，自然语言查询', color: 'linear-gradient(135deg,#f59e0b,#d97706)', connected: false },
  { id: 5, name: 'Slack', desc: '发送消息、查看频道，团队协作更顺畅', color: 'linear-gradient(135deg,#4a154b,#611f69)', connected: false },
  { id: 6, name: 'Google Drive', desc: '读取与创建 Google Docs / Sheets / Slides', color: 'linear-gradient(135deg,#34a853,#1e8e3e)', connected: false }
]

const filteredExperts = computed(() =>
  experts.filter(e =>
    (expertFilter.value === '全部' || e.category === expertFilter.value) &&
    (e.name.includes(search.value) || e.title.includes(search.value) || e.tags.some(t => t.includes(search.value)))
  )
)
</script>

<template>
  <div class="expert-page">
    <!-- Top bar -->
    <div class="top-bar">
      <div class="tab-row">
        <button v-for="[key, label] in ([['expert','专家'],['skill','技能'],['connector','连接器']] as const)" :key="key" :class="['tab-btn', { 'tab-btn--active': pageTab === key }]" @click="pageTab = key">
          {{ label }}
          <span v-if="pageTab === key" class="tab-indicator"></span>
        </button>
      </div>
      <div class="top-spacer"></div>
      <div class="search-box">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
        <input type="text" :placeholder="pageTab === 'expert' ? '搜索专家' : pageTab === 'skill' ? '搜索技能' : '搜索连接器'" v-model="search" class="search-input" />
      </div>
      <button v-if="pageTab === 'expert'" class="sync-btn">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
        同步专家
      </button>
    </div>

    <div class="page-body">
      <Transition name="fade" mode="out-in">
        <!-- ── Expert Tab ── -->
        <div v-if="pageTab === 'expert'" key="expert">
          <!-- Featured scenes -->
          <section class="scene-section">
            <h2 class="sec-title">精选场景</h2>
            <div class="scene-grid">
              <div v-for="scene in featuredScenes" :key="scene.id" class="scene-card" :style="{ background: scene.bg, borderColor: scene.border }">
                <div class="scene-card-head">
                  <div class="scene-card-icon" :style="{ background: scene.color }">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2z"/></svg>
                  </div>
                  <span class="scene-card-label">{{ scene.label }}</span>
                </div>
                <div class="scene-items">
                  <div v-for="item in scene.items" :key="item" class="scene-item">
                    <div class="scene-item-dot" :style="{ background: scene.color }"></div>
                    <span>{{ item }}</span>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <!-- Expert grid -->
          <section>
            <div class="sec-header">
              <h2 class="sec-title">专家 · 专家园</h2>
              <div class="sec-spacer"></div>
              <div class="sort-btns">
                <button v-for="s in (['综合','最新'] as const)" :key="s" :class="['sort-btn', { 'sort-btn--active': sort === s }]" @click="sort = s">{{ s }}</button>
              </div>
            </div>
            <div class="filter-chips">
              <button v-for="f in expertFilters" :key="f" :class="['filter-chip', { 'filter-chip--active': expertFilter === f }]" @click="expertFilter = f">{{ f }}</button>
            </div>
            <div class="expert-grid">
              <div v-for="expert in filteredExperts" :key="expert.id" class="expert-card">
                <div class="expert-card-head">
                  <div class="expert-avatar" :style="{ background: expert.color }">{{ expert.initials }}</div>
                  <div class="expert-info">
                    <p class="expert-name">{{ expert.name }}</p>
                    <p class="expert-title">{{ expert.title }}</p>
                  </div>
                </div>
                <div class="expert-tags">
                  <span v-for="tag in expert.tags.slice(0,3)" :key="tag" class="expert-tag">{{ tag }}</span>
                </div>
                <p class="expert-desc">{{ expert.desc }}</p>
                <div class="expert-foot">
                  <div class="expert-rating">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="#f59e0b" stroke="#f59e0b" stroke-width="1"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                    {{ expert.rating }}
                  </div>
                  <span class="expert-users">{{ expert.users }} 使用</span>
                </div>
              </div>
              <div v-if="filteredExperts.length === 0" class="grid-empty">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
                <p>暂无符合条件的专家</p>
              </div>
            </div>
          </section>
        </div>

        <!-- ── Skill Tab ── -->
        <div v-else-if="pageTab === 'skill'" key="skill">
          <div class="sec-intro">
            <h2 class="sec-title">技能广场</h2>
            <p class="sec-desc">为KE-WORK扩展专项能力，一键调用即可赋能任意对话</p>
          </div>
          <div class="skill-grid">
            <div v-for="skill in skillItems.filter(s => s.name.includes(search) || s.desc.includes(search))" :key="skill.id" class="skill-card">
              <div class="skill-icon" :style="{ background: skill.color }">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
              </div>
              <div class="skill-info">
                <div class="skill-head">
                  <p class="skill-name">{{ skill.name }}</p>
                  <span class="skill-count">{{ skill.count }}</span>
                </div>
                <p class="skill-desc">{{ skill.desc }}</p>
                <button class="skill-add-btn">+ 添加技能</button>
              </div>
            </div>
          </div>
        </div>

        <!-- ── Connector Tab ── -->
        <div v-else key="connector">
          <div class="sec-intro">
            <h2 class="sec-title">连接器</h2>
            <p class="sec-desc">将外部服务接入KE-WORK，让 AI 直接读写你的数据与工具</p>
          </div>
          <div class="skill-grid">
            <div v-for="conn in connectorItems.filter(c => c.name.includes(search) || c.desc.includes(search))" :key="conn.id" class="skill-card" :class="{ 'skill-card--connected': conn.connected }">
              <div class="skill-icon" :style="{ background: conn.color }">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
              </div>
              <div class="skill-info">
                <div class="skill-head">
                  <div class="skill-head-left">
                    <p class="skill-name">{{ conn.name }}</p>
                    <span v-if="conn.connected" class="connected-badge"><span class="connected-dot"></span>已连接</span>
                  </div>
                </div>
                <p class="skill-desc">{{ conn.desc }}</p>
                <button :class="['conn-action-btn', { 'conn-action-btn--connected': conn.connected }]">
                  {{ conn.connected ? '管理连接' : '立即连接' }}
                </button>
              </div>
            </div>
          </div>
        </div>
      </Transition>
    </div>
  </div>
</template>

<style scoped>
.expert-page { flex: 1; display: flex; flex-direction: column; overflow: hidden; background: #fff; font-family: 'Inter','Noto Sans SC',sans-serif; }
.top-bar { display: flex; align-items: center; gap: 0; padding: 16px 24px 0; border-bottom: 1px solid rgba(8,145,178,0.1); flex-shrink: 0; }
.tab-row { display: flex; gap: 4px; }
.tab-btn { position: relative; padding: 10px 16px; border: none; background: transparent; color: #6b7f95; font-size: 13px; font-weight: 500; font-family: inherit; cursor: pointer; }
.tab-btn--active { color: #0891b2; }
.tab-indicator { position: absolute; bottom: 0; left: 8px; right: 8px; height: 2px; border-radius: 2px; background: #0891b2; }
.top-spacer { flex: 1; }
.search-box { display: flex; align-items: center; gap: 6px; padding: 6px 12px; border-radius: 8px; background: #f5f9fb; border: 1px solid rgba(8,145,178,0.15); margin-right: 8px; color: #9ca3af; }
.search-input { border: none; background: transparent; outline: none; font-size: 12px; font-family: inherit; color: #374151; width: 128px; }
.search-input::placeholder { color: #9ca3af; }
.sync-btn { display: flex; align-items: center; gap: 6px; padding: 6px 12px; border: none; border-radius: 8px; background: linear-gradient(135deg,#0891b2,#0e7490); color: #fff; font-size: 12px; font-weight: 500; font-family: inherit; cursor: pointer; box-shadow: 0 2px 8px rgba(8,145,178,0.25); margin-bottom: -1px; }

.page-body { flex: 1; overflow-y: auto; padding: 20px 24px; scrollbar-width: none; }
.page-body::-webkit-scrollbar { display: none; }

.sec-title { font-size: 14px; font-weight: 600; color: #1a2332; margin: 0; }
.sec-desc { font-size: 12px; color: #6b7f95; margin: 4px 0 0; }
.sec-intro { margin-bottom: 16px; }
.sec-header { display: flex; align-items: center; margin-bottom: 12px; }
.sec-spacer { flex: 1; }
.sort-btns { display: flex; gap: 2px; font-size: 12px; }
.sort-btn { padding: 4px 8px; border: none; border-radius: 8px; background: transparent; color: #9ca3af; font-family: inherit; cursor: pointer; }
.sort-btn--active { color: #0891b2; font-weight: 600; }

.scene-section { margin-bottom: 24px; }
.scene-section .sec-title { margin-bottom: 12px; }
.scene-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
.scene-card { border-radius: 12px; padding: 14px; cursor: pointer; border: 1px solid transparent; transition: box-shadow .15s; }
.scene-card:hover { box-shadow: 0 4px 12px rgba(0,0,0,0.06); }
.scene-card-head { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; }
.scene-card-icon { width: 28px; height: 28px; border-radius: 8px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.scene-card-label { font-size: 13px; font-weight: 600; color: #1a2332; }
.scene-items { display: flex; flex-direction: column; gap: 6px; }
.scene-item { display: flex; align-items: center; gap: 6px; font-size: 11px; color: #4b5563; }
.scene-item-dot { width: 16px; height: 16px; border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }

.filter-chips { display: flex; gap: 6px; margin-bottom: 16px; overflow-x: auto; padding-bottom: 4px; scrollbar-width: none; }
.filter-chip { padding: 4px 12px; border: 1px solid rgba(8,145,178,0.15); border-radius: 999px; background: #f5f9fb; color: #6b7f95; font-size: 12px; font-weight: 500; font-family: inherit; cursor: pointer; white-space: nowrap; flex-shrink: 0; }
.filter-chip--active { background: #0891b2; color: #fff; border-color: #0891b2; }

.expert-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
.expert-card { padding: 16px; border-radius: 12px; background: #f9fbfc; border: 1px solid rgba(8,145,178,0.1); cursor: pointer; transition: border-color .15s, background .15s; }
.expert-card:hover { border-color: rgba(8,145,178,0.28); background: #fff; box-shadow: 0 4px 12px rgba(0,0,0,0.05); }
.expert-card-head { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
.expert-avatar { width: 40px; height: 40px; border-radius: 10px; display: flex; align-items: center; justify-content: center; color: #fff; font-size: 16px; font-weight: 700; flex-shrink: 0; }
.expert-info { min-width: 0; }
.expert-name { font-size: 13px; font-weight: 600; color: #1a2332; margin: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.expert-title { font-size: 11px; color: #6b7f95; margin: 0; }
.expert-tags { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 10px; }
.expert-tag { padding: 2px 6px; border-radius: 4px; background: rgba(8,145,178,0.08); color: #0891b2; font-size: 10px; font-weight: 500; }
.expert-desc { font-size: 11px; color: #6b7280; line-height: 1.5; margin: 0 0 12px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.expert-foot { display: flex; align-items: center; justify-content: space-between; }
.expert-rating { display: flex; align-items: center; gap: 4px; font-size: 11px; font-weight: 500; color: #374151; }
.expert-users { font-size: 10px; color: #9ca3af; }

.grid-empty { grid-column: 1 / -1; display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 64px 0; color: #cbd5e1; font-size: 14px; }

.skill-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
.skill-card { display: flex; gap: 12px; padding: 16px; border-radius: 12px; background: #f9fbfc; border: 1px solid rgba(8,145,178,0.1); cursor: pointer; transition: border-color .15s, background .15s; }
.skill-card:hover { border-color: rgba(8,145,178,0.28); background: #fff; }
.skill-card--connected { border-color: rgba(16,185,129,0.25); }
.skill-icon { width: 40px; height: 40px; border-radius: 10px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.skill-info { flex: 1; min-width: 0; }
.skill-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px; }
.skill-head-left { display: flex; align-items: center; gap: 8px; }
.skill-name { font-size: 13px; font-weight: 600; color: #1a2332; margin: 0; }
.skill-count { font-size: 10px; color: #9ca3af; }
.skill-desc { font-size: 11px; color: #6b7280; line-height: 1.4; margin: 0 0 12px; }
.skill-add-btn { padding: 4px 12px; border: none; border-radius: 8px; background: rgba(8,145,178,0.08); color: #0891b2; font-size: 11px; font-weight: 500; font-family: inherit; cursor: pointer; }
.connected-badge { display: flex; align-items: center; gap: 4px; padding: 2px 6px; border-radius: 4px; background: rgba(16,185,129,0.1); color: #059669; font-size: 10px; font-weight: 500; }
.connected-dot { width: 6px; height: 6px; border-radius: 50%; background: #10b981; display: inline-block; }
.conn-action-btn { padding: 4px 12px; border: none; border-radius: 8px; background: rgba(8,145,178,0.08); color: #0891b2; font-size: 11px; font-weight: 500; font-family: inherit; cursor: pointer; }
.conn-action-btn--connected { background: rgba(16,185,129,0.08); color: #059669; }

.fade-enter-active, .fade-leave-active { transition: opacity .18s, transform .18s; }
.fade-enter-from { opacity: 0; transform: translateY(6px); }
.fade-leave-to { opacity: 0; }

@media (max-width: 1200px) { .scene-grid, .expert-grid { grid-template-columns: repeat(2, 1fr); } .skill-grid { grid-template-columns: repeat(2, 1fr); } }
@media (max-width: 768px) { .top-bar { padding: 12px 16px 0; } .page-body { padding: 16px; } .scene-grid, .expert-grid, .skill-grid { grid-template-columns: 1fr; } .sync-btn { display: none; } }
</style>

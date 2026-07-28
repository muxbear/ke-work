<script setup lang="ts">
import { ref } from 'vue'

const search = ref('')
const showNewModal = ref(false)
const hoveredId = ref<number | null>(null)

const myProjects = [
  { id: 1, name: '项目新手指引', time: '添加于 6 天前', color: '#0891b2' },
  { id: 2, name: '青鸾设计系统 v2', time: '添加于 2 天前', color: '#8b5cf6' }
]

const templates = [
  { id: 1, name: '产品需求全流程', desc: '从需求定义、PRD 到研发测试验收', color: '#0891b2' },
  { id: 2, name: '市场调研与竞品分析', desc: '深度调研、竞品拆解、报告审审', color: '#8b5cf6' },
  { id: 3, name: '团队知识库', desc: '持续沉淀 SOP、经验和 FAQ', color: '#10b981' },
  { id: 4, name: '项目交付', desc: '管理客户需求、计划、风险和周报', color: '#f59e0b' },
  { id: 5, name: 'Bug 跟踪 / 测试验收', desc: '持续跟踪 Bug、统一测试用例和验收结论', color: '#ef4444' },
  { id: 6, name: '数据资产管理', desc: '统一管理数据源、指标定义与分析报告', color: '#06b6d4' }
]

const filtered = ref(myProjects)
const updateSearch = (v: string) => {
  search.value = v
  filtered.value = myProjects.filter(p => p.name.includes(v))
}
</script>

<template>
  <div class="project-page">
    <!-- Hero -->
    <div class="project-hero">
      <div>
        <h1 class="project-title">项目</h1>
        <p class="project-subtitle">多人协同，打造超级团队</p>
        <button class="project-create-btn" @click="showNewModal = true">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          新建项目
        </button>
      </div>
      <!-- Collab illustration -->
      <svg width="220" height="110" viewBox="0 0 260 130" fill="none" class="hero-illustration">
        <rect x="30" y="88" width="200" height="6" rx="3" fill="rgba(8,145,178,0.15)"/>
        <circle cx="62" cy="55" r="14" fill="rgba(8,145,178,0.12)" stroke="rgba(8,145,178,0.3)" stroke-width="1.5"/>
        <circle cx="62" cy="50" r="7" fill="rgba(8,145,178,0.25)"/>
        <path d="M48 88 C48 72 76 72 76 88" fill="rgba(8,145,178,0.15)" stroke="rgba(8,145,178,0.3)" stroke-width="1.5"/>
        <rect x="44" y="76" width="36" height="14" rx="2" fill="rgba(8,145,178,0.1)" stroke="rgba(8,145,178,0.3)" stroke-width="1.2"/>
        <circle cx="130" cy="52" r="20" fill="rgba(8,145,178,0.08)" stroke="rgba(8,145,178,0.2)" stroke-width="1.5" stroke-dasharray="4 3"/>
        <circle cx="130" cy="47" r="10" fill="rgba(8,145,178,0.2)"/>
        <ellipse cx="130" cy="62" rx="8" ry="10" fill="rgba(8,145,178,0.18)"/>
        <circle cx="198" cy="55" r="14" fill="rgba(14,116,144,0.12)" stroke="rgba(14,116,144,0.3)" stroke-width="1.5"/>
        <circle cx="198" cy="50" r="7" fill="rgba(14,116,144,0.25)"/>
        <path d="M184 88 C184 72 212 72 212 88" fill="rgba(14,116,144,0.15)" stroke="rgba(14,116,144,0.3)" stroke-width="1.5"/>
        <rect x="180" y="76" width="36" height="14" rx="2" fill="rgba(14,116,144,0.1)" stroke="rgba(14,116,144,0.3)" stroke-width="1.2"/>
        <rect x="220" y="28" width="28" height="36" rx="3" fill="rgba(8,145,178,0.08)" stroke="rgba(8,145,178,0.25)" stroke-width="1.2"/>
        <rect x="12" y="40" width="26" height="32" rx="3" fill="rgba(8,145,178,0.06)" stroke="rgba(8,145,178,0.2)" stroke-width="1.2"/>
      </svg>
    </div>

    <div class="project-body">
      <!-- My Projects -->
      <section>
        <div class="section-header">
          <h2 class="section-title">我的项目</h2>
          <div class="search-box">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
            <input type="text" placeholder="搜索项目" :value="search" @input="updateSearch(($event.target as HTMLInputElement).value)" class="search-input" />
          </div>
        </div>
        <div class="project-table">
          <div v-if="filtered.length === 0" class="table-empty">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
            <p>没有找到相关项目</p>
          </div>
          <div
            v-for="(proj, i) in filtered"
            :key="proj.id"
            class="project-row"
            :class="{ 'project-row--hover': hoveredId === proj.id }"
            :style="{ borderBottom: i < filtered.length - 1 ? '1px solid rgba(8,145,178,0.08)' : 'none' }"
            @mouseenter="hoveredId = proj.id"
            @mouseleave="hoveredId = null"
          >
            <div class="project-row-icon" :style="{ background: proj.color + '18', border: '1px solid ' + proj.color + '30' }">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" :style="{ color: proj.color }"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
            </div>
            <div class="project-row-info">
              <p class="project-row-name">{{ proj.name }}</p>
              <p class="project-row-time">{{ proj.time }}</p>
            </div>
            <button class="project-row-more">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg>
            </button>
          </div>
        </div>
      </section>

      <!-- Templates -->
      <section class="templates-section">
        <h2 class="section-title">从模版创建</h2>
        <div class="templates-grid">
          <button
            v-for="tpl in templates"
            :key="tpl.id"
            class="template-card"
          >
            <div class="template-icon" :style="{ background: `linear-gradient(135deg,${tpl.color},${tpl.color}cc)` }">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>
            </div>
            <div>
              <p class="template-name">{{ tpl.name }}</p>
              <p class="template-desc">{{ tpl.desc }}</p>
            </div>
          </button>
        </div>
      </section>
    </div>

    <!-- New Project Modal -->
    <Transition name="modal">
      <div v-if="showNewModal" class="modal-mask" @click.self="showNewModal = false">
        <div class="modal-card">
          <div class="modal-header">
            <span>新建项目</span>
            <button @click="showNewModal = false" class="modal-close">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
          <div class="modal-body">
            <label class="modal-label">项目名称</label>
            <input type="text" placeholder="输入项目名称…" class="modal-input" />
            <label class="modal-label">项目描述（可选）</label>
            <textarea rows="2" placeholder="描述项目目标或背景…" class="modal-textarea"></textarea>
          </div>
          <div class="modal-footer">
            <button class="modal-btn modal-btn--cancel" @click="showNewModal = false">取消</button>
            <button class="modal-btn modal-btn--confirm" @click="showNewModal = false">创建</button>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.project-page { flex: 1; display: flex; flex-direction: column; overflow-y: auto; background: #fff; scrollbar-width: none; font-family: 'Inter','Noto Sans SC',sans-serif; }
.project-page::-webkit-scrollbar { display: none; }

.project-hero { display: flex; align-items: center; justify-content: space-between; padding: 32px 40px 24px; border-bottom: 1px solid rgba(8,145,178,0.08); flex-shrink: 0; }
.project-title { font-size: 24px; font-weight: 700; color: #1a2332; margin: 0 0 4px; }
.project-subtitle { font-size: 14px; color: #6b7f95; margin: 0 0 20px; }
.project-create-btn { display: flex; align-items: center; gap: 8px; padding: 10px 16px; border: none; border-radius: 12px; background: linear-gradient(135deg,#0891b2,#0e7490); color: #fff; font-size: 14px; font-weight: 600; font-family: inherit; cursor: pointer; box-shadow: 0 3px 12px rgba(8,145,178,0.3); }
.project-create-btn:active { transform: scale(0.97); }
.hero-illustration { opacity: .85; flex-shrink: 0; }

.project-body { padding: 0 40px 32px; }
.section-header { display: flex; align-items: center; justify-content: space-between; margin: 24px 0 12px; }
.section-title { font-size: 15px; font-weight: 600; color: #1a2332; margin: 0; }
.search-box { display: flex; align-items: center; gap: 6px; padding: 6px 12px; border-radius: 8px; background: #f5f9fb; border: 1px solid rgba(8,145,178,0.15); }
.search-input { border: none; background: transparent; outline: none; font-size: 12px; font-family: inherit; color: #374151; width: 112px; }
.search-input::placeholder { color: #9ca3af; }

.project-table { border-radius: 12px; border: 1px solid rgba(8,145,178,0.12); overflow: hidden; }
.table-empty { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 40px; color: #cbd5e1; font-size: 14px; }
.project-row { display: flex; align-items: center; gap: 12px; padding: 12px 16px; cursor: pointer; transition: background .15s; }
.project-row:hover, .project-row--hover { background: rgba(8,145,178,0.04); }
.project-row-icon { width: 32px; height: 32px; border-radius: 8px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.project-row-info { flex: 1; min-width: 0; }
.project-row-name { font-size: 13px; font-weight: 500; color: #1a2332; margin: 0; }
.project-row-time { font-size: 11px; color: #9ca3af; margin: 0; }
.project-row-more { opacity: 0; padding: 6px; border: none; border-radius: 8px; background: transparent; color: #9ca3af; cursor: pointer; transition: opacity .15s, background .15s; }
.project-row:hover .project-row-more { opacity: 1; }
.project-row-more:hover { background: rgba(8,145,178,0.08); }

.templates-section { margin-top: 32px; padding-bottom: 32px; }
.templates-section .section-title { margin-bottom: 12px; }
.templates-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
.template-card { display: flex; align-items: center; gap: 12px; padding: 14px 16px; border: 1px solid rgba(8,145,178,0.12); border-radius: 12px; background: #f9fbfc; cursor: pointer; text-align: left; font-family: inherit; transition: background .15s, border-color .15s; }
.template-card:hover { background: rgba(8,145,178,0.04); border-color: rgba(8,145,178,0.25); }
.template-card:active { transform: scale(0.98); }
.template-icon { width: 36px; height: 36px; border-radius: 10px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.template-name { font-size: 13px; font-weight: 500; color: #1a2332; margin: 0 0 2px; }
.template-desc { font-size: 11px; color: #6b7f95; margin: 0; line-height: 1.4; }

.modal-mask { position: fixed; inset: 0; z-index: 50; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.3); backdrop-filter: blur(4px); }
.modal-card { width: 400px; background: #fff; border-radius: 16px; border: 1px solid rgba(8,145,178,0.15); box-shadow: 0 20px 60px rgba(0,0,0,0.15); overflow: hidden; }
.modal-header { display: flex; align-items: center; justify-content: space-between; padding: 16px 24px; border-bottom: 1px solid rgba(8,145,178,0.08); font-size: 14px; font-weight: 600; color: #1a2332; }
.modal-close { border: none; background: transparent; color: #9ca3af; cursor: pointer; padding: 4px; }
.modal-body { padding: 20px 24px; display: flex; flex-direction: column; gap: 16px; }
.modal-label { font-size: 12px; font-weight: 500; color: #374151; }
.modal-input, .modal-textarea { width: 100%; padding: 10px 12px; border: 1.5px solid rgba(8,145,178,0.2); border-radius: 12px; background: #f5f9fb; outline: none; font-size: 14px; font-family: inherit; color: #1a2332; box-sizing: border-box; resize: none; }
.modal-input::placeholder, .modal-textarea::placeholder { color: #9ca3af; }
.modal-footer { display: flex; gap: 8px; padding: 0 24px 20px; }
.modal-btn { flex: 1; padding: 10px; border: none; border-radius: 12px; font-size: 14px; font-weight: 500; font-family: inherit; cursor: pointer; }
.modal-btn--cancel { background: #f0f6fa; color: #6b7f95; }
.modal-btn--confirm { background: linear-gradient(135deg,#0891b2,#0e7490); color: #fff; box-shadow: 0 2px 10px rgba(8,145,178,0.3); }
.modal-enter-active, .modal-leave-active { transition: opacity .2s; }
.modal-enter-active .modal-card, .modal-leave-active .modal-card { transition: transform .2s; }
.modal-enter-from, .modal-leave-to { opacity: 0; }
.modal-enter-from .modal-card { transform: scale(0.92); }
.modal-leave-to .modal-card { transform: scale(0.92); }

@media (max-width: 768px) {
  .project-hero { padding: 24px 20px 20px; }
  .hero-illustration { display: none; }
  .project-body { padding: 0 20px 24px; }
  .templates-grid { grid-template-columns: 1fr; }
  .modal-card { width: 90vw; }
}
</style>

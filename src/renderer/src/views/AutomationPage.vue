<script setup lang="ts">
import { ref } from 'vue'

type Tab = 'tasks' | 'logs'
const tab = ref<Tab>('tasks')
const myTasks = ref<typeof automationTemplates>([])
const showAdd = ref(false)

const automationTemplates = [
  { id: 1, icon: '📰', title: '每日 AI 新闻推送', desc: '关注当天 AI 领域的重要动态，侧重产品与技术突破', freq: '每天 08:00' },
  { id: 2, icon: '🔤', title: '每日 5 个英语单词', desc: '每天推荐 5 个高频实用英语单词，配例句与记忆技巧', freq: '每天 07:30' },
  { id: 3, icon: '🌙', title: '每日儿童睡前故事', desc: '生成 3-5 分钟可读的温和睡前故事，适合亲子共读', freq: '每天 20:30' },
  { id: 4, icon: '📋', title: '每周工作周报', desc: '每周五汇总仓库 PR 与 Issue 进展，自动生成周报草稿', freq: '每周五 18:00' },
  { id: 5, icon: '🎬', title: '经典电影推荐', desc: '推荐一部高分经典电影，简要介绍背景与观影理由', freq: '每周三 12:00' },
  { id: 6, icon: '📅', title: '历史上的今天', desc: '从科技、电影、音乐等领域挑选一件有趣的历史事件', freq: '每天 09:00' },
  { id: 7, icon: '💡', title: '每日一个为什么', desc: '每天提出一个有趣问题，先提问再揭晓答案，启发思考', freq: '每天 10:00' },
  { id: 8, icon: '📞', title: '父母联系提醒', desc: '每周日 10:00 提醒你给家人打电话，珍惜家人时光', freq: '每周日 10:00' },
  { id: 9, icon: '🏥', title: '体检预约提醒', desc: '在指定时间提醒你确认体检预约，提前做好准备', freq: '单次 07:00' },
  { id: 10, icon: '💼', title: '面试准备提醒', desc: '工作日每 2 小时提醒你复习大模型相关知识点', freq: '工作日 每2h' },
  { id: 11, icon: '📝', title: '会议前准备', desc: '在会议开始前提醒你整理议题，目标与所需材料', freq: '会前 15min' },
  { id: 12, icon: '🐱', title: '可爱萌宠手机壁纸', desc: '随机从 7 种风格中挑选一种，生成今日专属萌宠壁纸', freq: '每天 07:00' }
]

const runLogs = [
  { id: 1, name: '每日 AI 新闻推送', status: '成功', time: '今天 08:00', duration: '3.2s', color: '#10b981' },
  { id: 2, name: '每日 5 个英语单词', status: '成功', time: '今天 07:30', duration: '1.8s', color: '#10b981' },
  { id: 3, name: '每日一个为什么', status: '成功', time: '今天 10:00', duration: '2.1s', color: '#10b981' },
  { id: 4, name: '历史上的今天', status: '失败', time: '今天 09:00', duration: '—', color: '#ef4444' },
  { id: 5, name: '每日 AI 新闻推送', status: '成功', time: '昨天 08:00', duration: '2.9s', color: '#10b981' },
  { id: 6, name: '每日儿童睡前故事', status: '成功', time: '昨天 20:30', duration: '4.5s', color: '#10b981' },
  { id: 7, name: '每周工作周报', status: '成功', time: '周五 18:00', duration: '6.1s', color: '#10b981' },
  { id: 8, name: '父母联系提醒', status: '跳过', time: '周日 10:00', duration: '—', color: '#f59e0b' }
]

const stats = [
  { label: '本周运行次数', value: '24', sub: '较上周 +3', color: '#0891b2' },
  { label: '成功率', value: '87.5%', sub: '7 次成功 / 1 次失败', color: '#10b981' },
  { label: '平均耗时', value: '3.4s', sub: '最长 6.1s', color: '#f59e0b' }
]

const addTask = (tpl: typeof automationTemplates[0]) => {
  if (!myTasks.value.find(t => t.id === tpl.id)) myTasks.value.push(tpl)
}
</script>

<template>
  <div class="auto-page">
    <!-- Tabs -->
    <div class="auto-tabs">
      <button v-for="[key, label] in ([['tasks','定时任务'],['logs','运行记录']] as const)" :key="key" :class="['auto-tab', { 'auto-tab--active': tab === key }]" @click="tab = key">
        {{ label }}
        <span v-if="tab === key" class="auto-tab-line"></span>
      </button>
    </div>

    <div class="auto-body">
      <Transition name="fade" mode="out-in">
        <!-- ── Tasks Tab ── -->
        <div v-if="tab === 'tasks'" key="tasks">
          <!-- Empty state -->
          <div v-if="myTasks.length === 0" class="empty-state">
            <div class="empty-icon-circle">
              <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
                <circle cx="16" cy="16" r="12" stroke="rgba(8,145,178,0.35)" stroke-width="1.8" stroke-dasharray="3 2"/>
                <circle cx="16" cy="16" r="3" fill="rgba(8,145,178,0.3)"/>
                <line x1="16" y1="8" x2="16" y2="13" stroke="rgba(8,145,178,0.4)" stroke-width="1.8" stroke-linecap="round"/>
                <line x1="16" y1="16" x2="20" y2="20" stroke="rgba(8,145,178,0.4)" stroke-width="1.8" stroke-linecap="round"/>
              </svg>
            </div>
            <p class="empty-title">开启你的第一个自动化任务吧</p>
            <p class="empty-desc">从模版选择或自定义定时任务，让KE-WORK自动帮你完成重复工作</p>
            <button class="auto-create-btn" @click="showAdd = true">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              添加自动化
            </button>
          </div>

          <!-- Has tasks -->
          <template v-else>
            <div class="my-tasks-header">
              <h2 class="sec-title">我的任务 <span class="task-count">{{ myTasks.length }} 个</span></h2>
              <button class="auto-create-btn auto-create-btn--sm" @click="showAdd = true">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                添加自动化
              </button>
            </div>
            <div class="task-grid">
              <div v-for="task in myTasks" :key="task.id" class="task-card">
                <span class="task-icon">{{ task.icon }}</span>
                <div class="task-info">
                  <p class="task-name">{{ task.title }}</p>
                  <p class="task-desc">{{ task.desc }}</p>
                  <div class="task-foot">
                    <span class="task-freq">{{ task.freq }}</span>
                    <div class="task-status">
                      <span class="status-dot status-dot--green"></span>
                      运行中
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </template>

          <!-- Templates -->
          <div class="tpl-section">
            <h2 class="sec-title tpl-section-title">自动化任务模版</h2>
            <div class="task-grid">
              <div v-for="tpl in automationTemplates" :key="tpl.id" :class="['task-card task-card--tpl', { 'task-card--added': myTasks.some(t => t.id === tpl.id) }]">
                <span class="task-icon">{{ tpl.icon }}</span>
                <div class="task-info">
                  <p class="task-name">{{ tpl.title }}</p>
                  <p class="task-desc">{{ tpl.desc }}</p>
                  <div class="task-foot">
                    <span class="task-freq">{{ tpl.freq }}</span>
                    <button :class="['task-add-btn', { 'task-add-btn--added': myTasks.some(t => t.id === tpl.id) }]" @click="addTask(tpl)">
                      {{ myTasks.some(t => t.id === tpl.id) ? '✓ 已添加' : '+ 添加' }}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- ── Logs Tab ── -->
        <div v-else key="logs">
          <div class="logs-header">
            <h2 class="sec-title">运行记录</h2>
            <span class="logs-range">最近 7 天</span>
          </div>
          <div class="logs-table">
            <div class="logs-table-head">
              <span>任务名称</span><span>运行时间</span><span>耗时</span><span>状态</span>
            </div>
            <div v-for="(log, i) in runLogs" :key="log.id" class="logs-row" :style="{ borderBottom: i < runLogs.length - 1 ? '1px solid rgba(8,145,178,0.07)' : 'none' }">
              <span class="logs-name">{{ log.name }}</span>
              <span class="logs-time">{{ log.time }}</span>
              <span class="logs-dur">{{ log.duration }}</span>
              <div class="logs-status-cell">
                <span class="status-dot" :style="{ background: log.color }"></span>
                <span :style="{ color: log.color, fontWeight: 500 }">{{ log.status }}</span>
                <button v-if="log.status === '失败'" class="logs-retry">重试</button>
              </div>
            </div>
          </div>
          <!-- Stats -->
          <div class="stats-grid">
            <div v-for="stat in stats" :key="stat.label" class="stat-card">
              <p class="stat-label">{{ stat.label }}</p>
              <p class="stat-value" :style="{ color: stat.color }">{{ stat.value }}</p>
              <p class="stat-sub">{{ stat.sub }}</p>
            </div>
          </div>
        </div>
      </Transition>
    </div>

    <!-- Add Modal -->
    <Transition name="modal">
      <div v-if="showAdd" class="modal-mask" @click.self="showAdd = false">
        <div class="modal-card">
          <div class="modal-header">
            <span>新建自动化任务</span>
            <button @click="showAdd = false" class="modal-close">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
          <div class="modal-body">
            <label class="modal-label">任务名称</label>
            <input type="text" placeholder="例如：每日行业快报推送" class="modal-input" />
            <label class="modal-label">任务描述 / 提示词</label>
            <textarea rows="3" placeholder="描述你希望KE-WORK每次执行的内容…" class="modal-textarea"></textarea>
            <div class="modal-row">
              <div>
                <label class="modal-label">执行频率</label>
                <select class="modal-input"><option>每天</option><option>每周</option><option>工作日</option><option>单次</option></select>
              </div>
              <div>
                <label class="modal-label">执行时间</label>
                <input type="time" value="08:00" class="modal-input" />
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button class="modal-btn modal-btn--cancel" @click="showAdd = false">取消</button>
            <button class="modal-btn modal-btn--confirm" @click="showAdd = false">创建任务</button>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.auto-page { flex: 1; display: flex; flex-direction: column; overflow: hidden; background: #fff; font-family: 'Inter','Noto Sans SC',sans-serif; }
.auto-tabs { display: flex; padding: 16px 24px 0; border-bottom: 1px solid rgba(8,145,178,0.1); flex-shrink: 0; }
.auto-tab { position: relative; padding: 10px 16px; border: none; background: transparent; color: #6b7f95; font-size: 13px; font-weight: 500; font-family: inherit; cursor: pointer; }
.auto-tab--active { color: #0891b2; }
.auto-tab-line { position: absolute; bottom: 0; left: 8px; right: 8px; height: 2px; border-radius: 2px; background: #0891b2; }
.auto-body { flex: 1; overflow-y: auto; scrollbar-width: none; }
.auto-body::-webkit-scrollbar { display: none; }

.empty-state { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 56px 20px; text-align: center; }
.empty-icon-circle { width: 64px; height: 64px; border-radius: 16px; display: flex; align-items: center; justify-content: center; background: rgba(8,145,178,0.06); border: 1.5px dashed rgba(8,145,178,0.2); margin-bottom: 16px; }
.empty-title { font-size: 14px; font-weight: 500; color: #374151; margin: 0 0 4px; }
.empty-desc { font-size: 12px; color: #9ca3af; margin: 0 0 16px; max-width: 360px; }

.auto-create-btn { display: flex; align-items: center; gap: 8px; padding: 10px 20px; border: none; border-radius: 12px; background: linear-gradient(135deg,#0891b2,#0e7490); color: #fff; font-size: 14px; font-weight: 600; font-family: inherit; cursor: pointer; box-shadow: 0 3px 12px rgba(8,145,178,0.3); }
.auto-create-btn:active { transform: scale(0.97); }
.auto-create-btn--sm { padding: 6px 12px; font-size: 12px; border-radius: 8px; }

.sec-title { font-size: 14px; font-weight: 600; color: #1a2332; margin: 0; }
.task-count { font-size: 12px; font-weight: 400; color: #9ca3af; margin-left: 4px; }
.my-tasks-header { display: flex; align-items: center; justify-content: space-between; padding: 20px 24px 0; margin-bottom: 12px; }

.task-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; padding: 0 24px; }
.task-card { display: flex; gap: 10px; padding: 14px; border-radius: 12px; background: #f9fbfc; border: 1px solid rgba(8,145,178,0.12); }
.task-card--tpl { cursor: pointer; transition: border-color .15s, background .15s; }
.task-card--tpl:hover { border-color: rgba(8,145,178,0.22); background: #fff; }
.task-card--added { background: rgba(8,145,178,0.04); border-color: rgba(8,145,178,0.25); }
.task-icon { font-size: 20px; flex-shrink: 0; margin-top: 2px; }
.task-info { flex: 1; min-width: 0; }
.task-name { font-size: 13px; font-weight: 600; color: #1a2332; margin: 0 0 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.task-desc { font-size: 11px; color: #6b7280; line-height: 1.4; margin: 0 0 10px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.task-foot { display: flex; align-items: center; justify-content: space-between; }
.task-freq { font-size: 10px; padding: 2px 6px; border-radius: 4px; background: rgba(8,145,178,0.07); color: #0891b2; }
.task-status { display: flex; align-items: center; gap: 6px; font-size: 10px; color: #10b981; }
.status-dot { width: 6px; height: 6px; border-radius: 50%; display: inline-block; }
.status-dot--green { background: #10b981; }
.task-add-btn { padding: 4px 8px; border: none; border-radius: 6px; background: rgba(8,145,178,0.08); color: #0891b2; font-size: 11px; font-weight: 500; font-family: inherit; cursor: pointer; }
.task-add-btn--added { background: rgba(16,185,129,0.1); color: #059669; }

.tpl-section { margin-top: 32px; padding-bottom: 32px; }
.tpl-section-title { padding: 0 24px; margin-bottom: 12px; }

.logs-header { display: flex; align-items: center; justify-content: space-between; padding: 20px 24px 16px; }
.logs-range { font-size: 12px; color: #9ca3af; }
.logs-table { margin: 0 24px; border-radius: 12px; border: 1px solid rgba(8,145,178,0.12); overflow: hidden; }
.logs-table-head { display: grid; grid-template-columns: repeat(4, 1fr); padding: 10px 16px; background: rgba(8,145,178,0.04); border-bottom: 1px solid rgba(8,145,178,0.1); font-size: 11px; font-weight: 600; color: #6b7f95; }
.logs-row { display: grid; grid-template-columns: repeat(4, 1fr); align-items: center; padding: 12px 16px; font-size: 12px; transition: background .15s; }
.logs-row:hover { background: rgba(8,145,178,0.03); }
.logs-name { color: #1a2332; font-weight: 500; }
.logs-time, .logs-dur { color: #6b7280; }
.logs-status-cell { display: flex; align-items: center; gap: 6px; font-size: 12px; }
.logs-retry { margin-left: auto; padding: 2px 8px; border: none; border-radius: 6px; background: rgba(239,68,68,0.08); color: #ef4444; font-size: 11px; font-family: inherit; cursor: pointer; opacity: 0; transition: opacity .15s; }
.logs-row:hover .logs-retry { opacity: 1; }

.stats-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; padding: 20px 24px 32px; }
.stat-card { padding: 16px; border-radius: 12px; background: #f9fbfc; border: 1px solid rgba(8,145,178,0.1); }
.stat-label { font-size: 11px; color: #6b7f95; margin: 0 0 4px; }
.stat-value { font-size: 24px; font-weight: 700; margin: 0 0 2px; }
.stat-sub { font-size: 10px; color: #9ca3af; margin: 0; }

/* Modal */
.modal-mask { position: fixed; inset: 0; z-index: 50; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.3); backdrop-filter: blur(4px); }
.modal-card { width: 420px; background: #fff; border-radius: 16px; border: 1px solid rgba(8,145,178,0.15); box-shadow: 0 20px 60px rgba(0,0,0,0.15); overflow: hidden; }
.modal-header { display: flex; align-items: center; justify-content: space-between; padding: 16px 24px; border-bottom: 1px solid rgba(8,145,178,0.08); font-size: 14px; font-weight: 600; color: #1a2332; }
.modal-close { border: none; background: transparent; color: #9ca3af; cursor: pointer; padding: 4px; }
.modal-body { padding: 20px 24px; display: flex; flex-direction: column; gap: 12px; }
.modal-label { font-size: 12px; font-weight: 500; color: #374151; }
.modal-input, .modal-textarea { width: 100%; padding: 10px 12px; border: 1.5px solid rgba(8,145,178,0.2); border-radius: 12px; background: #f5f9fb; outline: none; font-size: 14px; font-family: inherit; color: #1a2332; box-sizing: border-box; resize: none; }
.modal-input::placeholder, .modal-textarea::placeholder { color: #9ca3af; }
.modal-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.modal-footer { display: flex; gap: 8px; padding: 0 24px 20px; }
.modal-btn { flex: 1; padding: 10px; border: none; border-radius: 12px; font-size: 14px; font-weight: 500; font-family: inherit; cursor: pointer; }
.modal-btn--cancel { background: #f0f6fa; color: #6b7f95; }
.modal-btn--confirm { background: linear-gradient(135deg,#0891b2,#0e7490); color: #fff; box-shadow: 0 2px 10px rgba(8,145,178,0.3); }
.modal-enter-active, .modal-leave-active { transition: opacity .2s; }
.modal-enter-active .modal-card, .modal-leave-active .modal-card { transition: transform .2s; }
.modal-enter-from, .modal-leave-to { opacity: 0; }
.modal-enter-from .modal-card { transform: scale(0.92); }
.modal-leave-to .modal-card { transform: scale(0.92); }

.fade-enter-active, .fade-leave-active { transition: opacity .18s, transform .18s; }
.fade-enter-from { opacity: 0; transform: translateY(6px); }
.fade-leave-to { opacity: 0; }

@media (max-width: 1024px) { .task-grid { grid-template-columns: repeat(2, 1fr); } .stats-grid { grid-template-columns: repeat(3, 1fr); } }
@media (max-width: 768px) { .task-grid { grid-template-columns: 1fr; } .stats-grid { grid-template-columns: 1fr; } .modal-card { width: 90vw; } .auto-tabs { padding: 12px 16px 0; } }
</style>

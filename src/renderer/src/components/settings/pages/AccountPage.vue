<script setup lang="ts">
defineEmits<{
  logout: []
}>()

const credits: { title: string; date: string; total: string; remaining: string }[] = [
  { title: '版本基础用量', date: '下次权益周期更新时间: 2026-09-01 00:00:00', total: '500', remaining: '500' },
  { title: '权益赠送包', date: '到期日期: 2026-08-18 20:48:25', total: '1,500', remaining: '962.62' },
  { title: '权益赠送包', date: '到期日期: 2026-08-21 07:38:54', total: '100', remaining: '100' },
  { title: '权益赠送包', date: '到期日期: 2026-08-22 09:31:59', total: '100', remaining: '100' },
  { title: '权益赠送包', date: '到期日期: 2026-08-23 09:15:51', total: '100', remaining: '100' },
  { title: '权益赠送包', date: '到期日期: 2026-08-24 07:34:53', total: '100', remaining: '100' },
]
</script>

<template>
  <div class="s-page">
    <!-- 账户 -->
    <section class="s-card">
      <div class="s-row">
        <div class="s-account">
          <div class="s-avatar">
            青
          </div>
          <div>
            <h2 class="s-sec-title">
              Ke-Work
            </h2>
            <p class="s-desc s-desc--mt">
              Ke-Work
            </p>
          </div>
        </div>
        <button class="s-manage-btn">
          前往管理中心
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      </div>
    </section>

    <button
      class="s-logout-btn"
      @click="$emit('logout')"
    >
      退出登录
    </button>

    <!-- 体验版 / Credits -->
    <section class="s-card">
      <div class="s-plan-top">
        <div>
          <h2 class="s-sec-title">
            体验版
          </h2>
          <p class="s-desc s-desc--mt">
            版本到期时间：2034-10-18 20:48:24
          </p>
        </div>
        <button class="s-upgrade-btn">
          升级
        </button>
      </div>
      <div class="s-hairline" />
      <div class="s-credits">
        <div class="s-credits-left">
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path
              d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"
            />
          </svg>
          <span class="s-credits-name">Credits</span>
          <button class="s-detail-btn">
            查看明细
          </button>
        </div>
        <div class="s-credits-right">
          <span class="s-credits-label">累计剩余:</span>
          <strong class="s-credits-num">2,862.62</strong>
        </div>
      </div>
      <div class="s-credit-rows">
        <div
          v-for="item in credits"
          :key="`${item.date}-${item.title}`"
          class="s-credit-row"
        >
          <div>
            <h3 class="s-sec-title">
              {{ item.title }}
            </h3>
            <p class="s-desc s-desc--mt">
              {{ item.date }}
            </p>
          </div>
          <div class="s-credit-amounts">
            <p>总量： <span>{{ item.total }}</span></p>
            <p>剩余： <span>{{ item.remaining }}</span></p>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.s-page {
  max-width: 1060px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding-bottom: 32px;
}

.s-desc--mt {
  margin-top: 4px;
}

.s-account {
  display: flex;
  align-items: center;
  gap: 16px;
}

.s-avatar {
  width: 52px;
  height: 52px;
  border-radius: 50%;
  background: #3b82f6;
  color: #fff;
  font-size: 22px;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.s-manage-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: none;
  background: none;
  border-radius: 8px;
  padding: 6px 8px;
  font-size: 13px;
  color: #59636b;
  cursor: pointer;
  transition: background-color 0.15s ease, color 0.15s ease;
}

.s-manage-btn:hover {
  background: #fff;
  color: #1a2332;
}

.s-logout-btn {
  align-self: flex-start;
  border: 1px solid #dde1e3;
  background: #fff;
  border-radius: 8px;
  padding: 8px 12px;
  font-size: 13px;
  color: #59636b;
  cursor: pointer;
  transition: background-color 0.15s ease, color 0.15s ease;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
}

.s-logout-btn:hover {
  background: #f7f9fb;
  color: #1a2332;
}

.s-plan-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.s-upgrade-btn {
  border: none;
  border-radius: 8px;
  background: #17191b;
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  padding: 6px 12px;
  cursor: pointer;
  transition: opacity 0.15s ease;
}

.s-upgrade-btn:hover {
  opacity: 0.85;
}

.s-hairline {
  height: 1px;
  background: #e1e5e6;
  margin: 16px 0;
}

.s-credits {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding-bottom: 12px;
}

.s-credits-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.s-credits-left svg {
  color: #9ba2a6;
}

.s-credits-name {
  font-size: 15px;
  color: #22282c;
}

.s-detail-btn {
  border: 1px solid #f0f1f2;
  background: #fff;
  border-radius: 8px;
  padding: 8px 12px;
  font-size: 13px;
  font-weight: 500;
  color: #22282c;
  cursor: pointer;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
}

.s-credits-right {
  display: flex;
  align-items: baseline;
  gap: 8px;
  text-align: right;
}

.s-credits-label {
  font-size: 13px;
  color: #747d83;
}

.s-credits-num {
  font-size: 18px;
  font-weight: 600;
  letter-spacing: -0.02em;
  color: #101416;
}

.s-credit-rows {
  border-top: 1px solid #e1e5e6;
}

.s-credit-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 12px 0;
  border-bottom: 1px solid #e1e5e6;
}

.s-credit-row:last-child {
  border-bottom: none;
}

.s-credit-amounts {
  min-width: 120px;
  text-align: right;
  font-size: 13px;
  color: #5f676d;
  line-height: 1.7;
}

.s-credit-amounts span {
  font-weight: 500;
  color: #252b2f;
}
</style>

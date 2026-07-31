import { defineStore } from 'pinia'
import { ref } from 'vue'

export type WorkMode = 'local' | 'cloud'

export const useWorkModeStore = defineStore('workMode', () => {
  const mode = ref<WorkMode>('local')

  function setMode(next: WorkMode): void {
    mode.value = next
  }

  return { mode, setMode }
})

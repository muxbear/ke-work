import { ElectronAPI } from '@electron-toolkit/preload'

interface AgentAPI {
  openExternal: (url: string) => Promise<void>
  sendAgentMessage(
    messages: Array<{ role: string; content: string }>
  ): Promise<{ success: boolean; error?: string }>
  cancelAgentMessage(): void
  onAgentChunk(callback: (chunk: string) => void): () => void
  onAgentThinking(callback: (chunk: string) => void): () => void
  onAgentThinkingDone(callback: () => void): () => void
  onAgentDone(callback: () => void): () => void
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: AgentAPI
  }
}

/// <reference types="vite/client" />
import type { KeWorkWindowApi } from '../../preload'
import type { ElectronAPI } from '@electron-toolkit/preload'

declare global {
  interface Window {
    electron: ElectronAPI
    api: KeWorkWindowApi
  }
}

export {}

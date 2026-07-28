/// <reference types="vite/client" />

declare global {
  interface Window {
    api: {
      openExternal: (url: string) => Promise<void>
      openWeChatAuth: (
        authUrl: string,
        redirectUri: string
      ) => Promise<{ code?: string; error?: string }>
    }
  }
}

export {}

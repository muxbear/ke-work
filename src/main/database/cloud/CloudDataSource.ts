import axios, { AxiosError, type AxiosInstance } from 'axios'

/** 云端 API 业务错误（HTTP 错误与业务错误码统一归一化） */
export class CloudApiError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly code?: number
  ) {
    super(message)
    this.name = 'CloudApiError'
  }
}

export interface CloudTokenStore {
  getAccessToken(): string | null
}

interface CloudOptions {
  baseUrl: string
  timeoutMs?: number
}

interface ApiEnvelope<T = unknown> {
  code: number
  data: T
  message?: string
}

/**
 * 云端数据源：axios 封装
 * - 自动注入 Authorization
 * - 401 时通过 onUnauthorized 回调刷新 token 并单飞重试
 * - 响应统一解包 {code, data}
 */
export class CloudDataSource {
  private readonly client: AxiosInstance
  private tokenStore: CloudTokenStore | null = null
  private onUnauthorized: (() => Promise<boolean>) | null = null
  private refreshPromise: Promise<boolean> | null = null
  /** 401 重试标记：每个请求最多刷新重试一次，防止刷新后仍 401 时无限循环 */
  private unauthorizedRetried = false

  constructor(options: CloudOptions) {
    this.client = axios.create({
      baseURL: options.baseUrl,
      timeout: options.timeoutMs ?? 10_000
    })
    // 请求拦截：注入 Authorization
    this.client.interceptors.request.use((config) => {
      const token = this.tokenStore?.getAccessToken()
      if (token) {
        config.headers.Authorization = `Bearer ${token}`
      }
      return config
    })
    // 响应拦截：解包 + 401 刷新重试
    this.client.interceptors.response.use(
      (response) => {
        const envelope = response.data as ApiEnvelope
        if (envelope && typeof envelope.code === 'number' && envelope.code !== 0) {
          throw new CloudApiError(envelope.message ?? '请求失败', response.status, envelope.code)
        }
        return (envelope?.data as T) ?? (response.data as T)
      },
      async (error: AxiosError) => {
        if (error.response?.status === 401) {
          if (this.onUnauthorized && !this.unauthorizedRetried) {
            // 刷新一次并重试；重试期间保持标记，重试请求若仍 401 直接抛错
            this.unauthorizedRetried = true
            const refreshed = await this.retryOnce()
            if (refreshed) {
              const config = error.config!
              const token = this.tokenStore?.getAccessToken()
              if (token) config.headers.Authorization = `Bearer ${token}`
              return this.client.request(config).finally(() => {
                this.unauthorizedRetried = false
              })
            }
            this.unauthorizedRetried = false
          }
          throw new CloudApiError('登录已过期，请重新登录', 401)
        }
        if (error.response) {
          const body = error.response.data as { message?: string; code?: number } | undefined
          throw new CloudApiError(
            body?.message ?? `请求失败 (HTTP ${error.response.status})`,
            error.response.status,
            body?.code
          )
        }
        if (error.code === 'ECONNABORTED') {
          throw new CloudApiError('请求超时，请稍后重试')
        }
        throw new CloudApiError('网络连接失败，请检查网络')
      }
    )
  }

  /** 注入 token 提供器 */
  setTokenStore(store: CloudTokenStore): void {
    this.tokenStore = store
  }

  /** 注入 401 刷新回调；返回 true 表示刷新成功 */
  setUnauthorizedHandler(handler: () => Promise<boolean>): void {
    this.onUnauthorized = handler
  }

  /** 401 刷新单飞：并发请求共享同一次刷新 */
  private retryOnce(): Promise<boolean> {
    if (!this.refreshPromise) {
      this.refreshPromise = (this.onUnauthorized?.() ?? Promise.resolve(false))
        .catch(() => false)
        .finally(() => {
          this.refreshPromise = null
        })
    }
    return this.refreshPromise
  }

  get<T>(url: string, params?: Record<string, unknown>): Promise<T> {
    return this.client.get(url, { params }) as Promise<T>
  }

  post<T>(url: string, body?: unknown): Promise<T> {
    return this.client.post(url, body) as Promise<T>
  }

  patch<T>(url: string, body?: unknown): Promise<T> {
    return this.client.patch(url, body) as Promise<T>
  }

  put<T>(url: string, body?: unknown): Promise<T> {
    return this.client.put(url, body) as Promise<T>
  }

  delete<T>(url: string): Promise<T> {
    return this.client.delete(url) as Promise<T>
  }
}

import type { CloudDataSource } from './CloudDataSource'
import type { IConfigRepository } from '../interfaces/IConfigRepository'

/** 云端配置实现（HTTP 适配） */
export class CloudConfigRepository implements IConfigRepository {
  constructor(private readonly ds: CloudDataSource) {}

  async get(key: string): Promise<string | null> {
    const value = await this.ds.get<string>(`/api/config/${key}`)
    return value ?? null
  }

  async set(key: string, value: string): Promise<void> {
    await this.ds.put(`/api/config/${key}`, { value })
  }

  async delete(key: string): Promise<void> {
    await this.ds.delete(`/api/config/${key}`)
  }

  async getAll(): Promise<Record<string, string>> {
    return this.ds.get<Record<string, string>>('/api/config')
  }
}

/** 配置键值存储接口（本地 SQLite / 云端 API 共用契约） */
export interface IConfigRepository {
  get(key: string): Promise<string | null>
  set(key: string, value: string): Promise<void>
  delete(key: string): Promise<void>
  getAll(): Promise<Record<string, string>>
}

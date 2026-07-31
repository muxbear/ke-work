import { readFileSync } from 'fs'

/** 支持的操作系统类型 */
export type OSType = 'windows' | 'macos' | 'ubuntu' | 'uos' | 'kylin' | 'harmonyos' | 'linux'

/** Linux 发行版 ID 到 OSType 的映射 */
const DISTRO_MAP: Record<string, OSType> = {
  uos: 'uos',
  deepin: 'uos',
  kylin: 'kylin',
  ubuntu: 'ubuntu',
  openharmony: 'harmonyos'
}

let cachedType: OSType | null = null

/**
 * 解析 /etc/os-release 文件获取发行版 ID
 * @returns 发行版 ID 小写字符串，解析失败返回 undefined
 */
function parseOSRelease(): string | undefined {
  try {
    const content = readFileSync('/etc/os-release', 'utf-8')
    const match = content.match(/^ID="?([^"\n]+)"?$/m)
    return match?.[1]?.toLowerCase()
  } catch {
    return undefined
  }
}

/**
 * 执行操作系统检测，结果会被缓存
 * @returns 标准化的操作系统标识
 */
export function detectOS(): OSType {
  if (cachedType) return cachedType

  if (process.platform === 'win32') {
    cachedType = 'windows'
  } else if (process.platform === 'darwin') {
    cachedType = 'macos'
  } else if (process.platform === 'linux') {
    const distroId = parseOSRelease()
    cachedType = (distroId ? DISTRO_MAP[distroId] : undefined) ?? 'linux'
  } else {
    cachedType = 'linux'
  }

  console.log(`[platform] detected OS: ${cachedType}`)
  return cachedType
}

/**
 * 获取已缓存的操作系统类型（不重新检测）
 * @returns 标准化的操作系统标识
 */
export function getOSType(): OSType {
  if (!cachedType) {
    return detectOS()
  }
  return cachedType
}

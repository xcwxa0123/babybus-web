// Redis 连接工具（懒连接 + 容错：Redis 不可用时静默降级，不影响主流程）
import Redis from 'ioredis'
import type { Redis as RedisClient } from 'ioredis'

let redis: RedisClient | null = null
let connecting = false

// 获取 Redis 客户端（懒创建单例）
// 优先从 runtimeConfig 读取地址，其次环境变量
export function getRedis(): RedisClient | null {
  if (redis) return redis
  if (connecting) return null // 正在连接中，避免重复创建

  const url = useRuntimeConfig().public.redisUrl || process.env.NUXT_PUBLIC_REDIS_URL || ''
  if (!url) return null // 未配置 Redis，静默降级

  connecting = true
  try {
    redis = new Redis(url, {
      lazyConnect: false, // 自动连接
      maxRetriesPerRequest: 1, // 单次请求失败不重试太多
      retryStrategy: (times) => {
        // 失败后延迟重试（指数退避，上限 30s），Redis 恢复后自动重连
        return Math.min(times * 500, 30000)
      },
    })
    redis.on('error', (err) => {
      // 只打印日志，不抛出异常，避免影响主流程
      console.error('[redis] 连接错误:', err.message)
    })
    redis.on('connect', () => {
      console.log('[redis] 连接成功')
    })
    return redis
  } catch (e) {
    console.error('[redis] 初始化失败:', (e as Error).message)
    return null
  } finally {
    connecting = false
  }
}

// 读取 JSON 缓存
export async function redisGetJson(key: string): Promise<any | null> {
  const client = getRedis()
  if (!client) return null
  try {
    const val = await client.get(key)
    return val ? JSON.parse(val) : null
  } catch (e) {
    console.error('[redis] 读取失败:', (e as Error).message)
    return null
  }
}

// 写入 JSON 缓存（带过期时间，单位秒）
export async function redisSetJson(key: string, value: any, ttlSeconds = 3600): Promise<void> {
  const client = getRedis()
  if (!client) return
  try {
    await client.set(key, JSON.stringify(value), 'EX', ttlSeconds)
  } catch (e) {
    console.error('[redis] 写入失败:', (e as Error).message)
  }
}

// 删除缓存（数据更新时调用）
export async function redisDel(pattern: string): Promise<void> {
  const client = getRedis()
  if (!client) return
  try {
    const keys = await client.keys(pattern)
    if (keys.length) await client.del(keys)
  } catch (e) {
    console.error('[redis] 删除失败:', (e as Error).message)
  }
}

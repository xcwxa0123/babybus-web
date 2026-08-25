import Database from 'better-sqlite3'
import { existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

const config = useRuntimeConfig()

// 兼容 NUXT_PUBLIC_DB_PATH 与 DB_PATH 两种环境变量写法
const dbDir = join(process.cwd(), 'data')
const dbPath = config.public.dbPath || process.env.DB_PATH || join(dbDir, 'local.db')

if (!existsSync(dbDir)) {
  mkdirSync(dbDir, { recursive: true })
}

let db: Database.Database | null = null

// 连接单例：整个服务只打开一次数据库
export function getDb(): Database.Database {
  if (!db) {
    db = new Database(dbPath)
    db.pragma('journal_mode = WAL')
    db.pragma('foreign_keys = ON')
    initTables(db)
  }
  return db
}

// 建表（IF NOT EXISTS，重复启动不会报错）
function initTables(database: Database.Database) {
  database.exec(`
    -- 公交线路表
    CREATE TABLE IF NOT EXISTS bus_lines (
      id          TEXT PRIMARY KEY,   -- 公交线路 id（高德 busid）
      type        TEXT,               -- 公交类型
      name        TEXT NOT NULL,      -- 线路名称
      polyline    TEXT,               -- 坐标串 lng,lat;lng,lat
      citycode    TEXT,
      start_stop  TEXT,               -- 首发站
      end_stop    TEXT,               -- 末站
      start_time  TEXT,               -- 首班车
      end_time    TEXT,               -- 末班车
      uicolor     TEXT,               -- 线路 UI 颜色
      timedesc    TEXT,               -- 详细时间（解析后的字符串）
      distance    REAL,               -- 全程里程 公里
      loop        INTEGER,            -- 0否 1是
      status      INTEGER,            -- 0停运 1正常 2规划中 3在建
      direc       TEXT,               -- 反向线路 id
      company     TEXT,               -- 所属公司
      basic_price REAL,               -- 起步价
      total_price REAL,               -- 全程票价
      bounds      TEXT,               -- 矩形区域
      created_at  TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );

    -- 公交站点表（去重，一站点一行）
    CREATE TABLE IF NOT EXISTS bus_stops (
      id         TEXT PRIMARY KEY,    -- 公交站 id（高德 busstopid）
      name       TEXT NOT NULL,       -- 站名
      location   TEXT,                -- 经纬度 "lng,lat"
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );

    -- 线路-站点序列表（一行一站，seq 即站点在该线路上的顺序）
    CREATE TABLE IF NOT EXISTS bus_stop_sequences (
      bus_id  TEXT    NOT NULL REFERENCES bus_lines(id) ON DELETE CASCADE,
      stop_id TEXT    NOT NULL REFERENCES bus_stops(id),
      seq     INTEGER NOT NULL,       -- 从 1 开始
      PRIMARY KEY (bus_id, stop_id, seq)
    );
    CREATE INDEX IF NOT EXISTS idx_seq_bus ON bus_stop_sequences (bus_id, seq);
  `)
}

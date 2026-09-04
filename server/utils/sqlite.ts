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

        -- 高德城市编码表（name / adcode / citycode 对照）
        CREATE TABLE IF NOT EXISTS city_codes (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            name       TEXT NOT NULL,          -- 城市/区县名称
            adcode     TEXT,                   -- 行政区划编码（保留前导零）
            citycode   TEXT,                   -- 城市电话区号（可能为空）
            created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
        );

        CREATE INDEX IF NOT EXISTS idx_city_codes_adcode ON city_codes (adcode);
        CREATE INDEX IF NOT EXISTS idx_city_codes_citycode ON city_codes (citycode);
        CREATE INDEX IF NOT EXISTS idx_city_codes_name ON city_codes (name);

        -- 用户名密码表
        CREATE TABLE IF NOT EXISTS users (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            user_name   TEXT NOT NULL UNIQUE,
            password    TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_users_user_name ON users (user_name);

        -- 用户信息表
        CREATE TABLE IF NOT EXISTS user_info (
            id              INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
            email           TEXT DEFAULT NULL,
            phone           TEXT DEFAULT NULL,
            avatar          TEXT DEFAULT NULL,
            nickname        TEXT DEFAULT NULL,
            gender          TEXT DEFAULT NULL,
            birthday        TEXT DEFAULT NULL,
            signature       TEXT DEFAULT NULL,
            introduction    TEXT DEFAULT NULL,
            status          INTEGER DEFAULT 1,
            created_at      TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
            updated_at      TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
            last_login      TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
            last_ip         TEXT DEFAULT NULL,
            last_device     TEXT DEFAULT NULL,
            last_city       TEXT DEFAULT NULL,
            last_country    TEXT DEFAULT NULL,
            last_province   TEXT DEFAULT NULL,
            last_region     TEXT DEFAULT NULL
        );

        CREATE TABLE IF NOT EXISTS done_num_citycode (
            citycode   TEXT PRIMARY KEY,
            done_num   INTEGER NOT NULL DEFAULT 0,   -- 已爬取的 index
            total_num  INTEGER NOT NULL DEFAULT 999, -- 本次任务总目标（可配置）
            status     INTEGER NOT NULL DEFAULT 0,   -- 0: 爬取中, 1: 已完成
            updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
        );

        INSERT OR IGNORE INTO done_num_citycode (citycode, done_num) 
            SELECT DISTINCT citycode, 0 FROM city_codes WHERE citycode IS NOT NULL;
    `)
}

# 🚌 BabyBus 公交查询地图

> **版本：v1.0.0** · 基于 **Nuxt 4** · 高德地图 + SQLite

基于 **Nuxt 4** 的公交线路查询与地图可视化应用。支持从高德地图拉取公交线路数据存入本地 SQLite，在交互式地图上多线路渲染、站点展示、正反向切换，以及线路数据的增删改查。

## ✅ 当前已实现功能

- 高德公交线路拉取与本地 SQLite 存储（三表结构）
- 线路数据增删改查、关键词搜索、分页懒加载
- 循环拉取脚本任务（keyword 区间可配、自动跳过已入库）
- 地图多线路彩色渲染、站点空心圆点 + 站名标注
- 点击线路反查站点 → 候选线路弹窗选择
- 选中线路高亮 + 其它线路淡化
- 底部详情弹框（完整字段 + 解析后的时刻表 + 站点列表、可折叠）
- 正反向线路一键切换
- 左侧线路列表锚中联动 + 平滑滚动
- 浅色极简底图样式（whitesmoke）

## ✨ 功能特性

- **线路数据管理**
  - 从高德地图 API 拉取公交线路并入库（`bus_lines` / `bus_stops` / `bus_stop_sequences` 三张表）
  - 线路的增删改查（含按线路名/站点关键词搜索、分页）
  - 循环拉取任务：按 keyword 区间（1~999）定时批量抓取，自动跳过已入库线路
  - 同一线路的正反向去重（`direc` 互为对方 id 只存一条）

- **地图可视化**（`Map.vue`，基于高德 JS API 2.0）
  - 多线路同时渲染，自动分配不同颜色
  - 点击线路：反查附近站点 → 列出所有经过该站点的线路供选择
  - 选中线路高亮 + 淡化其它线路，左侧列表同步锚中并平滑滚动
  - 站点：空心圆点 + 站名标注，图层在线路之上
  - 底部详情弹框：展示线路完整信息（含解析后的时刻表、站点列表）
  - 正反向线路一键切换（更换渲染颜色与对应线路）

## 🧱 技术栈

| 层 | 技术 |
|---|---|
| 前端框架 | Nuxt 4（Vue 3 + Vite） |
| UI 组件 | Element Plus |
| 地图 | 高德地图 JS API 2.0（`@amap/amap-jsapi-loader`） |
| 数据库 | SQLite（`better-sqlite3`，本地文件存储） |
| 服务端 | Nuxt Nitro（`server/` 目录） |

## 📁 项目结构

```
.
├── app/                        # 前端页面与组件
│   ├── pages/
│   │   ├── buslines.vue        # 线路管理页（CRUD + 循环拉取）
│   │   └── busmap.vue          # 地图可视化页
│   └── components/
│       └── Map.vue             # 地图组件（多线路渲染/选中/反向切换）
├── server/                     # Nitro 服务端
│   ├── api/
│   │   ├── buslines/           # 线路 CRUD + 批量地图数据接口
│   │   └── mapApi/             # 高德地图数据拉取接口
│   └── utils/
│       ├── sqlite.ts           # SQLite 连接与建表
│       ├── busmapApi.ts        # 高德 API 封装
│       └── autoResponseBody.ts # 统一响应格式
├── data/                       # 本地 SQLite 数据库文件（运行时生成）
├── nuxt.config.ts
├── .env.example                # 示例用开发环境变量 参考.env.example
├── .env.development            # 开发环境变量 参考.env.example 填写自己的key
├── .env.production             # 生产环境变量 参考.env.example 填写自己的key
└── package.json
```

## 🚀 快速开始

### 环境要求

- Node.js ≥ 20
- 高德地图开放平台 Key（Web 服务 + JS API 两个）

### 安装与运行

```bash
# 1. 安装依赖
npm install

# 2. 配置环境变量（复制并填写）
cp .env.example .env.development
#   修改 .env.development：
#   NUXT_PUBLIC_BUS_SEARCH_KEY = 你的高德 Web 服务 Key
#   NUXT_PUBLIC_MAPSC_KEY      = 你的高德 JS API Key
#   NUXT_PUBLIC_MAPSC          = 你的高德 JS API 安全密钥
#   NUXT_PUBLIC_DB_PATH        = ./data/local.db

# 3. 启动开发服务器
npm run dev
#   打开 http://localhost:3000
```

> 数据库文件会在首次启动时自动创建到 `data/local.db`（无需手动建库）。

### 生产部署（PM2）

```bash
npm run build
```

## 📄 使用说明

### 线路管理页（`/buslines`）

1. 输入城市 code 和线路关键词，点「拉取并入库」抓取线路
2. 使用「循环拉取脚本任务」按 keyword 区间批量抓取（可配起始/截止、每 1 秒一次、个人用账号每天有上限，大概一百多次）
3. 列表支持搜索、分页、编辑、删除

### 地图页（`/busmap`）

1. 输入关键词（如「龙口」）加载线路
2. 点击地图上的线路：若附近多线经过则弹候选窗选择，选中后高亮并显示详情
3. 点击左侧列表或地图线路，均可锚中并滚动
4. 底部详情弹框可展开/收起，支持正反向线路切换

## 🔌 API 接口

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/buslines` | 线路列表（支持 `keyword`/`page`/`pageSize`） |
| GET | `/api/buslines/:id` | 线路详情（含有序站点） |
| GET | `/api/buslines/map` | 批量线路数据（含 polyline + 站点，用于地图） |
| POST | `/api/buslines/save` | 保存线路（已存在则跳过） |
| PUT | `/api/buslines/:id` | 更新线路 |
| DELETE | `/api/buslines/:id` | 删除线路 |
| POST | `/api/mapApi/getBusmapList` | 从高德拉取线路 |

## 🗄️ 数据表结构

- **bus_lines**：公交线路（id/name/type/polyline/citycode/start_stop/end_stop/start_time/end_time/uicolor/timedesc/distance/loop/status/direc/company/basic_price/total_price/bounds）
- **bus_stops**：公交站点（id/name/location，多线路共用去重）
- **bus_stop_sequences**：线路-站点关联（bus_id/stop_id/seq，一行一站）

## 📃 License

[MIT](./LICENSE) © xcwxa0123

<template>
    <div class="map-wrapper">
        <!-- 左侧控制面板：搜索 + 线路列表 -->
        <div class="panel" :class="{ collapsed: sidebarCollapsed, detailOpen: isDetailExpanded }">
            <div class="panel-header">
                <template v-if="!sidebarCollapsed">
                    <el-input v-model="keywordInput" size="default" placeholder="搜索线路，如：龙口" clearable
                        @keyup.enter="reload">
                        <!-- <template #suffix>
            </template> -->
                    </el-input>
                </template>
                <el-button class="search-btn" @click="reload" v-if="!sidebarCollapsed"><el-icon><Search /></el-icon></el-button>
                <el-button class="collapse-btn" @click="sidebarCollapsed = !sidebarCollapsed"
                    :title="sidebarCollapsed ? '展开' : '收起'">
                    <el-icon v-if="sidebarCollapsed"><ArrowLeft /></el-icon>
                    <el-icon v-else><ArrowRight /></el-icon>
                </el-button>
            </div>

            <div v-show="!sidebarCollapsed" class="panel-body">
                <div class="panel-subhead">
                    <span>线路列表</span>
                    <span class="count-badge">{{ lines.length }}</span>
                </div>

                <div v-if="loading" class="state-msg">加载中…</div>
                <div v-else-if="loadError" class="state-msg error">{{ loadError }}</div>
                <div v-else-if="lines.length === 0" class="state-msg">未找到相关线路</div>

                <div v-else ref="listScrollbarRef" class="panel-scrollbar">
                    <div v-for="line in lines" :key="line.id" :ref="(el) => setLineItemRef(line.id, el)"
                        class="line-item"
                        :class="{ active: activeId === line.id }" :style="{ '--line-color': line.color }"
                        @click="focusLine(line.id)" @mouseenter="previewLine(line.id)"
                        @mouseleave="unpreviewLine(line.id)">
                        <span class="color-dot"></span>
                        <span class="line-name" :title="line.name">{{ line.name }}</span>
                        <span v-if="line.busstops?.length" class="stop-count">{{ line.busstops.length }}站</span>
                    </div>
                </div>
            </div>
        </div>

        <!-- 地图 -->
        <div ref="mapRef" class="map"></div>
        <div v-if="loading" class="map-loading-mask">地图加载中…</div>

        <!-- 点击命中多条线路时的候选弹窗 -->
        <div v-if="candidatePopup.visible" class="candidate-popup"
            :style="{ left: candidatePopup.x + 'px', top: candidatePopup.y + 'px' }">
            <div class="candidate-title">经过此处（{{ candidatePopup.lines.length }} 条线路）</div>
            <div v-for="c in candidatePopup.lines" :key="c.id" class="candidate-item"
                :class="{ active: activeId === c.id }" :style="{ '--line-color': c.color }"
                @mouseenter="hoverCandidate(c.id)" @mouseleave="unpreviewLine(c.id)" @click="confirmCandidate(c.id)">
                <span class="color-dot"></span>
                <span class="candidate-name">{{ c.name }}</span>
            </div>
        </div>

        <!-- 底部信息弹框：当前选中线路 -->
        <div class="detail-bar" :class="{ collapsed: bottombarCollapsed }">
            <div class="detail-header">
                <div class="detail-title" v-show="!bottombarCollapsed">
                    <span class="color-dot" :style="{ background: currentDisplay?.color }"></span>
                    <span class="detail-name">{{ currentDisplay?.name }}</span>
                    <el-tag v-if="isReverse" size="small" type="warning">反向</el-tag>
                </div>
                <div class="detail-header-actions">
                    <el-button v-show="!bottombarCollapsed" size="small" type="primary" plain :disabled="!detailOpposite" @click="toggleReverse">
                        {{ isReverse ? '切换到正向' : '切换反向' }}
                    </el-button>
                    <el-button class="collapse-btn" @click="bottombarCollapsed = !bottombarCollapsed" :title="bottombarCollapsed ? '展开' : '收起'">
                        <el-icon v-if="bottombarCollapsed"><ArrowUp /></el-icon>
                        <el-icon v-else><ArrowDown /></el-icon>
                    </el-button>
                </div>
            </div>

            <div class="detail-body" :class="{ collapsed: bottombarCollapsed }">
                <div class="detail-inner">
                    <div class="detail-grid">
                        <div class="detail-item"><span class="label">类型</span>{{ currentDisplay?.type || '-' }}</div>
                        <div class="detail-item"><span class="label">首发站</span>{{ currentDisplay?.start_stop || '-' }}</div>
                        <div class="detail-item"><span class="label">末站</span>{{ currentDisplay?.end_stop || '-' }}</div>
                        <div class="detail-item"><span class="label">首班</span>{{ currentDisplay?.start_time || '-' }}</div>
                        <div class="detail-item"><span class="label">末班</span>{{ currentDisplay?.end_time || '-' }}</div>
                        <div class="detail-item"><span class="label">全程里程</span>{{ currentDisplay?.distance ?
                            currentDisplay.distance
                            + ' km' : '-' }}</div>
                        <div class="detail-item"><span class="label">起步价</span>{{ String(currentDisplay?.basic_price) ?
                            currentDisplay?.basic_price + ' 元' : '-' }}</div>
                        <div class="detail-item"><span class="label">全程票价</span>{{ String(currentDisplay?.total_price) ?
                            currentDisplay?.total_price + ' 元' : '-' }}</div>
                        <!-- <div class="detail-item"><span class="label">城市</span>{{ currentDisplay.citycode || '-' }}</div> -->
                        <!-- <div class="detail-item"><span class="label">线路ID</span>{{ currentDisplay.id }}</div> -->
                        <div class="detail-item"><span class="label">站点数</span>{{ currentDisplay?.busstops?.length ?? 0 }} 站
                        </div>
                    </div>
                    <div v-if="formatTimeDesc(currentDisplay?.timedesc) !== '-'" class="detail-timedesc">
                        <span class="label">详细时间</span>
                        <span style="white-space: pre-line">{{ formatTimeDesc(currentDisplay?.timedesc) }}</span>
                    </div>
                    <div class="detail-stops">
                        <div class="label" style="margin-bottom: 4px">站点列表</div>
                        <div class="stop-tags">
                            <span v-for="(stop, si) in currentDisplay?.busstops" :key="stop.id" class="stop-tag">{{ si + 1 }}. {{ stop.name }}</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { Search, ArrowLeft, ArrowRight, ArrowUp, ArrowDown } from '@element-plus/icons-vue'
import AMapLoader from "@amap/amap-jsapi-loader";

interface BusStop {
    id: string;
    name: string;
    location: string; // "lng,lat"
}
interface BusLine {
    id: string;
    name: string;
    type?: string;
    uicolor?: string;
    polyline: string;
    citycode?: string;
    start_stop?: string;
    end_stop?: string;
    direc?: string; // 反向线路 id
    start_time?: string;
    end_time?: string;
    distance?: string;
    basic_price?: number;
    total_price?: number;
    timedesc?: string; // URL 编码的 JSON 串
    busstops?: BusStop[];
    color?: string;
}
interface LineLayer {
    polyline: any;
    path: number[][]; // 原始坐标数组（用于命中检测，避免依赖 getPath 返回类型）
    stationOverlays: any[];
}

const props = defineProps<{
    keyword?: string; // 初始查询关键词（默认为空查全量）
}>();

const mapRef = ref<HTMLDivElement | null>(null);
const config = useRuntimeConfig();

const keywordInput = ref(props.keyword ?? "");
const lines = ref<BusLine[]>([]); // 渲染列表（去重后的正向线路）
const allLines = ref<BusLine[]>([]); // 完整数据（含反向，供切换反向使用）
const activeId = ref<string | null>(null);
const sidebarCollapsed = ref(false);
const bottombarCollapsed = ref(false);
const loading = ref(true);
const loadError = ref("");

// 底部详情弹框是否处于展开状态（选中线路且未收起）
const isDetailExpanded = computed(() => !!detailLine.value && !bottombarCollapsed.value);

// 左侧列表滚动容器与线路项的 DOM 引用（用于滚动到选中线路）
const listScrollbarRef = ref<any>(null);
const lineItemRefs = ref<Record<string, HTMLElement | null>>({});
function setLineItemRef(id: string, el: any) {
  if (el) lineItemRefs.value[id] = el;
}

// 滚动左侧列表到指定线路项（带平滑动画）
function scrollToLine(busId: string) {
  const item = lineItemRefs.value[busId];
  if (!item) return;

  // 用浏览器原生 scrollIntoView，自动滚到最近的滚动容器（我们的 panel-scrollbar），
  // 比手动算 offset 更可靠
  try {
    item.scrollIntoView({ behavior: "smooth", block: "center" });
  } catch {
    // 兼容不支持 options 的旧浏览器
    item.scrollIntoView();
  }
}

// 点击命中多条线路时的候选弹窗
const candidatePopup = ref<{
    visible: boolean;
    x: number;
    y: number;
    lines: { id: string; name: string; color: string }[];
}>({ visible: false, x: 0, y: 0, lines: [] });

// 底部信息弹框：当前选中的线路信息
const detailLine = ref<BusLine | null>(null);
const detailOpposite = ref<BusLine | null>(null); // 反向线路（direc 对应）
const isReverse = ref(false); // 是否显示反向线路

// 底部弹框当前展示的线路（显式管理，随正向/反向切换更新）
const currentDisplay = ref<BusLine | null>(null);

// timedesc 处理（逻辑参考 buslines.vue）
function formatTimeDesc(raw: any): string {
    if (!raw) return "-";
    try {
        const decoded = decodeURIComponent(String(raw));
        const parsed = JSON.parse(decoded);
        if (parsed.allRemark) return parsed.allRemark;
        if (Array.isArray(parsed.rule_group) && parsed.rule_group.length) {
            return parsed.rule_group
                .map((g: any) => {
                    const month = g?.date?.month_range || "";
                    const time = (g?.time_group || [])
                        .map((t: any) => {
                            const st = t?.start_time?.slice(0, 5) ?? "";
                            const et = t?.end_time?.slice(0, 5) ?? "";
                            return st && et ? `${st}-${et}` : "";
                        })
                        .filter(Boolean)
                        .join(", ");
                    const interval = g?.time_group?.[0]?.interval_time
                        ? ` ${formatInterval(g.time_group[0].interval_time)}/趟`
                        : "";
                    return [month, time, interval].filter(Boolean).join(" ") || "";
                })
                .filter(Boolean)
                .join("\n");
        }
        return decoded;
    } catch {
        return String(raw);
    }
}

function formatInterval(t: string): string {
    const m = String(t).split(":");
    const hours = Number(m[0]) || 0;
    const mins = Number(m[1]) || 0;
    if (hours && mins) return `${hours}小时${mins}分钟`;
    if (hours) return `${hours}小时`;
    return `${mins}分钟`;
}

// 线路配色：饱和度/明度较高，避免浅色在浅底图上难以辨识，
// 且相邻色号色相尽量拉开，便于视觉区分
const PALETTE = [
    "#e6194b", // 红
    "#3cb44b", // 绿
    "#4363d8", // 蓝
    "#f58231", // 橙
    "#911eb4", // 紫
    "#008080", // 青
    "#e6007e", // 品红
    "#9a6324", // 棕
    "#000075", // 藏青
    "#808000", // 橄榄
    "#ff4500", // 橙红
    "#4b0082", // 靛蓝
    "#2f4f4f", // 墨绿灰
    "#c71585", // 紫红
    "#556b2f", // 深橄榄绿
    "#8b0000", // 深红
];

// 线路样式常量
const STYLE = {
    default: { strokeWeight: 5, strokeOpacity: 0.85, zIndex: 10 },
    preview: { strokeWeight: 5, strokeOpacity: 1, zIndex: 50 },
    active: { strokeWeight: 9, strokeOpacity: 1, zIndex: 100 },
    // 有其他线路被选中/预览时，其它线路淡化的样式
    dimmed: { strokeWeight: 3, strokeOpacity: 0.15, zIndex: 10 },
};

let map: any = null;
let AMap: any = null;
let lineLayers: Record<string, LineLayer> = {};

// 解析 polyline："lng,lat;lng,lat;..."，可能分多段（用 | 分隔）
function parsePolyline(polylineStr: string): number[][][] {
    if (!polylineStr) return [];
    return polylineStr
        .split("|")
        .filter((block) => block !== "")
        .map((block) =>
            block
                .split(";")
                .filter((point) => point !== "")
                .map((point) => {
                    const [lng, lat] = point.split(",").map(Number);
                    return [lng ?? 0, lat ?? 0];
                })
        );
}

// 解析站点经纬度 "lng,lat" -> [lng, lat]
function parseLocation(loc: string): [number, number] | null {
    if (!loc) return null;
    const [lng, lat] = loc.split(",").map(Number);
    if (Number.isNaN(lng) || Number.isNaN(lat)) return null;
    return [lng!, lat!];
}

// 移除某条线路的站点覆盖物
function removeStations(busId: string) {
    const layer = lineLayers[busId];
    if (layer?.stationOverlays.length) {
        layer.stationOverlays.forEach((o) => map.remove(o));
        layer.stationOverlays = [];
    }
}

// 为某条线路创建站点覆盖物（空心圆点 + 站名）
function addStations(busId: string, color: string) {
    // 从完整数据里找（反向线路可能不在渲染列表 lines 里）
    const line = allLines.value.find((l) => l.id === busId);
    const layer = lineLayers[busId];
    if (!line || !layer) return;
    removeStations(busId);

    const overlays: any[] = [];
    (line.busstops || []).forEach((stop) => {
        const pos = parseLocation(stop.location);
        if (!pos) return;

        const circle = new AMap.CircleMarker({
            center: pos,
            radius: 5,
            strokeColor: color,
            strokeWeight: 2,
            strokeOpacity: 1,
            fillColor: "#fff",
            fillOpacity: 0.9,
            zIndex: 200, // 站点图层需在线路（含高亮 zIndex:100）之上
        });
        const text = new AMap.Text({
            position: pos,
            text: stop.name,
            offset: new AMap.Pixel(8, 8),
            style: {
                fontSize: "11px",
                color: "#333",
                background: "rgba(255,255,255,.9)",
                border: "none",
                borderRadius: "2px",
                padding: "1px 4px",
            },
            zIndex: 200,
        });
        overlays.push(circle, text);
    });

    layer.stationOverlays = overlays;
    overlays.forEach((o) => map.add(o));
}

function applyStyle(busId: string, style: Record<string, any>) {
    lineLayers[busId]?.polyline?.setOptions(style);
}

// 除指定线路外，其它线路全部淡化
function dimOthers(exceptId: string | null, previewIds: Set<string> = new Set()) {
    Object.keys(lineLayers).forEach((id) => {
        if (id === exceptId || previewIds.has(id)) return; // 选中/预览的线路不淡化
        applyStyle(id, STYLE.dimmed);
    });
}

// 恢复所有线路到默认（无选中态时）
function restoreAllLines() {
    Object.keys(lineLayers).forEach((id) => applyStyle(id, STYLE.default));
}

// 鼠标悬浮预览（非选中态才生效，淡化其它线路）
function previewLine(busId: string) {
    if (activeId.value === busId) return;
    applyStyle(busId, STYLE.preview);
    dimOthers(activeId.value, new Set([busId]));
}
function unpreviewLine(busId: string) {
    if (activeId.value === busId) return;
    applyStyle(busId, STYLE.default);
    if (activeId.value) dimOthers(activeId.value); // 有选中线路则仅选中线路高亮
    else restoreAllLines();
}

// 真正执行选中（供列表点击与地图弹窗确认共用）
function doSelect(busId: string) {
    if (candidatePopup.value.visible) candidatePopup.value.visible = false;

    if (activeId.value === busId) {
        // 再次点击取消选中
        activeId.value = null;
        restoreAllLines();
        removeStations(busId);
        detailLine.value = null;
        detailOpposite.value = null;
        currentDisplay.value = null;
        bottombarCollapsed.value = true;
        isReverse.value = false;
        return;
    }

    selectById(busId);
}

// 高亮某条线路（渲染/站点/淡化），不改底部弹框的正反向锚定
function highlightLine(busId: string) {
    if (activeId.value) removeStations(activeId.value);

    // 若目标线路尚未渲染（反向线路初始被去重跳过），现场渲染
    if (!lineLayers[busId]) {
        const line = allLines.value.find((l) => l.id === busId);
        if (line) renderLine(line, line.color!);
    }

    activeId.value = busId;
    restoreAllLines();
    applyStyle(busId, STYLE.active);
    dimOthers(busId); // 淡化其它线路

    const line = allLines.value.find((l) => l.id === busId);
    if (line?.color) addStations(busId, line.color);

    const layer = lineLayers[busId];
    if (layer?.polyline) {
        map.setFitView(layer.polyline, false, [60, 60, 60, 260]);
    }
}

// 按 id 选中（列表/地图点击）：以正向视角锚定
function selectById(busId: string) {
    highlightLine(busId);

    const line = allLines.value.find((l) => l.id === busId);
    console.log('看看选中data===============>', line)
    detailLine.value = line ?? null;
    detailOpposite.value = line?.direc ? line?.direc != line?.id ? allLines.value.find((l) => l.id === line.direc) ?? null : null : null;
    isReverse.value = false;
    currentDisplay.value = line ?? null;
    bottombarCollapsed.value = false;

    // 滚动左侧列表到选中线路（带平滑动画）
    // 先等 panel 高度过渡（0.25s）完成，避免滚动位置基于过渡中的高度算偏
    setTimeout(() => scrollToLine(busId), 320);
}

// 切换反向线路：切换高亮 + 站点 + 底部详情
function toggleReverse() {
    if (!detailOpposite.value) {
        ElMessage.info("该线路暂无反向线路");
        return;
    }
    isReverse.value = !isReverse.value;
    const targetId = isReverse.value ? detailOpposite.value.id : detailLine.value!.id;
    highlightLine(targetId);
    // 底部详情跟随切换
    currentDisplay.value = isReverse.value ? detailOpposite.value : detailLine.value;
}

// 列表点击
function focusLine(busId: string) {
    doSelect(busId);
}

// ---- 地图点击选择线路（polyline click 为主 + 站点反查） ----

// 最近一次被 polyline 处理的点击时间戳，用于区分 map 点击是否已处理
let lastLineClickAt = 0;

// 计算两个经纬度之间的近似距离（米）
function geoDistance(lng1: number, lat1: number, lng2: number, lat2: number): number {
    const dLng = (lng1 - lng2) * 88600; // 1 度经度约 88.6km（纬度约 37°）
    const dLat = (lat1 - lat2) * 111000; // 1 度纬度约 111km
    return Math.sqrt(dLng * dLng + dLat * dLat);
}

// 点击坐标反查：返回经过"点击点附近站点"的所有线路（含当前点击线路）
function findLinesNearBy(lnglat: any): { id: string; name: string; color: string }[] {
    const clng = lnglat.getLng();
    const clat = lnglat.getLat();
    const NEAR_DIST = 200; // 附近站点距离阈值（米）

    // 1. 找点击点附近的站点（跨所有线路去重）
    const nearStopIds = new Set<string>();
    for (const line of lines.value) {
        for (const stop of line.busstops || []) {
            const [slng, slat] = (stop.location || "").split(",").map(Number);
            if (slng === undefined || slat === undefined || isNaN(slng) || isNaN(slat)) continue;
            if (geoDistance(clng, clat, slng, slat) <= NEAR_DIST) {
                nearStopIds.add(String(stop.id ?? `${slng},${slat}`));
            }
        }
    }

    // 2. 找出经过这些站点的所有线路
    const lineMap = new Map<string, { id: string; name: string; color: string }>();
    for (const line of lines.value) {
        for (const stop of line.busstops || []) {
            const stopKey = String(stop.id ?? "");
            if (stopKey && nearStopIds.has(stopKey)) {
                if (!lineMap.has(line.id)) {
                    lineMap.set(line.id, { id: line.id, name: line.name, color: line.color ?? "#999" });
                }
            }
        }
    }
    return Array.from(lineMap.values());
}

// 点击线路处理：反查附近站点 → 弹窗列出经过这些站的线路 / 单条直接选中
function handleLineClick(busId: string, lnglat: any, e: any) {
    lastLineClickAt = Date.now();
    candidatePopup.value.visible = false;

    const nearLines = findLinesNearBy(lnglat);

    if (nearLines.length <= 1) {
        // 只有当前线路（或反查无其它）→ 直接选中当前点击线路
        doSelect(busId);
        return;
    }

    // 多条：弹出候选（含当前点击线路与重叠线路）
    candidatePopup.value = {
        visible: true,
        x: Math.min(e.pixel?.x ?? 0 + 12, (map.getSize().width ?? 1000) - 220),
        y: (e.pixel?.y ?? 0) + 12,
        lines: nearLines,
    };
}

// 地图点击事件处理：仅处理空白处（polyline 已拦截线路点击，此处做兜底）
function onMapClick(e: any) {
    // 若刚被 polyline click 处理过（200ms 内），跳过，避免重复/误判为空白
    if (Date.now() - lastLineClickAt < 200) return;

    candidatePopup.value.visible = false;
    // 点击空白处：取消选中，但不还原缩放（保持当前视野）
    if (activeId.value) {
        const prevId = activeId.value;
        activeId.value = null;
        restoreAllLines();
        removeStations(prevId);
        detailLine.value = null;
        detailOpposite.value = null;
        currentDisplay.value = null;
        isReverse.value = false;
        bottombarCollapsed.value = true;
    }
}

// 候选弹窗悬浮预览（淡化其它线路）
function hoverCandidate(busId: string) {
    if (activeId.value === busId) return;
    restoreAllLines();
    applyStyle(busId, STYLE.preview);
    dimOthers(busId);
}

// 候选弹窗点击确认
function confirmCandidate(busId: string) {
    doSelect(busId);
}

// 渲染单条线路（只画线，站点在点击高亮时才加载，减少初始渲染压力）
function renderLine(line: BusLine, color: string) {
    const segments = parsePolyline(line.polyline);
    const path = segments[0] || []; // 存原始坐标，供命中检测使用
    const polyline = new AMap.Polyline({
        path,
        strokeColor: color,
        lineJoin: "round",
        lineCap: "round",
        strokeStyle: "solid",
        cursor: "pointer", // 悬浮在手型光标，提示可点击
        ...STYLE.default,
    });
    // 点击线路：由高德引擎判定命中，再用点击坐标反查附近站点
    polyline.on("click", (e: any) => {
        const lnglat = e.lnglat || e.originEvent?.lnglat;
        if (lnglat) handleLineClick(line.id, lnglat, e);
    });
    map.add(polyline);
    lineLayers[line.id] = { polyline, path, stationOverlays: [] };
}

// 清空当前地图上的所有线路与站点，重置状态
function clearMapLayers() {
    Object.values(lineLayers).forEach((layer) => {
        if (layer.polyline) map.remove(layer.polyline);
        layer.stationOverlays.forEach((o) => map.remove(o));
    });
    lineLayers = {};
    lines.value = [];
    activeId.value = null;
    detailLine.value = null;
    detailOpposite.value = null;
    currentDisplay.value = null;
    isReverse.value = false;
    candidatePopup.value.visible = false;
    bottombarCollapsed.value = true;
}

// 同一车名、direc 互为对方 id 的两条线只保留第一条（去重反向）
function dedupeLines(data: BusLine[]): BusLine[] {
    const kept: BusLine[] = [];
    const keptIds = new Set<string>();
    for (const line of data) {
        // 若该线路的 direc 指向一条已保留的线路，且被指向线路的 direc 也指回自己 → 视为反向，跳过
        if (line.direc && keptIds.has(line.direc)) {
            const counterpart = kept.find((k) => k.id === line.direc);
            if (counterpart && counterpart.direc === line.id) {
                continue; // 跳过反向线路
            }
        }
        kept.push(line);
        keptIds.add(line.id);
    }
    return kept;
}

// 拉取并渲染线路数据（可重复调用以切换关键词）
async function loadData(keyword: string) {
    loading.value = true;
    loadError.value = "";
    clearMapLayers();

    try {
        const res = await $fetch<{ data: BusLine[]; code: number }>("/api/buslines/map", {
            query: { keyword },
        });
        const raw = res.data || [];

        // 完整数据（含正反向）统一分配颜色
        allLines.value = raw.map((line, i) => ({
            ...line,
            color: PALETTE[i % PALETTE.length],
        }));

        // 渲染列表：去重反向，只保留正向
        const data = dedupeLines(allLines.value);
        lines.value = data.map((line) => ({ ...line, color: line.color ?? PALETTE[0] }));
        lines.value.forEach((line) => renderLine(line, line.color!));

        map.setFitView();
    } catch (e) {
        loadError.value = "线路数据加载失败，请稍后重试";
    } finally {
        loading.value = false;
    }
}

function reload() {
    const keyword = keywordInput.value.trim();
    loadData(keyword);
}

// 初始化地图（仅创建一次）
async function initMap() {
    // @ts-ignore
    window._AMapSecurityConfig = { securityJsCode: config.public.mapsc };

    AMap = await AMapLoader.load({
        key: config.public.mapscKey as string,
        version: "2.0",
    });

    map = new AMap.Map(mapRef.value!, {
        zoom: 15,
        center: [120.5, 37.6],
        mapStyle: "amap://styles/whitesmoke", // 浅色极简底图，凸显公交线路
    });

    // 点击地图：命中线路则选中；多条线路时弹候选
    map.on("click", onMapClick);

    await loadData(keywordInput.value);
}

onMounted(initMap);
onUnmounted(() => {
    map?.destroy();
});
</script>

<style scoped>
.map-wrapper {
    position: relative;
    width: 100%;
}

.map {
    width: 100%;
    height: 800px;
}

.map-loading-mask {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(255, 255, 255, 0.35);
    font-size: 14px;
    color: #606266;
    pointer-events: none;
}

.panel {
    position: absolute;
    top: 12px;
    left: 12px;
    z-index: 100;
    width: 280px;
    max-width: calc(100% - 24px);
    background: #fff;
    border-radius: 8px;
    box-shadow: 0 2px 16px rgba(0, 0, 0, 0.15);
    overflow: hidden;
    display: flex;
    flex-direction: column;
    max-height: 90%; /* 收起底部详情时占 90% */
    transition: width 0.2s ease, max-height 0.25s ease;
}
/* 底部详情弹框展开时，左侧列表压缩到 30% */
.panel.detailOpen {
    max-height: 30%;
}
/* 左侧折叠为窄条时，恢复自身高度不受联动影响 */
.panel.collapsed {
    max-height: 44px;
}

.panel.collapsed {
    width: 44px;
}

.panel-header {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 10px;
    border-bottom: 1px solid #ebeef5;
    background: #f5f7fa;
}

.panel-header :deep(.el-input) {
    flex: 1;
}

.search-btn {
    cursor: pointer;
    font-size: 13px;
}

.collapse-btn {
    flex-shrink: 0;
    width: 24px;
    height: 24px;
    border: none;
    background: transparent;
    cursor: pointer;
    font-size: 16px;
    line-height: 1;
    color: #606266;
    border-radius: 4px;
}

.collapse-btn:hover {
    background: #e4e7ed;
}

.panel-body {
    flex: 1;
    min-height: 0;
    overflow: auto;
    padding: 8px 0;
}
.panel-scrollbar {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    scroll-behavior: smooth; /* 配合 scrollToLine 的平滑滚动 */
}

.panel-subhead {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 4px 12px 8px;
    font-size: 13px;
    font-weight: 600;
    color: #303133;
}

.count-badge {
    font-size: 12px;
    font-weight: 400;
    color: #909399;
    background: #f0f2f5;
    border-radius: 10px;
    padding: 1px 8px;
}

.state-msg {
    padding: 24px 12px;
    text-align: center;
    font-size: 13px;
    color: #909399;
}

.state-msg.error {
    color: #f56c6c;
}

.line-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 7px 12px;
    cursor: pointer;
    font-size: 13px;
    border-left: 3px solid transparent;
}

.line-item:hover {
    background: #f5f7fa;
}

.line-item.active {
    background: #ecf5ff;
    border-left-color: var(--line-color);
}

.color-dot {
    flex-shrink: 0;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: var(--line-color);
    box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.08);
}

.line-name {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.stop-count {
    flex-shrink: 0;
    font-size: 11px;
    color: #909399;
}

/* 候选弹窗 */
.candidate-popup {
    position: absolute;
    z-index: 200;
    width: 200px;
    max-height: 260px;
    overflow: auto;
    background: #fff;
    border-radius: 8px;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.18);
    padding: 6px 0;
}

.candidate-title {
    padding: 6px 12px 8px;
    font-size: 12px;
    font-weight: 600;
    color: #606266;
    border-bottom: 1px solid #f0f2f5;
}

.candidate-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 7px 12px;
    cursor: pointer;
    font-size: 13px;
}

.candidate-item:hover,
.candidate-item.active {
    background: #ecf5ff;
}

.candidate-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

/* 底部信息弹框 */
.detail-bar {
    position: absolute;
    left: 12px;
    right: 12px;
    bottom: 12px;
    z-index: 200;
    background: #fff;
    border-radius: 8px;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.18);
    max-height: 45%;
    display: flex;
    flex-direction: column;
    overflow: hidden;
}

.detail-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 10px 16px;
    border-bottom: 1px solid #ebeef5;
    background: #f5f7fa;
    transition: padding 0.25s ease;
}
/* 收起时：只保留 collapse-btn，header 压缩成窄条 */
.detail-bar.collapsed .detail-header {
    padding: 4px 12px;
    justify-content: flex-end;
    border-bottom: none;
}
.detail-header-actions {
    display: flex;
    align-items: center;
    gap: 8px;
}
.detail-header-actions .collapse-btn {
    flex-shrink: 0;
}

.detail-title {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
}

.detail-name {
    font-size: 15px;
    font-weight: 600;
    color: #303133;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.detail-body {
    display: grid;
    grid-template-rows: 1fr; /* 展开态占满 */
    transition: grid-template-rows 0.25s ease;
}
.detail-body.collapsed {
    grid-template-rows: 0fr; /* 折叠为 0 */
}
.detail-body.collapsed .detail-inner{
    padding: 0;
}
/* 内容包裹层：控制 overflow，才能让 0fr 真正裁剪 */
.detail-inner {
    overflow: hidden;
    min-height: 0;
    padding: 12px 16px;
}

.detail-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: 6px 16px;
    margin-bottom: 10px;
}

.detail-item {
    font-size: 13px;
    color: #303133;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.detail-item .label,
.detail-timedesc .label {
    color: #909399;
    margin-right: 6px;
}

.detail-timedesc {
    font-size: 13px;
    color: #303133;
    padding: 6px 0;
    border-top: 1px solid #f0f2f5;
    margin-bottom: 6px;
}

.detail-stops {
    border-top: 1px solid #f0f2f5;
    padding-top: 8px;
}

.stop-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
}

.stop-tag {
    font-size: 12px;
    color: #606266;
    background: #f4f4f5;
    border-radius: 3px;
    padding: 2px 6px;
}
</style>

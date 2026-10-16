<template>
    <div class="map-wrapper">
        <!-- 左：探索面板（线路查询为现有功能；站点/周边保留后续扩展入口） -->
        <aside class="map-side">
            <div class="side-heading">
                <span class="side-kicker">TRANSIT ATLAS</span>
                <strong>线路探索</strong>
                <span>搜索城市，或从地图逐级浏览</span>
            </div>
            <div class="side-tabs">
                <button v-for="t in SIDE_TABS" :key="t.key" class="side-tab"
                    :class="{ active: sideTab === t.key }" @click="sideTab = t.key">{{ t.label }}</button>
            </div>

            <div v-show="sideTab === 'lines'" class="side-body">
            <div class="panel-header">
                <el-input v-model="keywordInput" size="default" placeholder="输入城市名，按回车查询" clearable
                    @keyup.enter="reload">
                </el-input>
                <el-button class="search-btn" @click="reload" title="查询"><el-icon><Search /></el-icon></el-button>
                <el-button class="search-btn" @click="reloadAll" title="全量查询（耗时较长）">全</el-button>
            </div>

            <div class="panel-body">
                <div class="panel-subhead">
                    <span class="subhead-title">线路列表</span>
                    <span class="count-badge">{{ lines.length }}</span>
                </div>

                <div v-if="loading" class="state-msg">加载中…</div>
                <div v-else-if="loadError" class="state-msg error">{{ loadError }}</div>
                <div v-else-if="lines.length === 0" class="state-msg">
                    {{ hasSearched ? '没有找到线路，换个城市名再试一次。' : '输入城市名并按回车，线路会显示在这里。' }}
                </div>

                <div v-else ref="listScrollbarRef" class="panel-scrollbar">
                    <div v-for="line in lines" :key="line.id" :data-line-id="line.id"
                        class="line-item"
                        :class="{ active: activeId === line.id }"
                        :style="{ '--line-color': line.color, '--line-gradient': gradientOf(line.color, line.color2) }"
                        @click="focusLine(line.id)" @mouseenter="previewLine(line.id)"
                        @mouseleave="unpreviewLine(line.id)">
                        <span class="color-dot"></span>
                        <span class="line-name" :title="line.name">{{ line.name }}</span>
                        <span v-if="line.busstops?.length" class="stop-count">{{ line.busstops.length }}站</span>
                    </div>
                </div>
            </div>
            </div><!-- /side-body(lines) -->

            <!-- 站点/周边：留口子（功能筹备中） -->
            <div v-show="sideTab !== 'lines'" class="side-body side-ph">
                <div class="ph-badge">{{ sideTab === 'stops' ? '站点查询' : '周边查询' }}</div>
                <p class="ph-title">即将上线</p>
                <p class="ph-sub">这个模块还在筹备中，先看看线路吧</p>
            </div>
        </aside>

        <!-- 左：地图本体（面包屑/加载条/候选弹窗都是地图上的浮层） -->
        <div class="map-main">
        <div ref="mapRef" class="map"></div>

        <!-- 区域栏：左边面包屑（下钻后靠它回上一级），右边是悬停到的区域名。
             固定在上方居中而不是跟随鼠标：跟随会随光标抖动 -->
        <div class="area-bar">
            <div class="area-trail">
                <template v-for="(t, i) in areaTrail" :key="t.adcode + '-' + i">
                    <span v-if="i" class="area-sep">›</span>
                    <span class="area-crumb" :class="{ current: i === areaTrail.length - 1 }"
                        :title="t.name" @click="goToArea(i)">{{ t.name }}</span>
                </template>
            </div>
            <span class="area-hover">{{ areaHint }}</span>
        </div>

        <!-- 加载进度条（地图先展示，数据分批渲染时实时推进） -->
        <div v-if="loading" class="map-loading-bar">
            <button class="loading-close" title="关闭并终止加载" @click="stopLoad">×</button>
            <div class="loading-info">
                <span class="loading-text">正在加载线路数据</span>
                <span class="loading-percent">{{ progress }}%</span>
            </div>
            <div class="loading-track">
                <div class="loading-fill" :style="{ width: progress + '%' }"></div>
            </div>
        </div>

        <!-- 点击命中多条线路时的候选弹窗 -->
        <div v-if="candidatePopup.visible" class="candidate-popup"
            :style="{ left: candidatePopup.x + 'px', top: candidatePopup.y + 'px' }">
            <div class="candidate-title">经过此处的 {{ candidatePopup.lines.length }} 条线路</div>
            <div v-for="c in candidatePopup.lines" :key="c.id" class="candidate-item"
                :class="{ active: activeId === c.id }"
                :style="{ '--line-color': c.color, '--line-gradient': gradientOf(c.color, c.color2) }"
                @mouseenter="hoverCandidate(c.id)" @mouseleave="unpreviewLine(c.id)" @click="confirmCandidate(c.id)">
                <span class="color-dot"></span>
                <span class="candidate-name">{{ c.name }}</span>
            </div>
        </div>
        </div><!-- /map-main -->

        <!-- 底部信息弹框：当前选中线路 -->
        <div class="detail-bar" :class="{ collapsed: bottombarCollapsed }"
            :style="{ '--line-color': currentDisplay?.color, '--line-gradient': gradientOf(currentDisplay?.color, currentDisplay?.color2) }">
            <div class="detail-header">
                <div class="detail-title" v-show="!bottombarCollapsed">
                    <span class="color-dot"></span>
                    <span class="detail-name">{{ currentDisplay?.name }}</span>
                    <el-tag v-if="isReverse" size="small" type="warning" effect="light" round>反向</el-tag>
                    <span v-if="currentDisplay?.start_stop || currentDisplay?.end_stop" class="detail-route">
                        {{ currentDisplay?.start_stop || '-' }} 至 {{ currentDisplay?.end_stop || '-' }}
                    </span>
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
                        <div class="detail-item"><span class="label">类型</span><span class="value">{{ currentDisplay?.type || '-' }}</span></div>
                        <div class="detail-item"><span class="label">首班</span><span class="value">{{ currentDisplay?.start_time || '-' }}</span></div>
                        <div class="detail-item"><span class="label">末班</span><span class="value">{{ currentDisplay?.end_time || '-' }}</span></div>
                        <div class="detail-item"><span class="label">全程里程</span><span class="value">{{ currentDisplay?.distance ? currentDisplay.distance + ' km' : '-' }}</span></div>
                        <div class="detail-item"><span class="label">起步价</span><span class="value">{{ priceText(currentDisplay?.basic_price) }}</span></div>
                        <div class="detail-item"><span class="label">全程票价</span><span class="value">{{ priceText(currentDisplay?.total_price) }}</span></div>
                        <!-- <div class="detail-item"><span class="label">城市</span>{{ currentDisplay.citycode || '-' }}</div> -->
                        <!-- <div class="detail-item"><span class="label">线路ID</span>{{ currentDisplay.id }}</div> -->
                        <div class="detail-item"><span class="label">站点数</span><span class="value">{{ currentDisplay?.busstops?.length ?? 0 }} 站</span></div>
                    </div>
                    <div v-if="formatTimeDesc(currentDisplay?.timedesc) !== '-'" class="detail-section">
                        <div class="label">详细时间</div>
                        <div class="timedesc">{{ formatTimeDesc(currentDisplay?.timedesc) }}</div>
                    </div>
                    <div class="detail-section">
                        <div class="label">站点列表</div>
                        <div class="stop-tags">
                            <span v-for="(stop, si) in currentDisplay?.busstops" :key="stop.id" class="stop-tag"><i>{{ si + 1 }}</i>{{ stop.name }}</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { Search, ArrowLeft, ArrowRight, ArrowUp, ArrowDown } from '@element-plus/icons-vue'

// 注意：@amap/amap-jsapi-loader **不能**在模块顶层 import ——
// 它的 CJS 版在 import 时就会去读 window，服务端一加载整个页面 500
// （实测报错 "window is not defined"，栈顶就在这个包的第 6 行）。
// 所以挪到 initMap 里动态加载，并用 import.meta.client 挡一下：
// 那是编译期常量，服务端打包时整个分支会被摇掉，模块根本不会进服务端产物。

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
    color?: string; // 渐变起点色（也用于站点描边等单色场合）
    color2?: string; // 渐变终点色
}
interface LineLayer {
    polyline: any;
    path: number[][]; // 原始坐标数组（用于命中检测，避免依赖 getPath 返回类型）
    stationOverlays: any[];
    segmentOverlays: any[]; // 选中时叠加的渐变分段线
}

const props = defineProps<{
    keyword?: string; // 初始查询关键词（默认为空查全量）
}>();

const mapRef = ref<HTMLDivElement | null>(null);
const config = useRuntimeConfig();

const keywordInput = ref(props.keyword ?? "");
const lines = shallowRef<BusLine[]>([]); // 批量替换，不深度代理大量线路与站点对象
const activeId = ref<string | null>(null);
// 右侧查询面板的 tab：线路查询=现有功能；站点/周边=留口子（功能筹备中）
const SIDE_TABS = [
    { key: 'lines', label: '线路查询' },
    { key: 'stops', label: '站点查询' },
    { key: 'around', label: '周边查询' },
] as const
const sideTab = ref<'lines' | 'stops' | 'around'>('lines');
const bottombarCollapsed = ref(true);
const loading = ref(false);
const loadError = ref("");
const hasSearched = ref(false); // 是否已发起过查询（用于列表空状态文案）
const progress = ref(0); // 分批加载进度（0-100）
const totalLines = ref(0); // 总线路数

// 底部详情弹框是否处于展开状态（选中线路且未收起）
const isDetailExpanded = computed(() => !!detailLine.value && !bottombarCollapsed.value);

// 左侧列表滚动容器（用于滚动到选中线路）
const listScrollbarRef = ref<any>(null);

// 滚动左侧列表到指定线路项（带平滑动画）
function scrollToLine(busId: string) {
  const escapedId = typeof CSS !== "undefined" && CSS.escape ? CSS.escape(busId) : busId.replace(/["\\]/g, "\\$&");
  const item = listScrollbarRef.value?.querySelector?.(`[data-line-id="${escapedId}"]`) as HTMLElement | null;
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
    lines: { id: string; name: string; color: string; color2?: string }[];
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

// 票价：无数据显示 -
function priceText(v: any): string {
    return v === undefined || v === null || v === "" ? "-" : `${v} 元`;
}

function formatInterval(t: string): string {
    const m = String(t).split(":");
    const hours = Number(m[0]) || 0;
    const mins = Number(m[1]) || 0;
    if (hours && mins) return `${hours}小时${mins}分钟`;
    if (hours) return `${hours}小时`;
    return `${mins}分钟`;
}

// 线路配色：每条线一组「起点色 → 终点色」。
// 选中时沿线路方向渐变；未选中时只用起点色并整体半透明。
// 色相之间拉开，且明度/饱和度控制在浅色底图上仍然看得清的范围
const PALETTE: [string, string][] = [
    ["#4a90c4", "#62cfe0"], // 天蓝 → 水色
    ["#e0607e", "#f6a77e"], // 玫瑰 → 蜜桃
    ["#5f7fd8", "#a287ea"], // 靛蓝 → 薰衣草
    ["#2fae94", "#8fdc8f"], // 青绿 → 薄荷
    ["#ee8444", "#f6c35a"], // 珊瑚橙 → 琥珀
    ["#a85cc6", "#f07fbd"], // 紫 → 粉
    ["#3f9a68", "#bcd45c"], // 森绿 → 青柠
    ["#d6504f", "#f0916f"], // 绯红 → 鲑鱼粉
    ["#3a78bd", "#4fc6c6"], // 海蓝 → 青
    ["#8467cf", "#55a0e6"], // 紫罗兰 → 晴空蓝
    ["#c27c30", "#e8be62"], // 赭石 → 金
    ["#cc4b88", "#ee8f84"], // 品红 → 珊瑚粉
];


// 线路样式常量
// 底层折线始终存在（负责点击命中）；选中时它变成一圈半透明光晕，渐变分段线叠在上面
const STYLE = {
    default: { strokeWeight: 6, strokeOpacity: 0.72, zIndex: 10, isOutline: true },
    preview: { strokeWeight: 7, strokeOpacity: 0.95, zIndex: 50, isOutline: true },
    active: { strokeWeight: 15, strokeOpacity: 0.22, zIndex: 100, isOutline: false },
    // 有其他线路被选中/预览时，其它线路淡化的样式
    dimmed: { strokeWeight: 3, strokeOpacity: 0.12, zIndex: 10, isOutline: false },
};

// 选中线路的渐变：分成多少段（越多越平滑，越耗性能；只对选中的一条线生效）
const GRADIENT_STEPS = 28;

// "#rrggbb" 两色线性插值
function lerpHex(a: string, b: string, t: number): string {
    const pa = parseInt(a.slice(1), 16);
    const pb = parseInt(b.slice(1), 16);
    const ch = (shift: number) => {
        const x = (pa >> shift) & 255;
        const y = (pb >> shift) & 255;
        return Math.round(x + (y - x) * t);
    };
    return "#" + [16, 8, 0].map((sh) => ch(sh).toString(16).padStart(2, "0")).join("");
}

// 列表色点 / 站点序号等 UI 用的 CSS 渐变
function gradientOf(c1?: string, c2?: string): string {
    if (!c1) return "";
    return `linear-gradient(135deg, ${c1}, ${c2 || c1})`;
}

let map: any = null;
let AMap: any = null;
let lineLayers: Record<string, LineLayer> = {};
const linesById = new Map<string, BusLine>();
const STOP_NEAR_DISTANCE = 200;
type LineCandidate = { id: string; name: string; color: string; color2?: string };
type IndexedStop = { lng: number; lat: number; stopId: string };
const stopGrid = new Map<string, Map<string, IndexedStop>>();
const stopLinesById = new Map<string, Map<string, LineCandidate>>();

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

// 移除某条线路的渐变分段线
function removeGradient(busId: string) {
    const layer = lineLayers[busId];
    if (layer?.segmentOverlays.length) {
        layer.segmentOverlays.forEach((o) => map.remove(o));
        layer.segmentOverlays = [];
    }
}

// 移除某条线路的站点覆盖物（同时清掉它的渐变分段线，两者总是一起出现/消失）
function removeStations(busId: string) {
    removeGradient(busId);
    const layer = lineLayers[busId];
    if (layer?.stationOverlays.length) {
        layer.stationOverlays.forEach((o) => map.remove(o));
        layer.stationOverlays = [];
    }
}

// 为某条线路创建站点覆盖物（空心圆点 + 站名）
function addStations(busId: string, color: string) {
    // 从完整数据里找（反向线路可能不在渲染列表 lines 里）
    const line = linesById.get(busId);
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
            fillColor: "#fffef9",
            fillOpacity: 0.9,
            zIndex: 200, // 站点图层需在线路（含高亮 zIndex:100）之上
        });
        const text = new AMap.Text({
            position: pos,
            text: stop.name,
            offset: new AMap.Pixel(8, 8),
            style: {
                fontSize: "11px",
                color: "#2c2416",
                background: "rgba(255,254,249,.92)",
                border: "none",
                borderRadius: "4px",
                padding: "1px 5px",
            },
            zIndex: 200,
        });
        overlays.push(circle, text);
    });

    layer.stationOverlays = overlays;
    overlays.forEach((o) => map.add(o));
}

// 为选中的线路沿路径叠加渐变：按累计距离切成 N 段，每段取起止色之间的插值
function addGradient(busId: string) {
    const line = linesById.get(busId);
    const layer = lineLayers[busId];
    if (!line || !layer || !line.color) return;
    removeGradient(busId);

    const path = layer.path;
    if (path.length < 2) return;
    const c1 = line.color;
    const c2 = line.color2 || line.color;

    const cum: number[] = [0];
    for (let i = 1; i < path.length; i++) {
        const p = path[i - 1]!;
        const q = path[i]!;
        cum.push(cum[i - 1]! + geoDistance(p[0]!, p[1]!, q[0]!, q[1]!));
    }
    const total = cum[cum.length - 1]! || 1;
    const steps = Math.min(GRADIENT_STEPS, path.length - 1);

    const overlays: any[] = [];
    let start = 0;
    for (let k = 0; k < steps; k++) {
        let end = start + 1;
        if (k === steps - 1) {
            end = path.length - 1;
        } else {
            const target = ((k + 1) / steps) * total;
            while (end < path.length - 1 && cum[end]! < target) end++;
        }
        if (end <= start) continue;
        overlays.push(
            new AMap.Polyline({
                path: path.slice(start, end + 1),
                strokeColor: lerpHex(c1, c2, (k + 0.5) / steps),
                strokeWeight: 7,
                strokeOpacity: 1,
                lineJoin: "round",
                lineCap: "round",
                clickable: false, // 点击仍由底层折线处理
                zIndex: 101,
            })
        );
        start = end;
    }

    layer.segmentOverlays = overlays;
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
        const line = linesById.get(busId);
        if (line) renderLine(line, line.color!);
    }

    activeId.value = busId;
    restoreAllLines();
    applyStyle(busId, STYLE.active);
    dimOthers(busId); // 淡化其它线路

    const line = linesById.get(busId);
    if (line?.color) addStations(busId, line.color);
    addGradient(busId);

    const layer = lineLayers[busId];
    if (layer?.polyline) {
        map.setFitView(layer.polyline, false, [60, 60, 60, 260]);
    }
}

// 按 id 选中（列表/地图点击）：以正向视角锚定
function selectById(busId: string) {
    highlightLine(busId);

    const line = linesById.get(busId);
    detailLine.value = line ?? null;
    detailOpposite.value = line?.direc ? line?.direc != line?.id ? linesById.get(line.direc) ?? null : null : null;
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

// 建立约 200 米网格索引：地图点击时只检查相邻格内的站点，避免每次扫描全量线路站点。
function indexStops(source: BusLine[]) {
    for (const line of source) {
        for (const stop of line.busstops || []) {
            const pos = parseLocation(stop.location);
            if (!pos) continue;
            const [lng, lat] = pos;
            const x = lng * 88600;
            const y = lat * 111000;
            const cellX = Math.floor(x / STOP_NEAR_DISTANCE);
            const cellY = Math.floor(y / STOP_NEAR_DISTANCE);
            const cellKey = `${cellX}:${cellY}`;
            const stopId = String(stop.id ?? "");
            const stopKey = `${stopId}:${lng},${lat}`;
            let cell = stopGrid.get(cellKey);
            if (!cell) stopGrid.set(cellKey, cell = new Map());
            let indexed = cell.get(stopKey);
            if (!indexed) cell.set(stopKey, indexed = { lng, lat, stopId });
            if (!stopId) continue;
            let lineGroup = stopLinesById.get(stopId);
            if (!lineGroup) stopLinesById.set(stopId, lineGroup = new Map());
            lineGroup.set(line.id, {
                id: line.id,
                name: line.name,
                color: line.color ?? "#999",
                color2: line.color2,
            });
        }
    }
}

// 点击坐标反查：返回经过"点击点附近站点"的所有线路（含当前点击线路）
function findLinesNearBy(lnglat: any): LineCandidate[] {
    const clng = lnglat.getLng();
    const clat = lnglat.getLat();
    const x = clng * 88600;
    const y = clat * 111000;
    const cellX = Math.floor(x / STOP_NEAR_DISTANCE);
    const cellY = Math.floor(y / STOP_NEAR_DISTANCE);
    const lineMap = new Map<string, LineCandidate>();
    const nearStopIds = new Set<string>();
    for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
            const cell = stopGrid.get(`${cellX + dx}:${cellY + dy}`);
            if (!cell) continue;
            for (const stop of cell.values()) {
                if (stop.stopId && geoDistance(clng, clat, stop.lng, stop.lat) <= STOP_NEAR_DISTANCE) {
                    nearStopIds.add(stop.stopId);
                }
            }
        }
    }
    for (const stopId of nearStopIds) {
        stopLinesById.get(stopId)?.forEach((line, id) => lineMap.set(id, line));
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
    // 区域块点击同理：那是「挑选区域」，不是「点空白」，别顺手把选中的线路清掉
    if (Date.now() - lastAreaClickAt < 200) return;

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
        outlineColor: "#ffffff", // 白色细描边：重叠线路之间有清晰的分界，也更有玻璃质感
        borderWeight: 1,
        cursor: "pointer", // 悬浮在手型光标，提示可点击
        ...STYLE.default,
    });
    // 点击线路：由高德引擎判定命中，再用点击坐标反查附近站点
    polyline.on("click", (e: any) => {
        const lnglat = e.lnglat || e.originEvent?.lnglat;
        if (lnglat) handleLineClick(line.id, lnglat, e);
    });
    map.add(polyline);
    lineLayers[line.id] = { polyline, path, stationOverlays: [], segmentOverlays: [] };
}

// 整批加入覆盖物，避免全量/区县查询时对地图引擎重复调用数百次 add。
function renderLineBatch(batch: BusLine[]) {
    const overlays: any[] = [];
    for (const line of batch) {
        if (lineLayers[line.id]) continue;
        const segments = parsePolyline(line.polyline);
        const path = segments[0] || [];
        const polyline = new AMap.Polyline({
            path,
            strokeColor: line.color!,
            lineJoin: "round",
            lineCap: "round",
            strokeStyle: "solid",
            outlineColor: "#ffffff",
            borderWeight: 1,
            cursor: "pointer",
            ...STYLE.default,
        });
        polyline.on("click", (e: any) => {
            const lnglat = e.lnglat || e.originEvent?.lnglat;
            if (lnglat) handleLineClick(line.id, lnglat, e);
        });
        lineLayers[line.id] = { polyline, path, stationOverlays: [], segmentOverlays: [] };
        overlays.push(polyline);
    }
    if (overlays.length) map.add(overlays);
}

// 清空当前地图上的所有线路与站点，重置状态
function clearMapLayers() {
    const overlays: any[] = [];
    Object.values(lineLayers).forEach((layer) => {
        if (layer.polyline) overlays.push(layer.polyline);
        overlays.push(...layer.stationOverlays, ...layer.segmentOverlays);
    });
    if (overlays.length) map?.remove(overlays);
    lineLayers = {};
    linesById.clear();
    stopGrid.clear();
    stopLinesById.clear();
    lines.value = [];
    activeId.value = null;
    detailLine.value = null;
    detailOpposite.value = null;
    currentDisplay.value = null;
    isReverse.value = false;
    candidatePopup.value.visible = false;
    bottombarCollapsed.value = true;
}

// 按批次累积去重结果，避免每页都重新扫描从头开始累积的全量数据。
function appendVisibleLines(target: BusLine[], known: Map<string, BusLine>, batch: BusLine[]): BusLine[] {
    const added: BusLine[] = [];
    for (const line of batch) {
        if (line.direc && known.has(line.direc) && known.get(line.direc)?.direc === line.id) continue;
        target.push(line);
        added.push(line);
        known.set(line.id, line);
    }
    return added;
}

// 拉取并渲染线路数据（分批加载 + 实时进度条）
const PAGE_SIZE = 40; // 每批线路数

// 先用 keyword 去 city_codes 表查 citycode（查不到返回空串，后续不作为过滤条件）
async function resolveCitycode(keyword: string): Promise<string> {
    const kw = keyword.trim();
    if (!kw) return "";
    try {
        const res = await request("/api/citycodes", {
            query: { name: kw, page: 1, pageSize: 1 },
        });
        return res?.data?.[0]?.citycode || "";
    } catch {
        return "";
    }
}

// 每次发起加载时自增；进行中的旧任务发现 token 变化后自行中止（即终止轮询）
let loadToken = 0;

// 关闭进度条并终止进行中的分页轮询
function stopLoad() {
    loadToken++;
    loading.value = false;
    progress.value = 0;
}

async function loadData(keyword: string, full = false) {
    const token = ++loadToken; // 取号，旧任务自动失效
    hasSearched.value = true;
    loading.value = true;
    loadError.value = "";
    progress.value = 0;
    totalLines.value = 0;
    clearMapLayers();
    // 区域线路会被 clearMapLayers 一起清掉，进度也得归零，
    // 否则区县那层的提示会挂着一个旧条数，和地图上的内容对不上
    areaLineProgress.value = { loaded: 0, total: 0, drawn: 0 };

    try {
        // 全量模式跳过城市解析；普通搜索必须能解析出 citycode
        const citycode = full ? "" : await resolveCitycode(keyword);
        if (token !== loadToken) return; // 解析期间已被中止
        if (!full && !citycode) {
            loadError.value = keyword.trim() ? "未找到该城市，请检查关键词" : "请输入城市关键词";
            return;
        }

        // 第 1 页：拿到总量 total
        const first = await request("/api/buslines/map", {
            query: { citycode: citycode || undefined, page: 1, pageSize: PAGE_SIZE },
        });
        if (token !== loadToken) return;
        const total = first.total || 0;
        totalLines.value = total;
        if (!total) {
            loading.value = false;
            return;
        }
        const totalPages = Math.ceil(total / PAGE_SIZE);

        const visibleLines: BusLine[] = [];
        const visibleById = new Map<string, BusLine>();
        let loaded = 0;

        for (let page = 1; page <= totalPages; page++) {
            if (token !== loadToken) return; // 用户关闭进度条 / 发起新查询 → 终止轮询
            const res = page === 1
                ? first
                : await request("/api/buslines/map", {
                    query: { citycode: citycode || undefined, page, pageSize: PAGE_SIZE },
                });
            if (token !== loadToken) return;

            const raw = res.data || [];
            // 为当前批分配颜色（颜色索引基于已累积数量，保证全局一致）
            const colored = raw.map((line: any, i: any) => {
                const [c1, c2] = PALETTE[(loaded + i) % PALETTE.length]!;
                return { ...line, color: c1, color2: c2 };
            });

            colored.forEach((line) => linesById.set(line.id, line));

            // 保持反向线路可查以供切换，地图和列表只保留去重后的正向线路。
            const visibleBatch = appendVisibleLines(visibleLines, visibleById, colored);
            indexStops(visibleBatch);
            renderLineBatch(visibleBatch);
            lines.value = visibleLines.slice();

            loaded += colored.length;
            progress.value = Math.round((Math.min(loaded, total) / total) * 100);

            // 每批之间稍作停顿，让进度条有可见的推进节奏
            if (page < totalPages) await new Promise((r) => setTimeout(r, 120));
        }

        // 只按线路取景：区域块的 bbox 覆盖整个省甚至整个国家，
        // 一起算进来会把视野拉得很远（搜一个城市却看到全国）
        const lineOverlays = Object.values(lineLayers).map((l) => l.polyline).filter(Boolean);
        if (lineOverlays.length) map.setFitView(lineOverlays);
    } catch (e) {
        if (token === loadToken) loadError.value = "线路数据加载失败，请稍后重试";
    } finally {
        if (token === loadToken) {
            progress.value = 100;
            loading.value = false;
        }
    }
}

// 普通搜索：必须有关键词且能匹配到城市
function reload() {
    loadData(keywordInput.value.trim());
}

// 全量查询：二次确认（耗时很长），citycode 传空即拉取全库线路
async function reloadAll() {
    try {
        await ElMessageBox.confirm(
            "全量查询会拉取库内所有城市的线路，所需时间很长，确定继续吗？",
            "提示",
            { type: "warning", confirmButtonText: "继续", cancelButtonText: "取消", customClass: "map-dialog" }
        );
    } catch {
        return; // 取消
    }
    keywordInput.value = "";
    loadData("", true);
}

// ── 区域图层：行政区块 + 悬停高亮 + 点击下钻 ──
//
// 数据来自 city_codes 的边界（3638 个行政区全都爬过），服务端按「一个像素」
// 原则抽稀后下发：34 个省合计约 560KB，gzip 后一百多 KB。
//
// ★ 一个关键坑：AMap 的 Polygon.path 是「**一个外环 + 若干内环（洞）**」的结构，
//   而库里多环行政区的多个环是**并集** —— 浙江 563 环（舟山群岛）、福建 421 环、
//   广东 242 环、内蒙古 2 环（主体 + 另一片）、甘肃 6 环……都是"好几块地拼成
//   一个行政区"。把并集当成洞传进一个 Polygon，等于把整块地挖空：既看不见、
//   也点不到（实测 34 个省里只有新疆 / 西藏 / 山西这类首环即主体的能正常响应）。
//   所以这里**每个环单独建一个 Polygon**，同属一个行政区的一组记在 areaGroups，
//   悬停 / 下钻都按组处理 —— 视觉和交互上仍然是一个完整的省。
//
// 另一处取舍：每个行政区最多保留 RING_LIMIT 个环，按面积从大到小取。
// 舟山群岛那种几百个岛的情况，一环一个 overlay 太费；丢的是最小的礁石，
// 肉眼看不出、交互上也没人想去点一块礁石。
const RING_LIMIT = 80;

// 刻意与线路图层分开存：loadData 开头的 clearMapLayers() 会清掉所有线路，
// 区域块不该被它连坐 —— 搜线路和挑区域是两件事，两套状态各管各的。
let areaOverlays: any[] = [];
// 外框是「每个环一条折线」，所以是数组（见 renderArea 里的说明）
let areaFrame: any[] = [];
const areaGroups: Record<string, any[]> = {};
let hoverCode = "";
// 区域点击与「点空白处取消选中线路」的隔离时间戳，用法与 lastLineClickAt 一致
let lastAreaClickAt = 0;
// 每次下钻自增：连点两个区域时，只认最后一次的结果，别让先发的响应画到后选的区域上
let areaSeq = 0;

const hoverArea = ref("");
const areaLoading = ref(false);

// 区县级没有下级了，提示得说清楚；否则用户会一直等它继续往下钻
const areaHint = computed(() => {
    if (areaLoading.value) return "正在加载下级…";
    if (areaLineBusy.value) {
        const { loaded, total } = areaLineProgress.value;
        return total
            ? `正在加载本区线路 ${Math.min(100, Math.round((loaded / total) * 100))}%`
            : "正在加载本区线路…";
    }
    if (hoverArea.value) return hoverArea.value;
    // 区县级没有下级了，这里是终点；顺便把本区线路条数报一下
    if (areaScope.value.level === "district") {
        const { drawn, total } = areaLineProgress.value;
        return total ? `已是最后一级 · 本区 ${total} 条线路，渲染 ${drawn} 条` : "已是最后一级";
    }
    return "点击区域逐级下钻";
});
// 当前范围与面包屑。都来自服务端：ancestors 已经折叠掉「北京城区」这类虚拟层，
// 前端不自己拼层级关系，两边才不会各说各话。
const areaScope = ref<any>({ adcode: "100000", name: "中华人民共和国", level: "country" });
const areaTrail = ref<any[]>([{ adcode: "100000", name: "中华人民共和国", level: "country" }]);

// 服务端为省体积给的是扁平数组 [lng,lat,lng,lat,...]，AMap 的 path 要嵌套格式
function flatRingToPath(ring: number[]): number[][] {
    const path: number[][] = [];
    for (let i = 0; i + 1 < ring.length; i += 2) path.push([ring[i]!, ring[i + 1]!]);
    return path;
}

// 鞋带公式算环的面积，只用来给环排序（挑最大的几个），不追求坐标系精度
function ringArea(ring: number[]): number {
    let sum = 0;
    const n = ring.length / 2;
    for (let i = 0, j = n - 1; i < n; j = i++) {
        sum += ring[j * 2]! * ring[i * 2 + 1]! - ring[i * 2]! * ring[j * 2 + 1]!;
    }
    return Math.abs(sum / 2);
}

function setAreaHover(poly: any, on: boolean) {
    poly.setOptions(on
        ? { fillOpacity: 0.42, strokeColor: "#c2410c", strokeWeight: 2.4 }
        : { fillOpacity: 0.14, strokeColor: "#5b7c99", strokeWeight: 1 });
}

function applyHover(adcode: string, on: boolean) {
    for (const poly of areaGroups[adcode] || []) setAreaHover(poly, on);
}

// 悬停以「行政区」为单位，而不是单个环：
// 鼠标从主体移到自己的一个岛上时，AMap 会先 out(旧环) 再 over(新环)，
// 所以 out 只在 adcode 仍然匹配时才清 —— 否则整组高亮会被自己人清掉。
// 一清一设发生在同一次 mousemove 里，Vue 又会合并到同一帧渲染，肉眼看不到闪烁。
function setHoverArea(adcode: string, name: string) {
    if (hoverCode === adcode) return;
    if (hoverCode) applyHover(hoverCode, false);
    hoverCode = adcode;
    hoverArea.value = name;
    applyHover(adcode, true);
}

function clearHoverArea(adcode: string) {
    if (hoverCode !== adcode) return;
    applyHover(adcode, false);
    hoverCode = "";
    hoverArea.value = "";
}

function clearAreaLayer() {
    areaOverlays.forEach((o) => map?.remove(o));
    areaOverlays = [];
    areaFrame = [];
    Object.keys(areaGroups).forEach((k) => delete areaGroups[k]);
    hoverCode = "";
    hoverArea.value = "";
}

// ── 区域线路：钻到区县级之后，把这个区的线路画出来 ──
//
// 刻意**复用「搜城市」那一整套管线**（clearMapLayers / renderLineBatch / 线路索引 / lines），
// 而不是自己再画一遍。理由很实在：
//   · 样式一致是结构保证的 —— 用的是同一个批量渲染器，白色描边、线宽、透明度、
//     手型光标一个字都不会差；将来改样式也只有一处
//   · 点选、底部详情、站点圆圈、反向切换、候选弹窗全部现成可用
// 所以这里只做一件事：把接口数据凑成 pipeline 认识的 BusLine，喂给它。
let areaLineSeq = 0;
const areaLineBusy = ref(false);
const areaLineProgress = ref({ loaded: 0, total: 0, drawn: 0 });

function clearAreaLines() {
    areaLineSeq++; // 正在跑的批次循环会看到序号变了，自己退出
    clearMapLayers(); // 线路、站点、选中态、详情面板一起重置
    areaLineBusy.value = false;
    areaLineProgress.value = { loaded: 0, total: 0, drawn: 0 };
}

// 全量拉、边收边画：一个区县可能有几百条（昌平区 639 条），分批能让画面尽早有东西，
// 进度也可控 —— 与 loadData 的做法完全一致（连每批 100 条、配色按累计下标都一致）。
async function loadAreaLines(adcode: string) {
    if (!adcode || !map) return;

    clearMapLayers();
    const token = ++areaLineSeq;
    areaLineBusy.value = true;
    areaLineProgress.value = { loaded: 0, total: 0, drawn: 0 };

    const visibleLines: BusLine[] = [];
    const visibleById = new Map<string, BusLine>();
    const limit = 100;

    try {
        for (let offset = 0; ; offset += limit) {
            const res = await request("/api/buslines/byAreaAll", {
                query: { adcode, offset, limit, epsilon: 12 },
            });
            if (token !== areaLineSeq || !map) return; // 已被更晚的一次下钻取代
            if (res?.code !== 200) return;
            if (!areaLineProgress.value.total) areaLineProgress.value.total = res.total ?? 0;

            // 配色按「累计下标」分配，和 loadData 同一套规则，颜色才不会跳
            const batch = (res.data ?? []).map((line: any, i: number) => {
                const [c1, c2] = PALETTE[(offset + i) % PALETTE.length]!;
                return { ...line, color: c1, color2: c2 } as BusLine;
            });
            const visibleBatch = appendVisibleLines(visibleLines, visibleById, batch);
            indexStops(visibleBatch);
            batch.forEach((line) => linesById.set(line.id, line));

            // 地图与列表只显示正向线路，正反向完整数据保存在 linesById 供切换使用。
            renderLineBatch(visibleBatch);
            lines.value = visibleLines.slice();
            areaLineProgress.value.drawn = lines.value.length;

            areaLineProgress.value.loaded = offset + batch.length;
            if (res.done || !batch.length) break;
        }
    } catch (e) {
        console.warn("[areaLayer] 区域线路加载失败：", e);
    } finally {
        if (token === areaLineSeq) areaLineBusy.value = false;
    }
}

// 画某个范围：下级区块 + 它自己的外框。
// 服务端会顺手把「下级只有一个且它还有下级」的虚拟层跳掉（北京城区），
// 并回传 ancestors 给面包屑用 —— 所以这里只管画。
async function renderArea(adcode: string, precision: "overview" | "detail") {
    if (!map) return;
    const token = ++areaSeq;
    areaLoading.value = true;
    try {
        const res = await request("/api/citycodes/districts/childrenRings", {
            query: { adcode, precision },
        });
        if (token !== areaSeq || !map) return; // 已被更晚的一次下钻取代
        if (res?.code !== 200) return;

        clearAreaLayer();

        const scope = res.scope || {};
        areaScope.value = {
            adcode: String(scope.adcode ?? adcode),
            name: scope.name ?? "",
            level: scope.level ?? "",
        };
        if (Array.isArray(scope.ancestors) && scope.ancestors.length) {
            areaTrail.value = scope.ancestors;
        }

        // 当前范围的外框：下钻之后不至于迷失自己在哪。国家级为空（底图本来就有国界）。
        //
        // ★ 用 **Polyline**（每个环一条）而不是 Polygon，这是踩过两次坑之后的选择：
        //   · Polygon 的填充哪怕 fillOpacity 0 也照样参与命中检测，压在子块之上会把
        //     整片区域的悬停和点击吃光（实测下钻后 8/8 点位无响应）；
        //   · 压到子块之下又会被子块自己的边界盖住 —— 外框和子块的外沿几乎是同一条线
        //     （只是抽稀精度不同：省 1200m vs 区县 80m），只有两条线错开的地方才露出来，
        //     看起来就是「边界线时有时无」。
        // 折线只在描边上命中、内部可穿透，所以既能放在子块之上，又不挡子块的交互。
        const frameRings: number[][][] = (scope.rings || [])
            .map(flatRingToPath)
            .filter((p: number[][]) => p.length >= 2);
        if (frameRings.length) {
            areaFrame = frameRings.map((path: number[][]) => {
                const line = new AMap.Polyline({
                    path,
                    strokeColor: "#b8860b",
                    strokeWeight: 2,
                    strokeOpacity: 0.9,
                    strokeStyle: "dashed",
                    // 层级：区域块 2 < 外框 8 < 线路 10/50/100
                    zIndex: 8,
                });
                map.add(line);
                areaOverlays.push(line);
                return line;
            });
        }

        for (const item of res.data || []) {
            const rings: number[][] = (item.rings || [])
                .map((ring: number[]) => ({ ring, area: ringArea(ring) }))
                .sort((a: any, b: any) => b.area - a.area)
                .slice(0, RING_LIMIT)
                .map((entry: any) => entry.ring);

            const group: any[] = [];
            for (const ring of rings) {
                const path = flatRingToPath(ring);
                if (path.length < 3) continue; // 成不了面的碎环直接跳过
                const poly = new AMap.Polygon({
                    path,
                    strokeColor: "#5b7c99",
                    strokeWeight: 1,
                    strokeOpacity: 0.85,
                    fillColor: "#7ba7c9",
                    fillOpacity: 0.14,
                    cursor: "pointer",
                    // 区域块压在线路之下（线路走 STYLE.default，zIndex 10）：
                    // 层级定成 区域块 2 < 外框 8 < 线路 10/50/100，
                    // 这样线路永远在最上面，不会被半透明的省块盖住。
                    zIndex: 2,
                    // 注意：这里**不能**用 bubble: false —— 实测那样连覆盖物自己的
                    // mouseover / click 都不再触发（AMap 的命中检测与冒泡是同一套机制）。
                    // 与「点空白处取消选中线路」的隔离改用时间戳，和线路点击同一套路。
                });
                poly.on("mouseover", () => setHoverArea(item.adcode, item.name));
                poly.on("mouseout", () => clearHoverArea(item.adcode));
                poly.on("click", () => {
                    // 点击即下钻：换成它这一级重画。
                    // 区县级没有下级，就停在它自己身上（只剩外框），不再往下。
                    lastAreaClickAt = Date.now();
                    renderArea(String(item.adcode), "detail");
                });
                map.add(poly);
                group.push(poly);
            }
            if (group.length) {
                areaGroups[item.adcode] = group;
                areaOverlays.push(...group);
            }
        }

        // 取景：国家级回到固定的全国视野，下钻时按各块 bbox 求并集 setBounds。
        //
        // 国家级**不能**用 setBounds：中国的 bbox 接近正方形，塞进 2.4:1 的横向视口后
        // 纬度方向会溢出很多（Web Mercator 还会进一步放大高纬度），结果能看到整个亚洲，
        // 反而比写死的 zoom/center 差。下钻到省 / 市时 bbox 小得多，setBounds 就合适了。
        if (String(scope.adcode) === "100000") {
            map.setZoomAndCenter(5, [104.2, 35.8]);
        } else {
            const boxes = (res.data || []).map((item: any) => item.bbox).filter(Boolean);
            if (scope.bbox) boxes.push(scope.bbox);
            if (boxes.length) {
                let minLng = Infinity;
                let minLat = Infinity;
                let maxLng = -Infinity;
                let maxLat = -Infinity;
                for (const box of boxes) {
                    if (box[0] < minLng) minLng = box[0];
                    if (box[1] < minLat) minLat = box[1];
                    if (box[2] > maxLng) maxLng = box[2];
                    if (box[3] > maxLat) maxLat = box[3];
                }
                map.setBounds(new AMap.Bounds([minLng, minLat], [maxLng, maxLat]));
            }
        }

        // 只有钻到区县级（最后一层）才查线路。
        // 省 / 市级动辄几千条（北京 4120），而这一步要回答的是"这个区有哪些线路"，
        // 区县级的量才合适；往上退时顺手把线路清掉。
        if (String(scope.level) === "district") loadAreaLines(String(scope.adcode));
        else clearAreaLines();
    } catch (e) {
        // 区域块是锦上添花：加载失败不该影响搜线路，所以只记一笔、不打扰用户。
        // 但一定要留下痕迹 —— 吞掉异常会让"什么都没画出来"变成一个查不出原因的现象。
        console.warn("[areaLayer] 区域块加载失败：", e);
    } finally {
        if (token === areaSeq) areaLoading.value = false;
    }
}

// 面包屑：跳回任意一级。点当前这一级不做任何事。
function goToArea(index: number) {
    if (index < 0 || index >= areaTrail.value.length) return;
    if (index === areaTrail.value.length - 1) return;
    const target = areaTrail.value[index];
    renderArea(String(target.adcode), String(target.adcode) === "100000" ? "overview" : "detail");
}

// 初始化地图（仅创建一次）
async function initMap() {
    if (!import.meta.client) return;

    // @ts-ignore
    window._AMapSecurityConfig = { securityJsCode: config.public.mapsc };

    const { default: AMapLoader } = await import("@amap/amap-jsapi-loader");
    AMap = await AMapLoader.load({
        key: config.public.mapscKey as string,
        version: "2.0",
    });

    map = new AMap.Map(mapRef.value!, {
        // 初始视野给全国：这一屏先让用户挑区域（区域块在省级）。
        // 搜城市不受影响 —— loadData 末尾会 setFitView 到线路范围。
        zoom: 5,
        center: [104.2, 35.8],
        mapStyle: "amap://styles/whitesmoke", // 浅色极简底图，凸显公交线路
    });

    // 点击地图：命中线路则选中；多条线路时弹候选
    map.on("click", onMapClick);

    // 指针离开地图时收掉区域浮标。
    // 不能只靠多边形的 mouseout：指针直接移出画布时 AMap 不会再做命中检测，
    // 那个多边形的 mouseout 就永远不触发，浮标会一直挂着上一个区域的名字。
    map.on("mouseout", () => {
        if (hoverCode) clearHoverArea(hoverCode);
    });

    // 区域块延后加载：先把地图显示出来，别让边界数据挡住首屏
    renderArea("100000", "overview");

    // await loadData(keywordInput.value);
}

onMounted(initMap);

onUnmounted(() => {
    stopLoad(); // 卸载时先终止分页轮询
    clearAreaLines();
    clearAreaLayer();
    map?.destroy();
});

// 路由离开（如切到其他页面）时也终止轮询
onBeforeRouteLeave(() => {
    stopLoad();
});
</script>

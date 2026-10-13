// 公交线路库页用到的纯函数（无状态、无副作用）。
// 页面和各子组件共用，放这里避免每个组件各抄一份。

const LEVEL_TEXT: Record<string, string> = {
	country: '国家级', province: '省级', city: '市级', district: '区县级', street: '街道级'
}

export function levelText(level: any): string {
	return LEVEL_TEXT[String(level ?? '')] ?? '—'
}

// 这条线在选中区域里的角色。isStart / isEnd 都是 1 = 首末站都在这个范围内
// （环线、短线很常见），不是「途经」。
export function roleKey(row: any): 'both' | 'start' | 'end' | 'via' {
	if (row?.isStart && row?.isEnd) return 'both'
	if (row?.isStart) return 'start'
	if (row?.isEnd) return 'end'
	return 'via'
}

export function roleText(row: any): string {
	return { both: '始发+终到', start: '始发', end: '终到', via: '途经' }[roleKey(row)]
}

export function statusText(status: any): string {
	const map: Record<number, string> = { 0: '停运', 1: '正常', 2: '规划中', 3: '在建' }
	return map[Number(status)] ?? String(status ?? '-')
}

// 首末班合成一列显示
export function timeRange(row: any): string {
	const s = row?.start_time
	const e = row?.end_time
	if (!s && !e) return '-'
	return `${s || '-'} - ${e || '-'}`
}

// UI色：兼容 "ff0000" 和 "#ff0000"；空值返回空串（让 CSS 用默认色）
export function colorOf(c: any): string {
	const s = String(c ?? '').trim()
	if (!s) return ''
	return /^[0-9a-fA-F]{6}$/.test(s) ? `#${s}` : s
}

// 站点序号底色取自线路 UI 色，浅色底上白字会糊掉——
// 按 YIQ 亮度自动在白字与墨色字之间切换（色值无法解析时回退白字）
export function contrastOn(c: any): string {
	const m = /^#?([0-9a-fA-F]{6})$/.exec(colorOf(c))
	if (!m || !m[1]) return '#fff'
	const v = parseInt(m[1], 16)
	const r = (v >> 16) & 255
	const g = (v >> 8) & 255
	const b = v & 255
	const yiq = (r * 299 + g * 587 + b * 114) / 1000
	return yiq > 150 ? 'var(--ink)' : '#fff'
}

// 时间间隔格式化为可读（如 00:30:00 -> 30分钟）
export function formatInterval(t: string): string {
	const m = String(t).split(':')
	const hours = Number(m[0]) || 0
	const mins = Number(m[1]) || 0
	if (hours && mins) return `${hours}小时${mins}分钟`
	if (hours) return `${hours}小时`
	return `${mins}分钟`
}

// 详细时间字段是「URL 编码的 JSON 串」，拆成可读的排班描述
export function formatTimeDesc(raw: any): string {
	if (!raw) return '-'
	// 1. 先尝试 URL 解码 + JSON 解析
	try {
		const decoded = decodeURIComponent(String(raw))
		const parsed = JSON.parse(decoded)
		// 优先用 allRemark（已是组装好的可读文本）
		if (parsed.allRemark) return parsed.allRemark
		// 否则遍历 rule_group 拼装
		if (Array.isArray(parsed.rule_group) && parsed.rule_group.length) {
			return parsed.rule_group
				.map((g: any) => {
					const month = g?.date?.month_range || ''
					const time = g?.time_group?.map((t: any) => {
						const st = t?.start_time?.slice(0, 5) ?? ''
						const et = t?.end_time?.slice(0, 5) ?? ''
						return st && et ? `${st}-${et}` : ''
					}).filter(Boolean).join(', ')
					const interval = g?.time_group?.[0]?.interval_time
						? ` ${formatInterval(g.time_group[0].interval_time)}/趟` : ''
					return [month, time, interval].filter(Boolean).join(' ') || ''
				})
				.filter(Boolean)
				.join('\n')
		}
		return decoded
	} catch {
		// 解析失败则原样返回
		return String(raw)
	}
}

// 地图下钻用：返回某个范围的下级行政区几何（rings / center / bbox）。
//
// 与 /children 的分工：那个只给树用的名字和 hasChildren，这里要能直接画。
//
// 两个刻意的设计：
//   · **虚拟层自动下探**。直辖市的层级是「北京市 → 北京城区 → 东城区」，
//     「北京城区」是个和北京一样大的虚拟层，按 parent 渲染会得到一个孤零零的
//     大色块，看起来像点击没反应。所以下层只有一个且它还有下级时，自动再往下走一层。
//   · **两级精度**。初始视图要一次画出 34 个省，按 detail 抽稀合计 16MB，只能给
//     overview（容差 8000m，≈z4 时一个像素）；下钻之后每次只画十几个区县，用 detail 才够清楚。
import { bboxOfRings, parseRings } from '../../../utils/geo'
import {
  bboxToArray, centerOfRings, epsilonFor,
  ringsToFlat, simplifyRings, type Precision,
} from '../../../utils/boundary'

// 自动下探的层数上限。正常只会跳「北京城区」这一层，给 3 层是兜底防环
const MAX_SKIP = 3

export default defineEventHandler((event) => {
  try {
    const query = getQuery(event)
    const adcode = String(query.adcode ?? '').trim() || '100000'
    const precision: Precision = String(query.precision ?? '') === 'overview' ? 'overview' : 'detail'

    const db = getDb()

    const scope = db
      .prepare('SELECT adcode, name, level, parent_adcode, polyline FROM city_codes WHERE adcode = ? LIMIT 1')
      .get(adcode) as any
    if (!scope) return { code: 404, msg: '没有这个行政区', data: [] }

    // 取下级；只有一个、且它自己还有下级时继续下探（虚拟层）
    const skipped: string[] = []
    let parent = String(scope.adcode)
    let children = queryChildren(db, parent)
    while (children.length === 1 && skipped.length < MAX_SKIP) {
      const only = children[0] as any
      const grand = queryChildren(db, String(only.adcode))
      if (!grand.length) break
      skipped.push(String(only.adcode))
      parent = String(only.adcode)
      children = grand
    }

    // hasChildren 一次性批量查，别在循环里 N+1
    const withChildren = new Set<string>()
    if (children.length) {
      const marks = children.map(() => '?').join(',')
      for (const row of db
        .prepare(`SELECT DISTINCT parent_adcode AS p FROM city_codes WHERE parent_adcode IN (${marks})`)
        .all(...children.map((c: any) => String(c.adcode))) as any[]) {
        withChildren.add(String(row.p))
      }
    }

    const data = children.map((row: any) => {
      const level = String(row.level ?? '')
      const rings = simplifyRings(parseRings(row.polyline), epsilonFor(level, precision))
      return {
        adcode: String(row.adcode),
        name: row.name,
        level,
        hasChildren: withChildren.has(String(row.adcode)),
        center: centerOfRings(rings),
        bbox: bboxToArray(bboxOfRings(rings)),
        rings: ringsToFlat(rings),
      }
    }).filter((item: any) => item.rings.length > 0)

    // 当前范围自己的轮廓：当「外框」用，下钻后不至于迷失自己在哪。
    // 国家级不返回：库里国界 3.4MB、抽稀后仍约 1MB，而底图本来就有国界轮廓。
    const scopeLevel = String(scope.level ?? '')
    const scopeRings = scopeLevel === 'country'
      ? []
      : simplifyRings(parseRings(scope.polyline), epsilonFor(scopeLevel, precision))

    // 祖先链（根 → 当前范围）：面包屑直接用，免得前端再自己拼 parent 关系。
    // 层级最多 4 层（国/省/市/区县），8 是兜底防环。
    const chain: any[] = []
    let cursor: any = scope
    for (let i = 0; i < 8 && cursor; i++) {
      chain.unshift({
        adcode: String(cursor.adcode),
        parentAdcode: cursor.parent_adcode ? String(cursor.parent_adcode) : '',
        name: cursor.name,
        level: String(cursor.level ?? ''),
      })
      const parentCode = cursor.parent_adcode
      cursor = parentCode
        ? db.prepare('SELECT adcode, name, level, parent_adcode FROM city_codes WHERE adcode = ? LIMIT 1').get(String(parentCode))
        : null
    }

    // 折叠虚拟层：父级只有它一个子级的节点不算一级。
    // 「北京城区」是「北京市」的独子，地图下钻会自动跳过它，面包屑跟上才一致；
    // 首节点（根）与末节点（当前范围）永远保留，否则面包屑会缺头少尾。
    const isSoleChild = (code: string) => {
      if (!code) return false
      const row = db.prepare('SELECT parent_adcode AS p FROM city_codes WHERE adcode = ? LIMIT 1').get(code) as any
      if (!row?.p) return false
      const count = db.prepare('SELECT COUNT(*) AS n FROM city_codes WHERE parent_adcode = ?').get(String(row.p)) as any
      return count?.n === 1
    }
    const ancestors = chain
      .filter((node, i) => i === 0 || i === chain.length - 1 || !isSoleChild(node.adcode))
      .map(({ adcode, name, level }) => ({ adcode, name, level }))

    return {
      code: 200,
      msg: 'ok',
      precision,
      // 实际取的是哪一级的下级（自动下探后可能与请求的 adcode 不同）
      scope: {
        adcode: String(scope.adcode),
        name: scope.name,
        level: scopeLevel,
        childrenOf: parent,
        skipped,
        ancestors,
        center: centerOfRings(scopeRings),
        bbox: bboxToArray(bboxOfRings(scopeRings)),
        rings: ringsToFlat(scopeRings),
      },
      total: data.length,
      data,
    }
  } catch (error) {
    return { code: 500, msg: String(error), data: [] }
  }
})

function queryChildren(db: any, adcode: string): any[] {
  return db
    .prepare('SELECT adcode, name, level, polyline FROM city_codes WHERE parent_adcode = ? ORDER BY adcode')
    .all(adcode) as any[]
}

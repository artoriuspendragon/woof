# 技术实现方案（§20.C）

> 对应 GDD §20.C。本文是**工程实现**：技术选型、地图表示决策、模拟 Tick 工程化、配置表、存档、事件系统架构、项目结构与性能。
> 数据模型与子系统逻辑见 [`01-prototype-system-breakdown.md`](./01-prototype-system-breakdown.md)（本文不重复定义接口）；界面见 [`03-ui-ux-spec.md`](./03-ui-ux-spec.md)。

---

## 1. 技术选型（已定：Web + TypeScript + Canvas）

| 维度 | 选择 | 理由 |
|---|---|---|
| 语言 | **TypeScript**（strict） | 数据模型复杂，强类型挡住状态 bug；接口即文档 |
| 渲染 | **Canvas 2D** | 瓦片地图 + 柔和色块边界足够用，零依赖，调试简单 |
| 构建 | **Vite** | 秒级 HMR、原生 TS、`import` 配置表即所得 |
| UI/HUD | **原生 DOM + CSS** | HUD 浮在 Canvas 上，DOM 做卡片/日志/工具栏，契合"非页游、低 UI 压迫"（§15） |
| 状态 | **自写极简 store**（发布订阅） | 不引入 React/Vue，避免框架重量；模拟是命令式的，框架收益低 |
| 测试 | **Vitest** | 与 Vite 同源；重点测确定性与数值不溢出 |
| 包管理 | pnpm（或 npm） | — |

**不引入**：游戏引擎、ECS 框架、状态管理库、UI 框架。MVP 规模（≤ ~150×100 网格、5 国、季度 tick）主线程 Canvas 2D 完全够。

**升级路径**（仅在性能或需求触顶时）：
- 渲染瓶颈 → 换 **PixiJS / WebGL**（瓦片批渲染）。
- 模拟卡顿主线程 → 把 `sim/` 整体搬进 **Web Worker**（它是纯函数、无 DOM，天然可迁移）。
- 大世界 → 瓦片**分块（chunk）**脏标记重绘。

---

## 2. 关键决策：地图格子 vs 区域图

**结论：方格网格（square tile grid）。** 这是 GDD §20.C 的明确待决项。

| 方案 | 优点 | 缺点 | 裁决 |
|---|---|---|---|
| **方格网格** ✅ | 绘制直观（画笔=改 tile）、邻居数学简单（4/8 邻）、领土生长=洪泛、WorldBox 同款、可读 | 边界呈格子感（用柔和色块/描边软化） | **MVP 采用** |
| 六边形 | 距离/邻接更自然 | 坐标系与绘制复杂，可读性提升对本作收益小 | 否 |
| 区域图（省份多边形） | 边界天然平滑、像《文明》 | 玩家"画世界"要先生成多边形，绘制体验差；领土增减难 | 否（与"玩家自由绘制"§3.2 冲突） |

**网格规格（MVP）**：默认 `128 × 96`，可配置。`tiles: Tile[]` 行主序，`index = y*width + x`。邻居用预算的偏移数组。河流在 MVP 作为**地形类型**占整格（兼顾绘制简单与天然边界/贸易加成）；边线式河流（占 tile 之间的边）列为 v0.2 视觉升级。

**领土表示**：`Tile.owner` 唯一真相，**不**维护多边形。渲染时用"同主相邻格融合 + 柔和色块 + 外描边"画出国界（见 03 文档）。领土增减 = 改 `owner` + 标记该区块脏。

---

## 3. 模拟 Tick 工程化

### 3.1 固定步长 + 渲染解耦

模拟是**确定性、固定步长**；渲染是**尽力而为、插帧**。两者用累加器解耦：

```ts
const SIM_HZ_BY_SPEED = { pause: 0, x1: 2, x2: 4, x4: 8 }; // 每秒推进的 tick(季节) 数
let acc = 0, last = performance.now();

function frame(now: number) {
  const dt = (now - last) / 1000; last = now;
  const hz = SIM_HZ_BY_SPEED[speed];
  if (hz > 0) {
    acc += dt * hz;
    let budget = 4;                  // 单帧最多追 4 tick，防卡死后疯狂追帧
    while (acc >= 1 && budget-- > 0) { tick(world); acc -= 1; }
    if (acc > budget) acc = 0;       // 丢弃积压
  }
  render(world);                     // 渲染读快照，不改 world
  requestAnimationFrame(frame);
}
```

- **倍速只改 `hz`**，不改 `tick()` 内部 → 确定性不受帧率/机器影响。
- **暂停** = `hz=0`，渲染继续（仍可平移、选中、查看）。
- `tick(world)` 严格按 01 文档 §2 的 11 步顺序。

### 3.2 确定性 PRNG

```ts
// mulberry32：单状态、可序列化、快
function makeRng(state: number) {
  return {
    get state() { return state; },
    next(): number {                 // [0,1)
      state |= 0; state = (state + 0x6D2B79F5) | 0;
      let t = Math.imul(state ^ (state >>> 15), 1 | state);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    int(n: number) { return Math.floor(this.next() * n); },
    pick<T>(arr: T[]) { return arr[this.int(arr.length)]; },
  };
}
```

- 全局唯一实例，`world.rngState = rng.state` 每 tick 末写回，存档保存。
- **铁律**：`sim/` 内禁止 `Math.random()`、`Date.now()`、`Object.keys` 依赖插入序（用排序后的 `nationId` 遍历）。这是同种子重现历史的前提。
- 建议加 ESLint 规则禁止 `sim/` 目录使用上述非确定性 API。

### 3.3 状态变更纪律

`tick()` 直接**原地修改** `world`（命令式、零分配、好调试）。渲染只读，绝不写。需要"上一帧对比"（如边界变化高亮）时，渲染层自己维护轻量 diff，不污染 `world`。

---

## 4. 配置表（数据驱动）

所有可调内容外置为 TS 模块（编译期类型检查 + 零运行时解析开销）。GDD §17 的 JSON 草案直接转成带类型的常量。

```
src/data/
  species.ts     # SpeciesDef[]  —— §17.1 + §7.1 基础参数 + §16.4 能力
  terrain.ts     # TERRAIN_YIELD / SEASON_MUL / 通行/防御系数 —— §4.2
  resources.ts   # RESOURCE_YIELD / 偏好映射 —— §4.3
  relations.ts   # NATURAL_RELATION[species][species] —— §6
  events.ts      # EVENT_DEFS: EventDef[] —— §17.3 / §12.2
  balance.ts     # 全局常量：FOOD_PER_CAPITA、增长率、tick 行动额度 等
```

示例（与 01 文档接口一致，类型由 `as const satisfies` 守护）：

```ts
export const SPECIES: Record<Species, SpeciesDef> = {
  dog: {
    species: 'dog', displayName: '狗国',
    baseTraits: { aggression:60, loyalty:85, expansion:65, trade:45,
      intrigue:30, engineering:55, tradition:70, curiosity:60, revenge:65, stability:80 },
    preferredTerrain: ['plain','forest','hill'],
    preferredResources: ['bone','food','iron'],
    mvpBonus: { armyOrganization: 0.20, stability: 0.10 },
  },
  // cat / fox / mole / badger ...
};

export const EVENT_DEFS: EventDef[] = [
  { id:'harvest_good', level:'minor', tags:['economy'],
    conditions:{ season:'spring', terrain:['plain'], stat:{ food:{ gt:50 } } },
    probability:0.25, effects:{ food:+30, morale:+5 },
    logTemplate:'第{year}年{season}，{nation}的牧场迎来丰收，储备的食物更多了。' },
  // ...
];
```

`EventDef` 的 `conditions`/`effects` 是**声明式 DSL**（小型谓词对象），由事件引擎统一解释（见 §6）——新增事件只改数据，不改代码。这正是"离谱可解释、可调参"的工程基础。

---

## 5. 存档系统

### 5.1 存的就是 `WorldState`

`WorldState`（01 文档 §1）被设计为**完全可序列化**：`JSON.stringify(world)` 即存档，`JSON.parse` + `recomputeDerived()` 即读档。派生缓存（`territory`、`relation.status`）不依赖存档，启动重算。

```ts
function save(world: WorldState): string {
  return JSON.stringify({ ...world, version: SAVE_VERSION });
}
function load(json: string): WorldState {
  const raw = JSON.parse(json);
  const migrated = migrate(raw);     // 按 version 逐级升级
  recomputeDerived(migrated);        // 重建缓存 + 恢复 rng
  return migrated;
}
```

### 5.2 落盘方式（MVP）

| 渠道 | 用途 |
|---|---|
| **localStorage** | 自动存档 / 快速续玩（key 含 slot） |
| **导出/导入 `.json`** | 玩家手动备份；为 v0.4"分享世界"铺路 |
| `version` + `migrate()` | 结构演进不丢档 |

### 5.3 种子回放（v0.4 预留）

因模拟确定性，长远可只存 `seed + 初始地图 + interventions[]`，重放得到完整历史 → 极小的"可分享世界种子"（GDD §18 v0.4）。MVP 仍以**全量快照**为主（健壮、读取快），种子回放作为附加导出。

---

## 6. 事件系统架构

事件引擎是"故事输出器"的执行器，对应 01 文档 §7。

```text
┌─────────────┐   声明式      ┌──────────────┐
│ EVENT_DEFS  │ ──conditions─▶│ EventEngine  │
│ (data/)     │ ──effects────▶│  evaluate()  │
└─────────────┘   template    └──────┬───────┘
                                      │ push
                          系统事件 ───┤ (war/diplomacy/expand 直接 emit)
                                      ▼
                                 world.log[]  ──▶ UI 日志/筛选/追溯
```

- **EventEngine.evaluate(ctx)**：遍历 `EVENT_DEFS`，`checkConditions`（解释 DSL）→ `rng.next() < probability` → `applyEffects` → `render(template, ctx)` → `log.push`。
- **系统事件**：war/diplomacy/expand 等系统在状态变更处直接 `emitLog(...)`，保证每个变更可追溯（无"无声突变"）。
- **模板渲染**：`{year}{season}{nation}{ruler}` 等占位符插值，文案库即 GDD §14.3/§17.3。
- **可观测性**：所有 `log` 带 `tags`/`nation`/`level`，UI 直接做筛选与因果回放。

---

## 7. 项目结构

```
woof/
├─ index.html
├─ package.json
├─ tsconfig.json            # strict: true
├─ vite.config.ts
├─ docs/                    # 本套设计文档
└─ src/
   ├─ main.ts               # 启动：建 world / 注册循环 / 挂 UI
   ├─ sim/                  # ★ 纯模拟，无 DOM、可搬进 Worker、确定性
   │  ├─ world.ts           # createWorld / recomputeDerived / 类型
   │  ├─ tick.ts            # 主循环 11 步编排
   │  ├─ rng.ts             # mulberry32
   │  ├─ events.ts          # EventEngine
   │  └─ systems/
   │     ├─ production.ts    population.ts  build.ts
   │     ├─ ai.ts           diplomacy.ts   war.ts
   │     └─ characters.ts
   ├─ data/                 # ★ 配置表（§4）
   │  ├─ species.ts terrain.ts resources.ts relations.ts events.ts balance.ts
   ├─ render/               # ★ Canvas，只读 world
   │  ├─ renderer.ts        # 帧调度 + 图层合成
   │  ├─ camera.ts          # 平移/缩放、屏↔格坐标
   │  ├─ terrainLayer.ts    # 离屏缓存，仅编辑时重绘
   │  ├─ territoryLayer.ts  # 柔和色块国界，边界变更时重绘
   │  ├─ markerLayer.ts     # 资源点/城市/事件图标
   │  └─ fxLayer.ts         # 选中光晕、战争/干预动效
   ├─ ui/                   # ★ DOM HUD（§03）
   │  ├─ hud.ts statusBar.ts toolbar.ts nationCard.ts eventLogPanel.ts interventions.ts
   ├─ editor/               # 设计世界阶段
   │  └─ painter.ts         # 地形/河流/国家/资源画笔 → 改 tiles
   ├─ state/
   │  ├─ store.ts           # 极简发布订阅（UI 选中态、速度、工具等 UI 状态）
   │  └─ save.ts            # save/load/migrate
   └─ assets/               # 图标、配色、字体
```

**分层铁律**：依赖方向 `data → sim → (render / ui / editor)`。`sim/` 不 import `render/`、`ui/`、DOM。这条线保证模拟可测、可确定性、可搬 Worker。

---

## 8. 性能预算

| 项 | MVP 目标 | 手段 |
|---|---|---|
| 网格规模 | 128×96 ≈ 1.2 万 tile | 数组而非对象图；行主序连续内存 |
| tick 耗时 | < 5 ms（x4 速即 8 tick/s 留足余量） | 原地修改、零分配、避免每 tick 全图扫描时建临时对象 |
| 渲染 | 稳定 60 FPS | **图层离屏缓存 + 脏重绘**：地形只在编辑时重画；国界只在边界变化时重画；每帧只合成 + 画动效层 |
| 内存 | 单世界 < 数十 MB | log 超长时分页/截断 UI（数据仍保留，可导出） |

如未来触顶：sim 入 Worker（postMessage 传快照）、渲染换 PixiJS、瓦片分块脏标记。

---

## 9. 实施里程碑（建议落地顺序）

> 仅工程顺序建议；本文档不含代码，写码是下一阶段。

1. **脚手架**：Vite + TS strict + Vitest，`sim/world.ts` 类型与 `createWorld`，`rng.ts` + 确定性单测。
2. **渲染最小闭环**：camera + terrainLayer，能看到一张静态网格世界。
3. **编辑器**：painter 画地形/河流/资源/国家 → 改 tiles，所见即所得。
4. **模拟骨架**：tick 11 步空实现 → 逐步填 production/population，跑出人口/食物曲线。
5. **AI + 外交 + 战争**：填 ai/diplomacy/war，观察边界变化。
6. **事件引擎 + 编年史**：EventEngine + 数据表 + 日志面板。
7. **HUD**：状态条、国家卡、日志面板、暂停/倍速、3 个干预。
8. **存档**：save/load/导入导出 + 确定性重放验收（01 文档 §9）。

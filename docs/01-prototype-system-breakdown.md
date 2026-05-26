# 原型系统拆分（§20.A）

> 对应 GDD §20.A。本文是 MVP 的**系统级设计**：定义贯穿全项目的权威数据模型、模拟主循环，以及六个核心子系统（地图 / 资源生产 / 国家 AI Tick / 外交 / 战争结算 / 事件日志）。
> 工程实现细节（技术选型、目录、存档、构建）见 [`02-technical-implementation.md`](./02-technical-implementation.md)；界面表现见 [`03-ui-ux-spec.md`](./03-ui-ux-spec.md)。

---

## 0. 设计约束（从 GDD 提炼）

| 约束 | 来源 | 对系统的含义 |
|---|---|---|
| 观察 > 操作 | §2.2 | 模拟自循环，玩家输入是稀疏事件，不是每帧操作 |
| 离谱但可解释 | §2.5 | 每个状态变化都要写进事件日志，可追溯因果 |
| 种族有行为味道 | §2.3 | AI 决策必须读取种族基础参数 + 性格，而非纯随机 |
| 故事是核心产物 | §2.4 | 事件日志是一等公民系统，不是 UI 附属 |
| 可分享世界种子 | §18 v0.4 | 模拟必须**确定性**：同种子 + 同干预序列 → 同历史 |

**确定性原则贯穿全文**：所有随机数都来自单一**带种子的 PRNG**，其状态进入存档。系统之间不得使用 `Math.random()`。

---

## 1. 权威数据模型（Single Source of Truth）

下列 TypeScript 接口是全项目唯一的数据真相。`WorldState` 是**完整可序列化状态**——存档 = 把它写成 JSON，读档 = 把 JSON 读回来（见 02 文档存档章节）。

```ts
// ---- 顶层世界状态（= 存档内容）----
interface WorldState {
  version: number;          // 存档结构版本，用于迁移
  seed: number;             // 世界种子
  rngState: number;         // PRNG 当前状态（确定性关键）
  tick: number;             // 已模拟的季节数（0 起）
  width: number;            // 网格宽（tile 数）
  height: number;           // 网格高
  tiles: Tile[];            // 长度 = width*height，行主序 index = y*width + x
  nations: Record<NationId, Nation>;
  characters: Record<CharId, Character>;
  log: LogEntry[];          // 编年史（追加写）
  interventions: Intervention[]; // 玩家干预历史（用于回放/追溯）
}

// ---- 地图 ----
type TerrainType =
  | 'plain' | 'forest' | 'hill' | 'river' | 'lake'
  | 'marsh' | 'sand' | 'snow';            // 'underground' 延后到 v0.2
type ResourceType =
  | 'food' | 'wood' | 'stone' | 'iron' | 'fish' | 'bone'
  | 'honey' | 'berry' | 'mushroom' | 'catnip' | 'shiny';

interface Tile {
  terrain: TerrainType;
  resource: ResourceType | null;  // 资源点；null = 无
  owner: NationId | null;         // 归属国；null = 无主
  dev: number;                    // 开发度 0..100（影响产出）
  // 派生/缓存字段（不入存档，启动时重算）
}

// ---- 国家 ----
type Species = 'dog' | 'cat' | 'fox' | 'mole' | 'badger';
type NationId = string;

interface Nation {
  id: NationId;
  name: string;
  species: Species;
  capitalTile: number;            // tile index
  rulerId: CharId;
  traits: AiTraits;               // 隐藏 AI 倾向（§7），由种族基础值 + 漂移产生
  stats: NationStats;             // 内政指标（§12.1）
  territory: number;              // 领土 tile 数（缓存，权威来源仍是 tiles[].owner）
  relations: Record<NationId, Relation>;
  goals: Goal[];                  // 当前 AI 目标队列
  memory: GrudgeMemory[];         // 复仇记忆（獾国核心机制 §5.5）
  alive: boolean;                 // false = 已灭亡（保留在表中供史书引用）
}

interface AiTraits {              // 0..100，含义见 GDD §7
  aggression: number; loyalty: number; expansion: number;
  trade: number; intrigue: number; engineering: number;
  tradition: number; curiosity: number; revenge: number; stability: number;
}

interface NationStats {           // GDD §12.1
  population: number; food: number; military: number;
  stability: number; morale: number;   // morale = 民心
  wealth: number; culture: number; prestige: number;
}

interface Relation {
  value: number;                  // -100..100
  status: RelationStatus;         // 由 value + 标志位派生，缓存于此
  treaties: TreatyType[];         // 当前有效条约
  secret?: boolean;               // 秘密协议（狐狸国，v0.2 展开）
}
type RelationStatus =
  | 'friendly' | 'neutral' | 'tense' | 'hostile'
  | 'allied' | 'vassal' | 'nemesis';
type TreatyType = 'trade' | 'alliance' | 'truce' | 'marriage';

interface GrudgeMemory {
  against: NationId;
  lostTile: number;               // 失去的 tile
  sinceTick: number;
  intensity: number;              // 随时间缓慢衰减
}

// ---- 角色（MVP 仅 §9.2 八类）----
type CharId = string;
type CharRole = 'king' | 'chancellor' | 'general' | 'noble'; // 民众/兵种为群体，不建个体
interface Character {
  id: CharId; name: string; nation: NationId; role: CharRole;
  loyalty: number; ambition: number; ability: number; prestige: number;
  personality: Personality;       // §9.4
  alive: boolean;
}
type Personality =
  | 'kind' | 'irritable' | 'cunning' | 'lazy' | 'diligent'
  | 'vain' | 'paranoid' | 'warlike' | 'conservative' | 'gluttonous';

// ---- 目标 / 干预 / 日志 ----
interface Goal { kind: GoalKind; target?: NationId | number; weight: number; }
type GoalKind =
  | 'develop' | 'expand' | 'fortify' | 'trade'
  | 'war' | 'intrigue' | 'festival' | 'survive';

interface Intervention { tick: number; kind: string; payload: unknown; }

type LogLevel = 'minor' | 'medium' | 'major' | 'epic'; // §14.2
interface LogEntry {
  tick: number; level: LogLevel; text: string;
  nation?: NationId; tags: string[];   // 供筛选/追溯，如 ['war','badger']
}
```

> **缓存 vs 权威**：`Tile.owner` 是领土的唯一真相；`Nation.territory`、`Relation.status` 是派生缓存，每 tick 末统一重算。读档后跑一次 `recomputeDerived(world)`。

---

## 2. 模拟主循环（Tick）

**1 tick = 1 季节；4 tick = 1 年。** 倍速只改变"每秒推进多少 tick"，不改变单 tick 逻辑（保证确定性）。

每个 tick 严格按 GDD §8.1 顺序执行（顺序固定 = 确定性）：

```text
tick(world):
  1. produce(world)        # 资源生产（§3）
  2. consume(world)        # 人口消耗
  3. population(world)     # 人口增长/下降
  4. build(world)          # 城市/开发度提升
  5. characters(world)     # 角色变化（继承/死亡，MVP 最简）
  6. internalAI(world)     # 内政判断
  7. diplomacyAI(world)    # 外交判断（§5）
  8. warAI(world)          # 战争判断 + 结算（§6）
  9. events(world)         # 事件生成（§7）
  10. recomputeDerived(world)
  11. world.tick++
```

国家遍历顺序按 `nationId` 升序固定。每个系统内部所有随机都走 `rng.next()`。

**决策优先级（§8.2）**：步骤 6–8 内，每个国家按生存 → 内部 → 外部威胁 → 扩张 → 发展 → 阴谋 → 故事的优先级评估，**高优先级满足则消耗本 tick 的"行动额度"**（MVP：每国每 tick 至多 1 个主动行动），避免一个国家一回合既宣战又办节日。

---

## 3. 子系统：资源生产

**目标**：把地形 + 资源点 + 开发度 + 季节 + 种族偏好，折算成国家 `stats` 增量。

每个被占领 tile 的季度产出：

```text
tileYield(tile, nation, season):
  base   = TERRAIN_YIELD[tile.terrain]          # {food,wood,stone,...}
  if tile.resource: base += RESOURCE_YIELD[tile.resource]
  devMul = 0.5 + tile.dev/100 * 0.5             # 开发度 0→0.5x, 100→1.0x
  seaMul = SEASON_MUL[tile.terrain][season]     # 冬季雪地农业↓ 等
  spcMul = species 偏好资源命中 → ×1.25（§16.4）
  return base * devMul * seaMul * spcMul
```

聚合到国家：

```text
produce(world):
  for nation: 清零本季产出累加器
  for tile where owner != null: 把 tileYield 累加到 owner
  for nation:
    nation.stats.food   += yield.food
    nation.stats.wealth += yield.luxury(闪闪石/猫薄荷/蜂蜜...) * 价格
    其余资源进入"建设/军事"池（MVP 简化为 wealth + military potential）
```

**MVP 数值简化**（§16.4）直接作为 `spcMul` 之外的全局系数：狗 +军队组织 20% / 猫 +文化 20% / 狐 +外交 25% / 鼹 +采集 25% / 獾 +防御 30%。

**消耗与人口**（步骤 2–3）：

```text
consume:  foodNeed = population * FOOD_PER_CAPITA + military * FOOD_PER_SOLDIER
          nation.stats.food -= foodNeed
population: balance = food (盈余/赤字)
            盈余 → 人口按增长率上升、stability/morale 微升
            赤字 → 触发饥荒路径：人口下降、stability↓、morale↓、可能 'survive' goal
            food 下限 0（不存负食物，赤字直接转化为人口损失）
```

---

## 4. 子系统：国家 AI Tick

**核心**：每 tick 为每个国家算出一个**主动行动**（或"无为发展"），驱动力 = `AiTraits` + 局势 + 统治者性格。

### 4.1 有效倾向 = 基础 + 调整

```text
effective(trait) = nation.traits[trait]
                 + rulerPersonalityMod(ruler.personality, trait)   # §9.4
                 + situationMod(world, nation)                      # 饥荒↑survive 等
                 + grudgeMod(nation.memory)                         # 复仇记忆↑aggression/revenge
clamp 到 0..100
```

`rulerPersonalityMod` 表（节选）：好战 → +aggression/+expansion；仁慈 → +morale/−aggression；狡猾 → +intrigue/+trade；多疑 → −stability/−rebellion。

### 4.2 行动评分（决策示例 §7.2 的实现）

为每个候选 `GoalKind` 算权重，按 §8.2 优先级加上**优先级基线**，取最高者执行：

```text
scoreWar      = f(aggression, expansion, 邻国军力比, 边境摩擦, grudge)
scoreFortify  = f(engineering, tradition, 山地/矿区占比, 受威胁度)
scoreTrade    = f(trade, 邻国友好度, 奢侈资源需求)
scoreIntrigue = f(intrigue, 正面军力弱?, 目标内部不稳)
scoreExpand   = f(expansion, 邻接无主地/弱小邻国)
scoreDevelop  = 基线（总是可选的"无为发展"）
scoreSurvive  = 生存危机时极高（饥荒/被围/叛乱）→ 抢占
```

每个 score 乘以 `(0.85 + 0.3*rng.next())` 引入可控随机（确定性 RNG），避免行为机械。

### 4.3 行动落地

| GoalKind | tick 内效果（MVP） |
|---|---|
| `develop` | 选最高产 tile，`dev += k`；或在边境无主地建城（扩张的和平形态） |
| `expand` | 把相邻**无主** tile 收为己有（受 expansion 与产能限制每 tick 1–2 格） |
| `fortify` | 提升边境/山地 tile 防御值（war 结算时生效），降低被偷袭概率 |
| `trade` | 向友好邻国提条约 → 见外交系统；成功则双方 wealth/relation↑ |
| `war` | 形成宣战理由 → 移交战争系统 |
| `intrigue` | 降低目标 stability/relation（狐狸国扶持叛乱的雏形），暴露则 relation 暴跌 |
| `festival` | 文化/民心↑、少量 wealth 消耗（猫国高频，喜剧事件源） |

每个落地都**写一条日志**（见 §7）。

---

## 5. 子系统：外交

**关系模型**：每个有向国家对一个 `Relation{value,status,treaties}`。MVP 视为对称（A→B 与 B→A 同步更新），秘密协议（非对称）延后 v0.2。

### 5.1 关系漂移

```text
diplomacyDrift(A,B):
  baseline = NATURAL_RELATION[A.species][B.species]   # GDD §6 初始倾向
  value 每 tick 向 baseline 缓慢回归（±1），叠加事件冲击
```

`status` 由 `value` 阈值派生，标志位（条约/宿敌）覆盖：

```text
value >= 60 → friendly;  40..59 → neutral(偏好);  0..39 → neutral
value -1..-39 → tense;  <= -40 → hostile;  <= -75 → nemesis(并写入长期标志)
有 alliance 条约 → allied;  vassal 关系 → vassal
```

### 5.2 外交行动（MVP 四种）

| 行动 | 条件 | 效果 |
|---|---|---|
| 贸易协定 trade | 双方 value≥0、无战争 | 两国 wealth↑、value +5、建立贸易路线（v0.2 细化） |
| 军事同盟 alliance | value≥40、有共同威胁 | 被卷入对方防御战；value +10 |
| 停战 truce | 战争中、一方军力崩溃 | 结束战争，N 年内不可再战 |
| 宣战（理由形成） | 见战争系统 | value 暴跌、进入战争状态 |

`§6 初始关系表`直接写入 `NATURAL_RELATION` 常量（含 `+5/-20` 这类"又欣赏又算计"的双值 → MVP 取均值或随机取一端，记录在日志里以保证可解释）。

---

## 6. 子系统：战争结算

GDD §10 的完整阶段在 MVP 收敛为**单 tick 内的轻量结算**（边境摩擦/动员作为前置状态，不做逐帧行军）。

### 6.1 战争状态机（精简）

```text
tension → declared → resolving → peace
```

- `tension`：两国 `hostile` 且有边境接触 / 资源争夺 / grudge → 累积 `tensionMeter`。
- `declared`：攻方 `scoreWar` 触发 + 有宣战理由（§10.2）→ 进入战争，记录 `casusBelli`。
- `resolving`：每个战争 tick 做一次**战役结算**。
- `peace`：达到结束条件 → 产出战后结果（§10.3）。

### 6.2 战斗力公式

```text
power(attacker, contestedTile):
  = military
  * speciesCombatMul        # 狗+组织, 獾+防御(守方), 猫缅因近战 等
  * terrainMul(tile)        # 山地利守, 平原利攻/骑兵
  * moraleMul(morale)       # 蜜獾劣势更猛：劣势时 morale 不降反升
  * (0.8 + 0.4*rng.next())  # 战争迷雾（确定性随机）

守方额外 +fortify 值（来自 fortify 行动）
```

每个战争 tick：比较攻守 `power`，败方按比例损失 `military` 与争议 tile 控制权；`military` 见底则崩溃 → 进入 `peace`。

### 6.3 结束条件与结果（§10.3）

| 条件 | 结果 | 数据变更 |
|---|---|---|
| 一方军力崩溃且实力悬殊 | 完全吞并 | 败方所有 tile.owner → 胜方；败方 `alive=false` |
| 一方军力崩溃、实力接近 | 割让边境 | 争议 tile 转移；败方写入 `GrudgeMemory` |
| 攻方占优但不愿耗尽 | 附庸化 | 败方 `relations[胜].status='vassal'` |
| 双方均无力 | 白和平 | 仅 relation/prestige 变动 |
| 攻方崩溃 | 防御方胜 | 攻方 prestige↓、可能内乱 |

**獾国特例**（§5.5 寸土不让）：任何割让/吞并都向败方写 `GrudgeMemory`；獾国 grudge 衰减极慢，国力恢复后 `scoreWar(复仇)` 飙升 → 复仇战争。这是"可解释的离谱"的范例。

战后统一写 `major`/`epic` 级日志，并更新 `prestige`、`morale`、`relations`。

---

## 7. 子系统：事件日志（编年史）

这是游戏的**故事输出器**（§14.1），不是 UI 附属。

### 7.1 两类事件

1. **系统事件（emitted）**：由上面各系统在状态变化时直接 `log.push(...)`（战争结果、扩张、条约、饥荒）。保证因果可追溯。
2. **触发事件（data-driven）**：`events()` 步骤遍历 `EventDef` 配置表，检查 `conditions`，按权重用 `rng` 掷骰，命中则 apply `effects` 并按 `logTemplate` 生成文本（结构见 GDD §17.3）。涵盖丰收、节日、训练场升级、继承危机、商会罢市、黄金/黑暗时代、英雄传说等（§12.2）。

### 7.2 EventDef 评估

```text
events(world):
  for def in EVENT_DEFS:               # 配置表，见 02 文档
    for nation (或 world 级):
      if checkConditions(def, ctx):
        if rng.next() < def.probability:
          applyEffects(def, ctx)
          log.push({tick, level: def.level,
                    text: render(def.logTemplate, ctx),  # 插值 {year}{season}{nation}
                    nation, tags: def.tags})
```

`render` 把 `{year}=floor(tick/4)+1`、`{season}=季节名`、`{nation}=国名`、`{ruler}` 等插入模板（GDD §14.3 / §17.3 示例文案直接可用）。

### 7.3 日志即追溯

每条日志带 `tags` 与 `nation`，UI 可按国家/等级/标签筛选（§14.2）。"谁先占了资源点 / 谁签了盟约 / 谁挑起战争"（§2.5）全部能在日志里回放——这是"离谱可解释"的落地保障。

---

## 8. MVP 系统边界（做 / 不做）

对齐 GDD §16.2 / §16.3：

| 子系统 | MVP 做到 | 延后 |
|---|---|---|
| 地图 | 8 种地表地形、资源点、河流（作地形/边界） | 地下层 v0.2、边线式河流 |
| 资源 | 11 种资源、季节/偏好系数 | 贸易路线细节 v0.2 |
| 国家 AI | 单行动决策、§8.2 优先级 | 多贵族家族博弈 v0.2 |
| 外交 | 4 行动、关系漂移 | 秘密协议/代理人 v0.2、间谍 v0.3 |
| 战争 | 单 tick 战役结算、5 种结果、獾复仇 | 逐帧行军/围城动画 |
| 角色 | 国王/宰相/将军/贵族，死亡即简单继承 | 完整继承/传记 v0.2–v0.3 |
| 事件 | 系统事件 + 配置触发事件 + 编年史 | 完整编年史导出 v0.4 |
| 干预 | 3 个温和干预（丰收祝福/促进和谐/英雄降生） | 强力/喜剧干预扩展 |

---

## 9. 验收：MVP 闭环

> 玩家画地图 → 放 5 国 → 点播放 → 世界自动跑出可读的边界变化与编年史 → 暂停查看国家卡 → 用 1 个干预改变走向 → 继续观察。（§16.1）

可量化验收点：
1. 同一 `seed` + 同一干预序列，重跑两次得到**逐字相同**的 `log`（确定性）。
2. 跑 100 年（400 tick）不崩、无 `food`/`population` 溢出为负或 NaN。
3. 五国行为可被肉眼区分：狐狸多条约/阴谋日志、獾出现复仇战争、猫出现内斗/节日、鼹少正面战争、狗联盟稳定。
4. 每个领土/关系变化都有对应日志条目（无"无声"状态突变）。

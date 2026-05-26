# Woof 🐾

> 一款清新可爱风的单机自动世界模拟游戏 —— 玩家观察狗国 / 猫猫国 / 狐狸国 / 地鼠国 / 獾国
> 五个动物文明在世界里自动扩张、外交、开战、分裂、和解、王朝更替。

## 当前状态（demo / WIP）

* 五国自动生成世界并自动演化
* 国家 AI：发展 / 扩张（自然团块推进）/ 筑垒 / 贸易 / 阴谋 / 节庆
* 外交：关系漂移、接壤生摩擦、同盟、贸易协定
* 战争：军队实体（将领或英雄统率）行军、野战、围城、**兵分两路**（偏将/英雄另领一军）
* 城市：自然选址（地形 + 临水 + 间距 + 稳定），首都最大，城市是堡垒（攻陷需压倒性优势）
* 人物：国王 / 大将 / 英雄，每人一份**列传**记录一生战功与殒落
* 编年史：可筛选、可按事件定位地图；默认只显示大事件，勾选「显示细节」看全部
* 神明干预：丰收祝福 / 促进和谐 / 英雄降生
* 全程**确定性**：同种子重现逐字相同的历史

## 运行

```bash
pnpm install
pnpm dev
# 浏览器打开 http://localhost:5173/
```

操作：拖拽平移 · 滚轮缩放 · 点国家看卡片 · `📖 编年史` 展开 · `空格` 暂停 · `1/2/3` 切倍速 · 右下三个干预

调试 URL 参数：`?seed=` 复现世界 · `?prerun=N` 预跑 N tick · `?focus=<nationId>` 选中某国 · `?bio=1` 配合 focus 展开列传 · `?zoom=N` 设缩放

## 测试与构建

```bash
pnpm typecheck    # tsc --noEmit (strict)
pnpm test         # vitest（含确定性、列传、城市、堡垒断言）
pnpm build        # tsc + vite build
```

## 设计文档

完整设计文档在 [`docs/`](./docs/) ：

* [`00-GDD-v0.1.md`](./docs/00-GDD-v0.1.md) — 原始游戏设计文档（愿景、玩法、五大种族、版本路线）
* [`01-prototype-system-breakdown.md`](./docs/01-prototype-system-breakdown.md) — 数据模型 + 模拟主循环 + 六大子系统
* [`02-technical-implementation.md`](./docs/02-technical-implementation.md) — Web/TS/Canvas 工程方案、Tick 设计、配置表、存档、事件架构、目录、性能
* [`03-ui-ux-spec.md`](./docs/03-ui-ux-spec.md) — UI/UX 规范（布局、状态条、国家卡、编年史、神明干预、视觉禁区）

## 技术栈

Web · TypeScript（strict）· Canvas 2D · Vite · Vitest · 无游戏引擎 / 无 UI 框架

* `src/sim/` —— 纯模拟（无 DOM、可整体搬进 Web Worker），所有随机走唯一的 mulberry32 PRNG
* `src/data/` —— 数据驱动配置表（种族、地形、资源、关系、事件）
* `src/render/` —— Canvas 渲染（地形离屏缓存 + 领土色块 + 国界 + 城市/军队/资源标记 + 动画特效）
* `src/ui/` —— DOM HUD（状态条、国家卡、编年史、列传面板、神明干预）

## 路线图

参见 GDD §18：v0.2 让国家更像国家（亚种 / 地下层 / 叛乱分裂）→ v0.3 让角色更像角色（贵族关系网 / 暗杀）→ v0.4 完整编年史与世界种子分享 → v0.5 玩家更会"导演"。

---

🤖 与 [Claude Code](https://claude.com/claude-code) 协作开发。

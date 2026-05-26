# Woof 🐾

[中文](./README.md) · **English**

> A cozy single-player auto-world simulation. You watch five cute animal civilizations —
> Dogs, Cats, Foxes, Moles, Badgers — automatically expand, befriend, betray, besiege,
> rise, and fall on a procedurally-generated continent.

🌐 **Live demo:** https://artoriuspendragon.github.io/woof/

## Current state (demo / WIP)

* Procedural continent generated for each seed
* Nation AI: develop / expand (organic blob growth) / fortify / trade / intrigue / festival
* Diplomacy: relation drift, **border tension** so neighbors slowly turn hostile, alliances, trade pacts
* Warfare: **army entities** led by a general or a hero, with **BFS pathfinding**, field battles, radiating
  conquest, siege attrition, and **forking off detachments (兵分两路)** under a free hero or a
  freshly-promoted sub-commander
* Cities: naturally sited by terrain + water proximity + spacing + stability. Capital biggest;
  cities are **fortresses** — they only fall to an overwhelming army
* Stat-driven combat (`military^0.88 × food × stability × morale × general ability`) so a big
  but starving / unstable / demoralized nation can lose to a smaller healthy one
* Characters with full **biographies (列传)** — every general / hero / king records their life events
* Chronicle with **detail toggle** (only major beats by default), per-nation filters, click an entry to jump
* 3 god interventions: harvest blessing, foster harmony, hero is born
* Animated FX for battle / siege / build / festival / good / epic / fall
* Bilingual UI (中文 / English), toggle in the top bar (persisted)
* Fully **deterministic** — same seed reproduces the byte-identical chronicle and territory

> Note: the **chronicle text and characters' names are frozen in the language they were emitted in** —
> the UI chrome translates instantly, but the in-world story stays in the language that was active when
> each event happened. Future versions may key the templates and re-render.

## Run locally

```bash
pnpm install
pnpm dev
# open http://localhost:5173/
```

Controls: drag to pan · scroll to zoom · click a nation for its card · `📖 Chronicle` to expand the log · `Space` to pause · `1` / `2` / `3` for speed · three god buttons bottom-right.

Debug URL params: `?seed=N` reproduce a world · `?prerun=N` fast-forward N ticks · `?focus=<nationId>` select a nation · `?bio=1` open its king's biography · `?zoom=N` set the camera scale.

## Tests & build

```bash
pnpm typecheck   # tsc --noEmit (strict)
pnpm test        # vitest — determinism, biographies, fortress, etc.
pnpm build       # tsc + vite build
```

## Design docs

Full design docs in [`docs/`](./docs/) (Chinese):

* [`00-GDD-v0.1.md`](./docs/00-GDD-v0.1.md) — original game design (vision, gameplay, the five species, version roadmap)
* [`01-prototype-system-breakdown.md`](./docs/01-prototype-system-breakdown.md) — data model + simulation loop + six subsystems
* [`02-technical-implementation.md`](./docs/02-technical-implementation.md) — Web/TS/Canvas plan, tick design, config tables, save model, event architecture, layout, performance
* [`03-ui-ux-spec.md`](./docs/03-ui-ux-spec.md) — UI/UX spec (status bar, nation card, chronicle, god interventions, visual taboos)

## Stack

Web · TypeScript (strict) · Canvas 2D · Vite · Vitest · no game engine / no UI framework

* `src/sim/` — pure deterministic simulation (no DOM, ready to move into a Web Worker). All randomness flows through a single mulberry32 PRNG whose state lives in `WorldState.rngState`.
* `src/data/` — data-driven tables (species, terrain, resources, relations, events)
* `src/render/` — Canvas (offscreen terrain cache, soft territory blocks, borders, city/army/resource markers, animated FX)
* `src/ui/` — DOM HUD (status bar, nation card, chronicle, biography panel, god dock, **i18n**)

## Roadmap

See GDD §18: v0.2 deepen nations (subspecies, underground, rebellion → new nations) → v0.3 deepen characters (noble networks, assassination) → v0.4 full chronicle + shareable world seeds → v0.5 player-as-director.

---

🤖 Built collaboratively with [Claude Code](https://claude.com/claude-code).

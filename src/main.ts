import './ui/styles.css';
import type { WorldState, NationId, CharId, LogEntry } from './sim/types';
import { yearOf, seasonOf } from './sim/types';
import { createWorld } from './sim/world';
import { tick } from './sim/tick';
import { Renderer, type FxKind } from './render/renderer';
import { renderNationCard } from './ui/nationCard';
import { renderLatest, renderLogPanel, type LogPanelOpts } from './ui/eventLog';
import { renderBioPanel } from './ui/bioPanel';
import { harvestBless, harmonyBless, heroBorn } from './sim/interventions';
import { t, getLang, setLang, onLangChange, nationName } from './ui/i18n';

type Speed = 'pause' | 'x1' | 'x2' | 'x4';
const SIM_HZ: Record<Speed, number> = { pause: 0, x1: 2, x2: 4, x4: 8 };

const canvas = document.getElementById('world') as HTMLCanvasElement;
const renderer = new Renderer(canvas);

// URL params: ?seed= reproduce world; ?prerun=N fast-forward; ?focus=, ?bio=1, ?zoom=N
const params = new URLSearchParams(location.search);
const seedParam = params.get('seed');
let world: WorldState = createWorld(seedParam !== null ? Number(seedParam) | 0 : (Math.random() * 1e9) | 0);
const prerun = Number(params.get('prerun') ?? 0) | 0;
for (let i = 0; i < prerun; i++) tick(world);
let speed: Speed = 'x1';
let selected: NationId | null = null;
let logOpen = false;
let logFilter: NationId | null = null;
let showDetail = false;
let bioOpen: CharId | null = null;
let godMode: 'harvest' | 'harmony' | 'hero' | null = null;
let harmonyFirst: NationId | null = null;
let lastLogId = 0;

renderer.resize();
renderer.setWorld(world);

// ---------- DOM refs ----------
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const timeEl = $('time'), evoEl = $('evostate'), seedEl = $('seedlabel');
const cardEl = $<HTMLElement>('nationcard');
const bioEl = $<HTMLElement>('biopanel');
const latestEl = $('loglatest'), panelEl = $<HTMLElement>('logpanel');
const hintEl = $('hint');
const langBtn = $('langtoggle');
const newWorldBtn = $<HTMLButtonElement>('newworld');
const logBtn = $<HTMLButtonElement>('logtoggle');

// ---------- 世界控制 ----------
function newWorld(): void {
  world = createWorld((Math.random() * 1e9) | 0);
  selected = null; logFilter = null; lastLogId = 0; bioOpen = null;
  renderer.setWorld(world);
  cardEl.classList.add('hidden');
  bioEl.classList.add('hidden');
  applyStaticI18n();
  refreshHud();
}

function setSpeed(s: Speed): void {
  speed = s;
  document.querySelectorAll<HTMLButtonElement>('#speed button').forEach((b) =>
    b.classList.toggle('on', b.dataset.speed === s));
  evoEl.textContent = t(s === 'pause' ? 'evo.paused' : 'evo.running');
}

// ---------- 国际化：把静态 HTML 上的中文/英文也按当前语言更新一遍 ----------
function applyStaticI18n(): void {
  document.documentElement.lang = getLang() === 'zh' ? 'zh-CN' : 'en';
  document.title = t('app.tab');
  seedEl.textContent = t('seed', { n: world.seed });
  langBtn.textContent = getLang() === 'zh' ? t('lang.label.zh') + ' / EN' : '中 / ' + t('lang.label.en');
  langBtn.title = t('lang.toggle.title');
  newWorldBtn.title = t('newworld.title');
  // 新世界按钮保留 emoji-only label（节省顶栏空间），换语言时不变
  logBtn.textContent = t('log.btn');
  const speedBtns = document.querySelectorAll<HTMLButtonElement>('#speed button');
  speedBtns.forEach((b) => { const k = b.dataset.speed; if (k) b.title = t(`speed.${k}.title`); });
  $('hint').textContent = t('hint.normal');
  const gods: Array<['harvest' | 'harmony' | 'hero']> = [['harvest'], ['harmony'], ['hero']];
  for (const [k] of gods) {
    const el = document.querySelector<HTMLButtonElement>(`#godbar [data-god="${k}"]`);
    if (el) { el.textContent = t(`god.${k}.label`); el.title = t(`god.${k}.title`); }
  }
  // evostate 跟随当前 speed
  evoEl.textContent = t(speed === 'pause' ? 'evo.paused' : 'evo.running');
  // latest 初始占位（若日志为空才显示）
  if (world.log.length === 0) latestEl.textContent = t('log.latest.placeholder');
}

// ---------- HUD 刷新 ----------
function refreshHud(): void {
  timeEl.textContent = t('time', { year: yearOf(world.tick), season: t(`season.${seasonOf(world.tick)}`) });
  renderLatest(world, latestEl, showDetail);
  if (selected) renderNationCard(world, selected, cardEl, openStory, openBio);
  if (logOpen) renderLogPanel(world, panelEl, logPanelOpts());
  if (bioOpen) renderBioPanel(world, bioOpen, bioEl, closeBio);
}

function logPanelOpts(): LogPanelOpts {
  return {
    filter: logFilter,
    detail: showDetail,
    onPick: onPickLog,
    onFilter: (id) => { logFilter = id; renderLogPanel(world, panelEl, logPanelOpts()); },
    onToggleDetail: (v) => { showDetail = v; refreshHud(); },
  };
}

function openStory(id: NationId): void {
  logFilter = id; logOpen = true; panelEl.classList.remove('hidden');
  renderLogPanel(world, panelEl, logPanelOpts());
}

function openBio(id: CharId): void {
  bioOpen = id;
  renderBioPanel(world, id, bioEl, closeBio);
}

function closeBio(): void {
  bioOpen = null;
  bioEl.classList.add('hidden');
}

function onPickLog(tile: number | undefined, nation?: NationId): void {
  if (tile !== undefined) centerOnTile(tile);
  if (nation && world.nations[nation]?.alive) { selected = nation; refreshHud(); }
}

function centerOnTile(tile: number): void {
  renderer.cam.x = (tile % world.width) + 0.5;
  renderer.cam.y = ((tile / world.width) | 0) + 0.5;
}

// ---------- 事件特效：扫描新日志 ----------
function harvestFx(): void {
  for (const e of world.log) {
    if (e.id <= lastLogId) continue;
    lastLogId = e.id;
    if (e.tile === undefined) continue;
    const k = fxForLog(e);
    if (k) renderer.pushFx(e.tile, k);
  }
}

function fxForLog(e: LogEntry): FxKind | null {
  if (e.tags.includes('fall')) return 'fall';
  if (e.tags.includes('declare') || e.tags.includes('split') || e.tags.includes('siege')) return 'war';
  if (e.tags.includes('build')) return 'build';
  if (e.tags.includes('good')) return 'good';
  if (e.tags.includes('culture')) return 'celebrate';
  if (e.level === 'epic') return 'epic';
  return null;
}

// ---------- 主循环（固定步长 + 渲染解耦） ----------
let acc = 0, last = performance.now();
function frame(now: number): void {
  const dt = (now - last) / 1000; last = now;
  const hz = SIM_HZ[speed];
  if (hz > 0) {
    acc += dt * hz;
    let budget = 4;
    let stepped = false;
    while (acc >= 1 && budget-- > 0) { tick(world); acc -= 1; stepped = true; }
    if (acc > budget) acc = 0;
    if (stepped) { harvestFx(); refreshHud(); }
  }
  renderer.render(world, selected);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// ---------- 输入 ----------
let dragging = false, moved = false, lx = 0, ly = 0;
canvas.addEventListener('pointerdown', (e) => { dragging = true; moved = false; lx = e.clientX; ly = e.clientY; canvas.setPointerCapture(e.pointerId); });
canvas.addEventListener('pointermove', (e) => {
  if (!dragging) return;
  const dx = e.clientX - lx, dy = e.clientY - ly; lx = e.clientX; ly = e.clientY;
  if (Math.abs(dx) + Math.abs(dy) > 2) moved = true;
  renderer.cam.pan(dx, dy);
});
canvas.addEventListener('pointerup', (e) => {
  dragging = false;
  if (moved) return;
  const rect = canvas.getBoundingClientRect();
  const tileIdx = renderer.tileAt(e.clientX - rect.left, e.clientY - rect.top);
  if (tileIdx === null) return;
  const owner = world.tiles[tileIdx].owner;
  if (godMode) { applyGod(owner); return; }
  if (owner && world.nations[owner]?.alive) { selected = owner; refreshHud(); }
  else { selected = null; cardEl.classList.add('hidden'); }
});
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  const rect = canvas.getBoundingClientRect();
  renderer.cam.zoomAt(e.deltaY < 0 ? 1.12 : 0.89, e.clientX - rect.left, e.clientY - rect.top);
}, { passive: false });

window.addEventListener('resize', () => renderer.resize());

// ---------- 神明干预 ----------
function armGod(mode: 'harvest' | 'harmony' | 'hero'): void {
  godMode = godMode === mode ? null : mode;
  harmonyFirst = null;
  document.querySelectorAll<HTMLButtonElement>('#godbar .god').forEach((b) =>
    b.classList.toggle('armed', !!godMode && b.dataset.god === godMode));
  hintEl.textContent = godMode === 'harmony' ? t('hint.god.harmony1')
    : godMode ? t('hint.god.cast') : t('hint.normal');
  hintEl.style.opacity = '1';
}

function applyGod(owner: NationId | null): void {
  if (!owner || !world.nations[owner]?.alive) return;
  let tile: number | null = null;
  if (godMode === 'harvest') tile = harvestBless(world, owner);
  else if (godMode === 'hero') tile = heroBorn(world, owner);
  else if (godMode === 'harmony') {
    if (!harmonyFirst) {
      harmonyFirst = owner;
      hintEl.textContent = t('hint.god.harmony2', { name: nationName(world.nations[owner].species) });
      return;
    }
    tile = harmonyBless(world, harmonyFirst, owner);
  }
  if (tile !== null) renderer.pushFx(tile, 'good');
  armGod(godMode!); // 关闭法术模式
  refreshHud();
}

document.querySelectorAll<HTMLButtonElement>('#godbar .god').forEach((b) =>
  b.addEventListener('click', () => armGod(b.dataset.god as 'harvest' | 'harmony' | 'hero')));

// ---------- 顶部 / 底部按钮 ----------
document.querySelectorAll<HTMLButtonElement>('#speed button').forEach((b) =>
  b.addEventListener('click', () => setSpeed(b.dataset.speed as Speed)));
newWorldBtn.addEventListener('click', newWorld);
logBtn.addEventListener('click', () => {
  logOpen = !logOpen;
  panelEl.classList.toggle('hidden', !logOpen);
  if (logOpen) renderLogPanel(world, panelEl, logPanelOpts());
});
langBtn.addEventListener('click', () => setLang(getLang() === 'zh' ? 'en' : 'zh'));
onLangChange(() => { applyStaticI18n(); refreshHud(); });

window.addEventListener('keydown', (e) => {
  if (e.code === 'Space') { e.preventDefault(); setSpeed(speed === 'pause' ? 'x1' : 'pause'); }
  else if (e.code === 'Digit1') setSpeed('x1');
  else if (e.code === 'Digit2') setSpeed('x2');
  else if (e.code === 'Digit3') setSpeed('x4');
});

setSpeed('x1');
applyStaticI18n();
refreshHud();
setTimeout(() => { hintEl.style.opacity = '0'; }, 6000);

// 调试便利
const focus = params.get('focus');
if (focus && world.nations[focus]?.alive) {
  selected = focus;
  if (params.get('bio')) openBio(world.nations[focus].rulerId);
  else openStory(focus);
  refreshHud();
}
const zoomParam = params.get('zoom');
if (zoomParam) {
  renderer.cam.scale = Number(zoomParam);
  if (selected) centerOnTile(world.nations[selected].capitalTile);
}

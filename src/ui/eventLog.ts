import type { WorldState, NationId, LogEntry } from '../sim/types';
import { yearOf, seasonOf, SEASON_CN } from '../sim/types';
import { LEVEL_ICON } from './format';

// “必要”历史 = 大事件 + 史诗（不勾选细节时只看这些）
export function isImportant(e: LogEntry): boolean {
  return e.level === 'major' || e.level === 'epic';
}

export function renderLatest(world: WorldState, el: HTMLElement, detail: boolean): void {
  for (let i = world.log.length - 1; i >= 0; i--) {
    const e = world.log[i];
    if (detail || isImportant(e)) {
      el.innerHTML = `<span class="lv ${e.level}">${LEVEL_ICON[e.level]}</span> ${e.text}`;
      return;
    }
  }
}

export interface LogPanelOpts {
  filter: NationId | null;
  detail: boolean;
  onPick: (tile: number | undefined, nation?: NationId) => void;
  onFilter: (id: NationId | null) => void;
  onToggleDetail: (v: boolean) => void;
}

export function renderLogPanel(world: WorldState, el: HTMLElement, opts: LogPanelOpts): void {
  const { filter, detail } = opts;
  const title = filter && world.nations[filter] ? `编年史 · ${world.nations[filter].name}` : '编年史';
  const entries = world.log
    .filter((e) => (!filter || e.nation === filter) && (detail || isImportant(e)))
    .slice(-200).reverse();

  el.innerHTML = `
    <div class="logbar">
      <strong>${title}</strong>
      <label class="detail"><input type="checkbox" id="detailbox" ${detail ? 'checked' : ''}/> 显示细节</label>
      <div class="filters" id="logfilters"></div>
    </div>
    <div class="loglist">
      ${entries.length === 0 ? '<div class="empty">暂无大事记。勾选“显示细节”查看全部。</div>' : entries.map((e) => {
        const dot = e.nation && world.nations[e.nation]
          ? `<span class="ndot" style="background:${world.nations[e.nation].color}"></span>` : '';
        return `<div class="logrow ${e.level}" data-tile="${e.tile ?? ''}" data-nation="${e.nation ?? ''}">
          <span class="when">第${yearOf(e.tick)}年${SEASON_CN[seasonOf(e.tick)]}</span>
          <span class="lv ${e.level}">${LEVEL_ICON[e.level]}</span>${dot}
          <span class="txt">${e.text}</span></div>`;
      }).join('')}
    </div>`;

  el.querySelector<HTMLInputElement>('#detailbox')!.onchange = (ev) =>
    opts.onToggleDetail((ev.target as HTMLInputElement).checked);

  const fbar = el.querySelector<HTMLElement>('#logfilters')!;
  const mkBtn = (label: string, id: NationId | null) => {
    const b = document.createElement('button');
    b.className = 'ghost mini' + (filter === id ? ' on' : '');
    b.textContent = label;
    b.onclick = () => opts.onFilter(id);
    return b;
  };
  fbar.appendChild(mkBtn('全部', null));
  for (const n of Object.values(world.nations)) {
    if (!n.alive) continue;
    fbar.appendChild(mkBtn(n.name, n.id));
  }

  el.querySelectorAll<HTMLElement>('.logrow').forEach((row) => {
    row.onclick = () => opts.onPick(row.dataset.tile ? Number(row.dataset.tile) : undefined, row.dataset.nation || undefined);
  });
}

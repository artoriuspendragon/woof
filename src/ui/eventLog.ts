import type { WorldState, NationId, LogEntry } from '../sim/types';
import { yearOf, seasonOf } from '../sim/types';
import { LEVEL_ICON } from './format';
import { t, nationName } from './i18n';

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
  const title = filter && world.nations[filter]
    ? t('log.title.with', { name: nationName(world.nations[filter].species) })
    : t('log.title');
  const entries = world.log
    .filter((e) => (!filter || e.nation === filter || e.otherNations?.includes(filter)) && (detail || isImportant(e)))
    .slice(-200).reverse();

  el.innerHTML = `
    <div class="logbar">
      <strong>${title}</strong>
      <label class="detail"><input type="checkbox" id="detailbox" ${detail ? 'checked' : ''}/> ${t('log.detail')}</label>
      <div class="filters" id="logfilters"></div>
    </div>
    <div class="loglist">
      ${entries.length === 0 ? `<div class="empty">${t('log.empty')}</div>` : entries.map((e) => {
        const dot = e.nation && world.nations[e.nation]
          ? `<span class="ndot" style="background:${world.nations[e.nation].color}"></span>` : '';
        return `<div class="logrow ${e.level}" data-tile="${e.tile ?? ''}" data-nation="${e.nation ?? ''}">
          <span class="when">${t('time', { year: yearOf(e.tick), season: t(`season.${seasonOf(e.tick)}`) })}</span>
          <span class="lv ${e.level}">${LEVEL_ICON[e.level]}</span>${dot}
          <span class="txt">${e.text}</span></div>`;
      }).join('')}
    </div>`;

  el.querySelector<HTMLInputElement>('#detailbox')!.onchange = (ev) =>
    opts.onToggleDetail((ev.target as HTMLInputElement).checked);

  const fbar = el.querySelector<HTMLElement>('#logfilters')!;
  const mkBtn = (label: string, id: NationId | null, fallen = false) => {
    const b = document.createElement('button');
    b.className = 'ghost mini' + (filter === id ? ' on' : '') + (fallen ? ' fallen' : '');
    b.textContent = label;
    b.onclick = () => opts.onFilter(id);
    return b;
  };
  fbar.appendChild(mkBtn(t('log.all'), null));
  // 活国在前；亡国按陨落顺序排在后,用淡化样式区分
  const ns = Object.values(world.nations);
  const living = ns.filter((n) => n.alive);
  const fallen = ns.filter((n) => !n.alive).sort((a, b) => (b.fellTick ?? 0) - (a.fellTick ?? 0));
  for (const n of living) fbar.appendChild(mkBtn(nationName(n.species), n.id, false));
  for (const n of fallen) fbar.appendChild(mkBtn(nationName(n.species), n.id, true));

  el.querySelectorAll<HTMLElement>('.logrow').forEach((row) => {
    row.onclick = () => opts.onPick(row.dataset.tile ? Number(row.dataset.tile) : undefined, row.dataset.nation || undefined);
  });
}

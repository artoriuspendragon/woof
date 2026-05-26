import type { WorldState, CharId } from '../sim/types';
import { yearOf, seasonOf, SEASON_CN } from '../sim/types';
import { SPECIES } from '../data/species';
import { ROLE_CN, ROLE_ICON, PERSONALITY_CN } from './format';

function bar(label: string, v: number, color: string): string {
  return `<div class="stat"><span class="lab">${label}</span>
    <span class="track"><span class="fill" style="width:${Math.max(0, Math.min(100, v))}%;background:${color}"></span></span>
    <span class="word">${Math.round(v)}</span></div>`;
}

export function renderBioPanel(world: WorldState, id: CharId, el: HTMLElement, onClose: () => void): void {
  const c = world.characters[id];
  if (!c) { el.classList.add('hidden'); return; }
  const nation = world.nations[c.nation];
  const flag = SPECIES[nation.species].emoji;
  const life = c.alive
    ? `生于第 ${yearOf(c.bornTick)} 年 · 在世（约 ${Math.round(c.age)} 岁）`
    : `生于第 ${yearOf(c.bornTick)} 年 — 卒于第 ${yearOf(c.deathTick ?? c.bornTick)} 年`;

  const entries = c.bio.slice().sort((a, b) => a.tick - b.tick);

  el.innerHTML = `
    <div class="bio-head">
      <span class="bflag">${ROLE_ICON[c.role]}</span>
      <div><div class="bname">${c.name} <span class="btitle">${c.title}</span></div>
        <div class="bsub">${flag} ${nation.name} · ${ROLE_CN[c.role]} · ${PERSONALITY_CN[c.personality]}${c.alive ? '' : ' · 已故'}</div>
        <div class="bsub">${life}</div></div>
      <button class="bclose ghost">✕</button>
    </div>
    <div class="stats">
      ${bar('能力', c.ability, '#6aa1c8')}
      ${bar('野心', c.ambition, '#c8502a')}
      ${bar('忠诚', c.loyalty, '#7fb069')}
      ${bar('声望', c.prestige, '#caa84a')}
    </div>
    <div class="reltitle">列传</div>
    <div class="biolist">
      ${entries.length === 0 ? '<div class="empty">尚无事迹记载。</div>' : entries.map((b) =>
        `<div class="biorow"><span class="when">第${yearOf(b.tick)}年${SEASON_CN[seasonOf(b.tick)]}</span><span>${b.text}</span></div>`,
      ).join('')}
    </div>`;

  el.classList.remove('hidden');
  el.querySelector<HTMLButtonElement>('.bclose')!.onclick = onClose;
}

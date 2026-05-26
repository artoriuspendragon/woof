import type { WorldState, CharId } from '../sim/types';
import { yearOf, seasonOf } from '../sim/types';
import { SPECIES } from '../data/species';
import { ROLE_ICON, roleLabel, personalityLabel } from './format';
import { t, nationName } from './i18n';

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
    ? t('bio.life.alive', { born: yearOf(c.bornTick), age: Math.round(c.age) })
    : t('bio.life.dead',  { born: yearOf(c.bornTick), death: yearOf(c.deathTick ?? c.bornTick) });

  const entries = c.bio.slice().sort((a, b) => a.tick - b.tick);

  el.innerHTML = `
    <div class="bio-head">
      <span class="bflag">${ROLE_ICON[c.role]}</span>
      <div><div class="bname">${c.name} <span class="btitle">${c.title}</span></div>
        <div class="bsub">${flag} ${nationName(nation.species)} · ${roleLabel(c.role)} · ${personalityLabel(c.personality)}${c.alive ? '' : ' · ' + t('bio.deceased')}</div>
        <div class="bsub">${life}</div></div>
      <button class="bclose ghost">✕</button>
    </div>
    <div class="stats">
      ${bar(t('bio.stat.ability'),  c.ability,  '#6aa1c8')}
      ${bar(t('bio.stat.ambition'), c.ambition, '#c8502a')}
      ${bar(t('bio.stat.loyalty'),  c.loyalty,  '#7fb069')}
      ${bar(t('bio.stat.prestige'), c.prestige, '#caa84a')}
    </div>
    <div class="reltitle">${t('bio.title')}</div>
    <div class="biolist">
      ${entries.length === 0 ? `<div class="empty">${t('bio.empty')}</div>` : entries.map((b) =>
        `<div class="biorow"><span class="when">${t('time', { year: yearOf(b.tick), season: t(`season.${seasonOf(b.tick)}`) })}</span><span>${b.text}</span></div>`,
      ).join('')}
    </div>`;

  el.classList.remove('hidden');
  el.querySelector<HTMLButtonElement>('.bclose')!.onclick = onClose;
}

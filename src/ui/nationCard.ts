import type { WorldState, NationId, CharId } from '../sim/types';
import { SPECIES } from '../data/species';
import { notablePeople } from '../sim/people';
import { moodText, relationWord, norm, qualitative, ROLE_ICON, roleLabel, personalityLabel } from './format';
import { t, nationName } from './i18n';

function bar(label: string, frac: number, word: string, color: string): string {
  return `<div class="stat"><span class="lab">${label}</span>
    <span class="track"><span class="fill" style="width:${Math.round(frac * 100)}%;background:${color}"></span></span>
    <span class="word">${word}</span></div>`;
}

export function renderNationCard(
  world: WorldState, id: NationId, el: HTMLElement,
  onStory: (id: NationId) => void, onPerson: (id: CharId) => void,
): void {
  const n = world.nations[id];
  if (!n || !n.alive) { el.classList.add('hidden'); return; }
  const def = SPECIES[n.species];
  const ruler = world.characters[n.rulerId];
  const s = n.stats;
  const capital = def.capitalNames[0];

  const subhead = ruler
    ? t('card.subhead.personality', { capital, ruler: ruler.name, personality: personalityLabel(ruler.personality) })
    : t('card.subhead.noruler', { capital });

  const others = Object.entries(n.relations)
    .filter(([oid]) => world.nations[oid]?.alive)
    .map(([oid, r]) => {
      const w = relationWord(r.value);
      const treaty = r.treaties.includes('alliance') ? t('card.treaty.alliance')
        : r.treaties.includes('trade') ? t('card.treaty.trade') : '';
      const war = n.atWar.includes(oid) ? t('card.atwar') : '';
      const other = world.nations[oid];
      return `<div class="rel"><span>${SPECIES[other.species].emoji} ${nationName(other.species)}</span>
        <span style="color:${w.c}">${w.t}${treaty}${war}</span></div>`;
    }).join('');

  const people = notablePeople(world, n.id).slice(0, 6).map((c) =>
    `<button class="person" data-cid="${c.id}" title="${roleLabel(c.role)}">${ROLE_ICON[c.role]} ${c.name}<small>${roleLabel(c.role)}</small></button>`,
  ).join('') || `<span class="empty">${t('card.no_people')}</span>`;

  el.innerHTML = `
    <div class="card-head" style="border-color:${n.color}">
      <span class="flag">${def.emoji}</span>
      <div><div class="nname">${nationName(n.species)}</div>
      <div class="sub">${subhead}</div></div>
    </div>
    <div class="stats">
      ${bar(t('card.stat.population'), norm(s.population, 1200), Math.round(s.population).toString(), '#7fb069')}
      ${bar(t('card.stat.food'),       norm(s.food, 250), qualitative(s.food, [[160, 'qual.food.full'], [80, 'qual.food.ok'], [30, 'qual.food.tight'], [0, 'qual.food.lack']]), '#e0b34a')}
      ${bar(t('card.stat.military'),   norm(s.military, 400), Math.round(s.military).toString(), '#c8502a')}
      ${bar(t('card.stat.morale'),     s.morale / 100, qualitative(s.morale, [[70, 'qual.morale.high'], [50, 'qual.morale.mid'], [30, 'qual.morale.low'], [0, 'qual.morale.break']]), '#d96f9b')}
      ${bar(t('card.stat.stability'),  s.stability / 100, qualitative(s.stability, [[70, 'qual.stability.firm'], [45, 'qual.stability.steady'], [25, 'qual.stability.unstable'], [0, 'qual.stability.broken']]), '#6aa1c8')}
      ${bar(t('card.stat.wealth'),     s.wealth / 100, qualitative(s.wealth, [[70, 'qual.wealth.prosperous'], [40, 'qual.wealth.modest'], [0, 'qual.wealth.poor']]), '#caa84a')}
      ${bar(t('card.stat.culture'),    s.culture / 100, qualitative(s.culture, [[70, 'qual.culture.brilliant'], [40, 'qual.culture.flourishing'], [0, 'qual.culture.simple']]), '#9a6fd9')}
    </div>
    <div class="mood">${t('card.mood', { mood: moodText(n) })}</div>
    <div class="reltitle">${t('card.relations')}</div>
    <div class="rels">${others || `<div class="rel"><span>${t('card.no_neighbors')}</span></div>`}</div>
    <div class="reltitle">${t('card.people')}</div>
    <div class="people">${people}</div>
    <div class="terr">${t('card.territory', { t: n.territory, c: cityCount(world, n.id) })}${armyInfo(world, n.id)}</div>
    <button class="locate ghost">${t('card.story_btn')}</button>
  `;
  el.classList.remove('hidden');
  el.querySelector<HTMLButtonElement>('.locate')!.onclick = () => onStory(n.id);
  el.querySelectorAll<HTMLElement>('.person').forEach((p) => {
    p.onclick = () => onPerson(p.dataset.cid!);
  });
}

function cityCount(world: WorldState, id: NationId): number {
  let c = 0;
  for (const tile of world.tiles) if (tile.owner === id && tile.city > 0) c++;
  return c;
}

function armyInfo(world: WorldState, id: NationId): string {
  let count = 0, size = 0;
  for (const a of Object.values(world.armies)) if (a.nation === id) { count++; size += a.size; }
  return count > 0 ? t('card.armies', { count, size: Math.round(size) }) : '';
}

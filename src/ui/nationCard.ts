import type { WorldState, NationId, CharId } from '../sim/types';
import { SPECIES } from '../data/species';
import { notablePeople } from '../sim/people';
import { moodText, relationWord, norm, qualitative, PERSONALITY_CN, ROLE_ICON, ROLE_CN } from './format';

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

  const others = Object.entries(n.relations)
    .filter(([oid]) => world.nations[oid]?.alive)
    .map(([oid, r]) => {
      const w = relationWord(r.value);
      const treaty = r.treaties.includes('alliance') ? ' · 同盟' : r.treaties.includes('trade') ? ' · 通商' : '';
      const war = n.atWar.includes(oid) ? ' · 交战中' : '';
      return `<div class="rel"><span>${SPECIES[world.nations[oid].species].emoji} ${world.nations[oid].name}</span>
        <span style="color:${w.c}">${w.t}${treaty}${war}</span></div>`;
    }).join('');

  const people = notablePeople(world, n.id).slice(0, 6).map((c) =>
    `<button class="person" data-cid="${c.id}" title="查看列传">${ROLE_ICON[c.role]} ${c.name}<small>${ROLE_CN[c.role]}</small></button>`,
  ).join('') || '<span class="empty">暂无名人</span>';

  el.innerHTML = `
    <div class="card-head" style="border-color:${n.color}">
      <span class="flag">${def.emoji}</span>
      <div><div class="nname">${n.name}</div>
      <div class="sub">「${def.capitalNames[0]}」· ${ruler?.name ?? '无主'}${ruler ? `（${PERSONALITY_CN[ruler.personality]}）` : ''} 在位</div></div>
    </div>
    <div class="stats">
      ${bar('人口', norm(s.population, 1200), Math.round(s.population).toString(), '#7fb069')}
      ${bar('食物', norm(s.food, 250), qualitative(s.food, [[160, '富足'], [80, '尚可'], [30, '紧张'], [0, '匮乏']]), '#e0b34a')}
      ${bar('军力', norm(s.military, 400), Math.round(s.military).toString(), '#c8502a')}
      ${bar('民心', s.morale / 100, qualitative(s.morale, [[70, '拥戴'], [50, '安定'], [30, '不满'], [0, '离心']]), '#d96f9b')}
      ${bar('稳定', s.stability / 100, qualitative(s.stability, [[70, '稳固'], [45, '平稳'], [25, '动荡'], [0, '崩坏']]), '#6aa1c8')}
      ${bar('财富', s.wealth / 100, qualitative(s.wealth, [[70, '繁荣'], [40, '小康'], [0, '清贫']]), '#caa84a')}
      ${bar('文化', s.culture / 100, qualitative(s.culture, [[70, '璀璨'], [40, '兴盛'], [0, '质朴']]), '#9a6fd9')}
    </div>
    <div class="mood">心情：${moodText(n)}</div>
    <div class="reltitle">邻里关系</div>
    <div class="rels">${others || '<div class="rel"><span>四下无邻</span></div>'}</div>
    <div class="reltitle">人物</div>
    <div class="people">${people}</div>
    <div class="terr">疆域 ${n.territory} 格 · 城市 ${cityCount(world, n.id)} 座${armyInfo(world, n.id)}</div>
    <button class="locate ghost">📖 翻到这国的故事</button>
  `;
  el.classList.remove('hidden');
  el.querySelector<HTMLButtonElement>('.locate')!.onclick = () => onStory(n.id);
  el.querySelectorAll<HTMLElement>('.person').forEach((p) => {
    p.onclick = () => onPerson(p.dataset.cid!);
  });
}

function cityCount(world: WorldState, id: NationId): number {
  let c = 0;
  for (const t of world.tiles) if (t.owner === id && t.city > 0) c++;
  return c;
}

function armyInfo(world: WorldState, id: NationId): string {
  let count = 0, size = 0;
  for (const a of Object.values(world.armies)) if (a.nation === id) { count++; size += a.size; }
  return count > 0 ? ` · 出征 ${count} 军（${Math.round(size)} 兵）` : '';
}

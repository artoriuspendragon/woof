// 轻量 i18n：UI chrome 全译；编年史 / 列传内文为 emit 时定格的文本，本版本保留生成时的语言。
// 默认按浏览器语言选择，可在状态条切换并写入 localStorage。

export type Lang = 'zh' | 'en';
type Dict = Record<string, string>;

const LS_KEY = 'woof.lang';
const subs = new Set<() => void>();

let _lang: Lang = (() => {
  // 1) URL ?lang= 优先（便于分享本地化链接 / 截图 / 端到端测试）
  try {
    const p = new URLSearchParams(location.search).get('lang');
    if (p === 'zh' || p === 'en') return p;
  } catch { /* SSR or unusual env */ }
  // 2) localStorage 持久化
  try {
    const s = localStorage.getItem(LS_KEY);
    if (s === 'zh' || s === 'en') return s;
  } catch { /* private mode etc. */ }
  // 3) 浏览器默认语言
  if (typeof navigator !== 'undefined' && navigator.language?.toLowerCase().startsWith('zh')) return 'zh';
  return 'en';
})();

export function getLang(): Lang { return _lang; }
export function setLang(l: Lang): void {
  if (l === _lang) return;
  _lang = l;
  try { localStorage.setItem(LS_KEY, l); } catch { /* ignore */ }
  for (const f of subs) f();
}
export function onLangChange(fn: () => void): void { subs.add(fn); }

export function t(key: string, args?: Record<string, string | number>): string {
  const dict = _lang === 'zh' ? ZH : EN;
  let v = dict[key] ?? EN[key] ?? key;
  if (args) for (const k of Object.keys(args)) v = v.split(`{${k}}`).join(String(args[k]));
  return v;
}

const ZH: Dict = {
  // 顶部 / 状态
  'app.tab': 'Woof · 动物文明箱庭',
  'brand.subtitle': '动物革命模拟器',
  'time': '第 {year} 年 · {season}',
  'time.day': '第 {year} 年 · {season} · 第 {day} 日',
  'season.spring': '春', 'season.summer': '夏', 'season.autumn': '秋', 'season.winter': '冬',
  'evo.running': '自动演化中',
  'evo.paused': '已暂停',
  'speed.pause.title': '暂停 (空格)',
  'speed.x1.title': '慢速：看清行军与战斗',
  'speed.x2.title': '中速：平稳推进',
  'speed.x4.title': '快速：仍保留动画',
  'newworld.label': '🎲 新世界',
  'newworld.title': '换一个世界种子',
  'seed': '种子 {n}',
  'lang.toggle.title': '切换语言 / Switch language',
  'lang.label.zh': '中',
  'lang.label.en': 'EN',

  // 提示
  'hint.normal': '拖拽平移 · 滚轮缩放 · 点击国家查看',
  'hint.god.cast': '点选要施法的国家',
  'hint.god.harmony1': '点选第一个国家……',
  'hint.god.harmony2': '已选 {name}，再点选另一国……',

  // 神明干预
  'god.harvest.label': '🌾 丰收祝福', 'god.harvest.title': '为选中国祝福丰收',
  'god.harmony.label': '🔔 促进和谐', 'god.harmony.title': '点选两国促进和谐',
  'god.hero.label': '🌠 英雄降生',    'god.hero.title': '为选中国降生英雄',

  // 编年史
  'log.btn': '📖 编年史',
  'log.title': '编年史',
  'log.title.with': '编年史 · {name}',
  'log.detail': '显示细节',
  'log.all': '全部',
  'log.empty': '暂无大事记。勾选“显示细节”查看全部。',
  'log.latest.placeholder': '世界初成，五国并立……',
  'toast.jump.title': '点击定位事件',

  // 国家卡
  'card.subhead': '「{capital}」· {ruler} 在位',
  'card.subhead.personality': '「{capital}」· {ruler}（{personality}）在位',
  'card.subhead.noruler': '「{capital}」· 无主',
  'card.stat.population': '人口',
  'card.stat.food': '食物',
  'card.stat.military': '军力',
  'card.stat.morale': '民心',
  'card.stat.stability': '稳定',
  'card.stat.wealth': '财富',
  'card.stat.culture': '文化',
  'card.mood': '心情：{mood}',
  'card.relations': '邻里关系',
  'card.people': '人物',
  'card.no_people': '暂无名人',
  'card.no_neighbors': '四下无邻',
  'card.territory': '疆域 {t} 格 · 城市 {c} 座',
  'card.armies': ' · 出征 {count} 军（{size} 兵）',
  'card.armies.lowsupply': ' · 有军断粮 💧',
  'card.story_btn': '📖 翻到这国的故事',
  /* memorial — 亡国怀念碑 */
  'card.memorial.tag': '已亡国',
  'card.memorial.fell': '亡于第 {year} 年',
  'card.memorial.absorbedBy': ' · 并入{by}',
  'card.memorial.collapsed': ' · 因国力衰竭而自我崩解',
  'card.memorial.figures': '历代人物',
  'card.memorial.no_figures': '无史可考',
  'card.memorial.story_btn': '📖 翻开这国的旧史',
  'card.treaty.alliance': ' · 同盟',
  'card.treaty.trade': ' · 通商',
  'card.atwar': ' · 交战中',

  // 列传
  'bio.life.alive': '生于第 {born} 年 · 在世（约 {age} 岁）',
  'bio.life.dead':  '生于第 {born} 年 — 卒于第 {death} 年',
  'bio.deceased': '已故',
  'bio.stat.ability': '能力',
  'bio.stat.ambition': '野心',
  'bio.stat.loyalty': '忠诚',
  'bio.stat.prestige': '声望',
  'bio.title': '列传',
  'bio.empty': '尚无事迹记载。',

  // 角色
  'role.king': '国王',
  'role.general': '大将',
  'role.hero': '英雄',
  // 性格
  'personality.kind': '仁慈', 'personality.irritable': '暴躁', 'personality.cunning': '狡猾',
  'personality.lazy': '懒惰', 'personality.diligent': '勤勉', 'personality.vain': '虚荣',
  'personality.paranoid': '多疑', 'personality.warlike': '好战',
  'personality.conservative': '守成', 'personality.gluttonous': '贪吃',
  // 心情（goal kinds）
  'mood.develop': '专心经营内政 🏡',
  'mood.expand':  '忙着开拓边疆 🧭',
  'mood.fortify': '加固边防工事 🧱',
  'mood.trade':   '张罗商队贸易 🪙',
  'mood.festival':'筹备节庆 🎉',
  'mood.intrigue':'暗中布局 🕯️',
  'mood.survive': '为渡过饥荒发愁 😣',
  'mood.war':     '调兵遣将 ⚔️',
  'mood.atwar':   '正在与邻国交战 ⚔️',
  // 关系
  'rel.friendly': '友好', 'rel.cordial': '亲善', 'rel.civil': '客气',
  'rel.wary': '提防', 'rel.hostile': '敌对', 'rel.nemesis': '宿敌',
  // 定性词（数值 → 词）
  'qual.food.full': '富足', 'qual.food.ok': '尚可', 'qual.food.tight': '紧张', 'qual.food.lack': '匮乏',
  'qual.morale.high': '拥戴', 'qual.morale.mid': '安定', 'qual.morale.low': '不满', 'qual.morale.break': '离心',
  'qual.stability.firm': '稳固', 'qual.stability.steady': '平稳', 'qual.stability.unstable': '动荡', 'qual.stability.broken': '崩坏',
  'qual.wealth.prosperous': '繁荣', 'qual.wealth.modest': '小康', 'qual.wealth.poor': '清贫',
  'qual.culture.brilliant': '璀璨', 'qual.culture.flourishing': '兴盛', 'qual.culture.simple': '质朴',

  // 国家名（按 species 查询）
  'nation.dog': '狗国', 'nation.cat': '猫猫国', 'nation.fox': '狐狸国',
  'nation.mole': '地鼠国', 'nation.badger': '獾国',
};

const EN: Dict = {
  'app.tab': 'Woof · Animal Civ Sandbox',
  'brand.subtitle': 'Animal Revolution',
  'time': 'Year {year} · {season}',
  'time.day': 'Year {year} · {season} · Day {day}',
  'season.spring': 'Spring', 'season.summer': 'Summer', 'season.autumn': 'Autumn', 'season.winter': 'Winter',
  'evo.running': 'Auto-evolving',
  'evo.paused': 'Paused',
  'speed.pause.title': 'Pause (Space)',
  'speed.x1.title': 'Slow: watch marches and battles',
  'speed.x2.title': 'Medium: steady simulation',
  'speed.x4.title': 'Fast: animation still visible',
  'newworld.label': '🎲 New World',
  'newworld.title': 'Reroll the world seed',
  'seed': 'Seed {n}',
  'lang.toggle.title': '切换语言 / Switch language',
  'lang.label.zh': '中',
  'lang.label.en': 'EN',

  'hint.normal': 'Drag to pan · Scroll to zoom · Click a nation',
  'hint.god.cast': 'Click a nation to cast',
  'hint.god.harmony1': 'Click the first nation…',
  'hint.god.harmony2': 'Selected {name}, now pick another…',

  'god.harvest.label': '🌾 Harvest Bless', 'god.harvest.title': 'Bless the selected nation with a harvest',
  'god.harmony.label': '🔔 Foster Harmony', 'god.harmony.title': 'Pick two nations to ease their conflict',
  'god.hero.label': '🌠 Hero is Born',     'god.hero.title': 'A legendary hero rises in the selected nation',

  'log.btn': '📖 Chronicle',
  'log.title': 'Chronicle',
  'log.title.with': 'Chronicle · {name}',
  'log.detail': 'Show details',
  'log.all': 'All',
  'log.empty': 'No major events yet. Tick “Show details” to see all.',
  'log.latest.placeholder': 'The world is born — five nations stand…',
  'toast.jump.title': 'Click to jump to this event',

  'card.subhead': 'Capital: {capital} · {ruler} reigning',
  'card.subhead.personality': 'Capital: {capital} · {ruler} ({personality}) reigning',
  'card.subhead.noruler': 'Capital: {capital} · leaderless',
  'card.stat.population': 'Pop.',
  'card.stat.food': 'Food',
  'card.stat.military': 'Army',
  'card.stat.morale': 'Morale',
  'card.stat.stability': 'Stab.',
  'card.stat.wealth': 'Wealth',
  'card.stat.culture': 'Culture',
  'card.mood': 'Mood: {mood}',
  'card.relations': 'Neighbors',
  'card.people': 'Notable people',
  'card.no_people': '—',
  'card.no_neighbors': 'No neighbors',
  'card.territory': 'Territory {t} · Cities {c}',
  'card.armies': ' · {count} armies afield ({size} troops)',
  'card.armies.lowsupply': ' · supply cut 💧',
  'card.story_btn': '📖 See this nation\'s story',
  /* memorial — fallen-kingdom card */
  'card.memorial.tag': 'fallen',
  'card.memorial.fell': 'Fell in Year {year}',
  'card.memorial.absorbedBy': ' · absorbed by {by}',
  'card.memorial.collapsed': ' · collapsed under its own weight',
  'card.memorial.figures': 'Historical figures',
  'card.memorial.no_figures': 'No record remains',
  'card.memorial.story_btn': '📖 Read this kingdom\'s old chronicle',
  'card.treaty.alliance': ' · allied',
  'card.treaty.trade': ' · trade pact',
  'card.atwar': ' · at war',

  'bio.life.alive': 'Born year {born} · still living (~{age} y.o.)',
  'bio.life.dead':  'Born year {born} — died year {death}',
  'bio.deceased': 'deceased',
  'bio.stat.ability': 'Ability',
  'bio.stat.ambition': 'Ambition',
  'bio.stat.loyalty': 'Loyalty',
  'bio.stat.prestige': 'Prestige',
  'bio.title': 'Biography',
  'bio.empty': 'No deeds recorded yet.',

  'role.king': 'King', 'role.general': 'General', 'role.hero': 'Hero',
  'personality.kind': 'Kind', 'personality.irritable': 'Irritable', 'personality.cunning': 'Cunning',
  'personality.lazy': 'Lazy', 'personality.diligent': 'Diligent', 'personality.vain': 'Vain',
  'personality.paranoid': 'Paranoid', 'personality.warlike': 'Warlike',
  'personality.conservative': 'Conservative', 'personality.gluttonous': 'Gluttonous',
  'mood.develop': 'Tending to the realm 🏡',
  'mood.expand':  'Pushing the frontier 🧭',
  'mood.fortify': 'Reinforcing borders 🧱',
  'mood.trade':   'Brokering trade 🪙',
  'mood.festival':'Throwing a festival 🎉',
  'mood.intrigue':'Plotting in the shadows 🕯️',
  'mood.survive': 'Worrying about famine 😣',
  'mood.war':     'Mustering troops ⚔️',
  'mood.atwar':   'At war with a neighbor ⚔️',
  'rel.friendly': 'friendly', 'rel.cordial': 'cordial', 'rel.civil': 'civil',
  'rel.wary': 'wary', 'rel.hostile': 'hostile', 'rel.nemesis': 'nemesis',
  'qual.food.full': 'plentiful', 'qual.food.ok': 'enough', 'qual.food.tight': 'tight', 'qual.food.lack': 'scarce',
  'qual.morale.high': 'devoted', 'qual.morale.mid': 'content', 'qual.morale.low': 'unhappy', 'qual.morale.break': 'breaking',
  'qual.stability.firm': 'firm', 'qual.stability.steady': 'steady', 'qual.stability.unstable': 'unstable', 'qual.stability.broken': 'broken',
  'qual.wealth.prosperous': 'prosperous', 'qual.wealth.modest': 'modest', 'qual.wealth.poor': 'poor',
  'qual.culture.brilliant': 'brilliant', 'qual.culture.flourishing': 'flourishing', 'qual.culture.simple': 'simple',

  'nation.dog': 'Dog Kingdom', 'nation.cat': 'Cat Kingdom', 'nation.fox': 'Fox Realm',
  'nation.mole': 'Mole Burrow', 'nation.badger': 'Badger Holds',
};

// 国家名（按 species 查询，UI 用，独立于 Nation.name 中存的字符串）
export function nationName(species: string): string { return t(`nation.${species}`); }

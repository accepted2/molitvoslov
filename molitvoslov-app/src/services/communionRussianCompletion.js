/**
 * Russian liturgical completions for the Communion preparation, kept separate
 * from the Church Slavonic source. Applied when a rule is read from either the
 * offline bundle or the optional local Django preview.
 *
 * No original content, IDs, orders, or translations in other rules are changed.
 * Source-backed, not a replacement for importing a complete reviewed edition.
 */
export const COMMUNION_RU_SLUG = 'posledovanie-ko-svyatomu-prichashcheniyu';

const withoutAccents = value => String(value || '')
  .normalize('NFD')
  .replace(/\p{M}/gu, '')
  .toLowerCase()
  .replace(/ё/g, 'е')
  .replace(/\s+/gu, ' ')
  .trim();

const isSection = item => item?.item_type === 'section';
const isText = item => item?.item_type === 'text' && !!item?.text;
const source = item => withoutAccents(item?.text?.content);

// The original Church Slavonic has these rubrics inline, while the Russian
// translation often omits them. Only presentation labels are added; text IDs,
// offsets and translations remain untouched.
const COMMUNION_RUBRICS = Object.freeze([
  ['ирмос', 'Ирмос:'],
  ['припев', 'Припев:'],
  ['богородичен', 'Богородичен:'],
  ['троичен', 'Троичен:'],
  ['крестобогородичен', 'Крестобогородичен:'],
  ['седален', 'Седален:'],
  ['кондак', 'Кондак:'],
  ['икос', 'Икос:'],
  ['светилен', 'Светилен:'],
  ['тропарь', 'Тропарь:'],
]);

export const getCommunionRussianRubric = (churchText, russianText) => {
  const church = withoutAccents(churchText);
  const russian = withoutAccents(russianText);
  for (const [token, label] of COMMUNION_RUBRICS) {
    const prefix = new RegExp('^' + token + '\\s*[:：]', 'u');
    if (!prefix.test(church)) continue;
    return prefix.test(russian) ? '' : label;
  }
  return '';
};

const AFTER_PSALM_GLORY =
  'Сла́ва Отцу́, и Сы́ну, и Свято́му Ду́ху, и ны́не и при́сно, и во ве́ки веко́в. Ами́нь.';
const AFTER_PSALM_ALLELUIA =
  'Аллилу́иа, аллилу́иа, аллилу́иа,\nсла́ва Тебе́, Бо́же. (Трижды)';

const TROPAR_1 =
  'Беззакония мои презри, Господи, от Девы рожденный, и сердце моё очисти, делая его храмом пречистого Твоего Тела и Крови; не отринь меня от Твоего лица, имеющий безмерно великую милость.';
const TROPAR_2 =
  'Сла́ва Отцу, и Сы́ну, и Свято́му Ду́ху.\n' +
  'На причащение святынь Твоих как дерзну я, недостойный? Ведь если осмелюсь подойти к Тебе с достойными, одежда меня обличает, — ибо не в такой идут на вечерю, и получу осуждение многогрешной души моей. Очисти, Господи, скверну души моей и спаси меня, как Человеколюбец.';
const TROPAR_3 =
  'И ны́не, и при́сно, и во ве́ки веко́в, ами́нь.\n' +
  'Бесчисленно множество моих, Богородица, согрешений, — к Тебе я прибег, Чистая, нуждаясь в спасении. Воззри милостиво на немощную мою душу и ходатайствуй пред Сыном Твоим и Богом нашим, да будет мне дано прощение соделанных мною согрешений тяжких, Единая Благословенная.';

// The final invocation ("И ещё:") repeats a Church Slavonic prayer from
// earlier in the rule. Only the last occurrence needs this Russian text;
// the earlier occurrence and all original IDs and content stay unchanged.
export const FINAL_COMMUNION_RUSSIAN =
  'Вечери Твоей таинственной участником в сей день, Сын Божий, меня прими. ' +
  'Ибо не поведаю я тайны врагам Твоим, не дам Тебе поцелуя, такого, как Иуда. ' +
  'Но как разбойник исповедаю Тебя: «Помяни меня, Господи, в Царстве Твоём!»';

const lastTextIndex = items => {
  if (!Array.isArray(items)) return -1;
  for (let index = items.length - 1; index >= 0; index -= 1) {
    if (isText(items[index])) return index;
  }
  return -1;
};

export const hasFinalCommunionInvocation = rule => {
  if (!Array.isArray(rule?.items)) return false;
  const lastIndex = lastTextIndex(rule.items);
  if (lastIndex < 0) return false;
  const last = source(rule.items[lastIndex]);
  // withoutAccents deliberately removes the breve from й -> и.
  return /^вечери твоея таиныя днесь[, ]+сыне божии[, ]+причастника мя приими/u.test(last) &&
    /помяни мя[, ]+господи[, ]+во царствии твоем/u.test(last);
};

const completeFinalCommunionRussian = rule => {
  if (!hasFinalCommunionInvocation(rule)) return rule;
  const items = rule.items;
  const index = lastTextIndex(items);
  const lastItem = items[index];
  if (lastItem.text.translation === FINAL_COMMUNION_RUSSIAN) return rule;
  const nextItems = [...items];
  nextItems[index] = {
    ...lastItem,
    text: {...lastItem.text, translation: FINAL_COMMUNION_RUSSIAN},
  };
  return {...rule, items: nextItems};
};

export const completeCommunionRussian = rule => {
  if (!rule || rule.slug !== COMMUNION_RU_SLUG || !Array.isArray(rule.items)) {
    return rule;
  }

  const withFinalPrayer = completeFinalCommunionRussian(rule);
  const items = withFinalPrayer.items;
  const psalm = items.findIndex(item =>
    isSection(item) && /^псалом\s+115$/u.test(withoutAccents(item.title)));
  const troparia = items.findIndex((item, index) =>
    index > psalm && isSection(item) &&
    /^тропар/u.test(withoutAccents(item.title)) &&
    /\b8\b/u.test(withoutAccents(item.title)));
  if (psalm < 0 || troparia <= psalm) return withFinalPrayer;

  // Require the exact order of original source blocks before changing RU.
  // Never attach a doxology to an unrelated psalm or hymn.
  const between = items.map((item, index) => ({item, index}))
    .filter(row => row.index > psalm && row.index < troparia && isText(row.item));
  const following = items.findIndex((item, index) =>
    index > troparia && isSection(item));
  const end = following < 0 ? items.length : following;
  const hymns = items.map((item, index) => ({item, index}))
    .filter(row => row.index > troparia && row.index < end && isText(row.item));

  const findUnique = (rows, starts) => {
    const found = rows.filter(row => starts.some(start => source(row.item).startsWith(start)));
    return found.length === 1 ? found[0].index : -1;
  };

  const glory = findUnique(between, ['слава отцу']);
  const alleluia = findUnique(between, ['аллилуиа', 'аллилуйа']);
  const first = findUnique(hymns, ['беззакония']);
  const second = findUnique(hymns, ['слава отцу']);
  const third = findUnique(hymns, ['и ныне']);
  const indices = [glory, alleluia, first, second, third];
  if (indices.some(index => index < 0) ||
      !(glory < alleluia && first < second && second < third)) {
    return withFinalPrayer;
  }

  const translations = new Map([
    [glory, AFTER_PSALM_GLORY],
    [alleluia, AFTER_PSALM_ALLELUIA],
    [first, TROPAR_1],
    [second, TROPAR_2],
    [third, TROPAR_3],
  ]);
  let changed = false;
  const completedItems = items.map((item, index) => {
    const next = translations.get(index);
    if (next === undefined || item.text.translation === next) return item;
    changed = true;
    return {...item, text: {...item.text, translation: next}};
  });
  return changed ? {...withFinalPrayer, items: completedItems} : withFinalPrayer;
};

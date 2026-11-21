/**
 * The complete Church Slavonic Traditional Communion text supplied 2026-11-21.
 * The original Church/Russian/parallel source is never overwritten.
 */
import traditionalSource from '../data/communionTraditionalSource.json';

const COMMUNION_SLUG = 'posledovanie-ko-svyatomu-prichashcheniyu';
const TRADITIONAL_BASE = 6121000;
const SCOPED_RUBRICS = new Set([
  'Ирмос', 'Припев', 'Богородичен', 'Троичен',
  'Кондак', 'Икос', 'Седален', 'Тропарь', 'Тропари',
  'Слава', 'И ныне', 'Аллилуиа', 'Стихи',
  'Стихи пред причащением', 'Иныя стихи',
  'Тропарь праздника',
]);

const formatTraditionalBlock = block => {
  const body = String(block?.text || '').trim();
  const rubric = String(block?.rubric || '').trim().replace(/:$/, '');
  if (!body) return '';
  // Markdown bold labels encode rubrics. Show liturgical cues in the text,
  // but never duplicate the title "Псалом" or "Молитва" below its heading.
  return SCOPED_RUBRICS.has(rubric) && !body.startsWith(rubric + ':')
    ? rubric + ': ' + body
    : body;
};

const isTargetRule = rule =>
  rule?.slug === COMMUNION_SLUG &&
  traditionalSource?.document === COMMUNION_SLUG &&
  traditionalSource?.version === 1;

let cachedItems = null;

export const hasCommunionTraditionalEdition = rule => isTargetRule(rule);

const buildTraditionalItems = () => {
  if (cachedItems) return cachedItems;
  const groups = traditionalSource?.groups;
  if (!Array.isArray(groups) || groups.length !== 27) {
    throw Error('Incorrect Communion traditional edition: expected 27 sections');
  }
  const items = [];
  let count = 0;
  for (const group of groups) {
    if (!group?.title || !Array.isArray(group.blocks)) {
      throw Error('Incomplete Communion traditional section');
    }
    // Empty section headings are valid: "Канон, глас 2", for example.
    // The original PrayerRuleItem identifiers are left untouched.
    const headingId = TRADITIONAL_BASE + items.length;
    items.push({
      id: headingId,
      item_type: 'section',
      title: String(group.title),
      traditional_title: String(group.title),
      content: '',
      communionTraditionalHeading: true,
    });
    for (const block of group.blocks) {
      const content = formatTraditionalBlock(block);
      if (!content) throw Error('Empty Communion traditional text');
      const id = TRADITIONAL_BASE + items.length;
      items.push({
        id,
        item_type: 'text',
        communionTraditionalText: true,
        text: {
          id,
          title: '',
          content,
          traditional_content: content,
          translation: '',
          description: '',
        },
      });
      count++;
    }
  }
  if (count !== 108 || items.length !== 135) {
    throw Error('Incomplete Communion traditional text: '+count+' blocks');
  }
  cachedItems = items;
  return items;
};

export const completeCommunionTraditionalRule = (rule, viewMode) => {
  if (viewMode !== 'traditional' || !isTargetRule(rule)) return rule;
  return {
    ...rule,
    items: buildTraditionalItems(),
    communionTraditionalEdition: true,
  };
};

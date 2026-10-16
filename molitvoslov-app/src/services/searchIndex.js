import {bibleContent} from './bibleContent';
import {getCurrentBibleContent} from './bibleStore';
import {getCurrentContent} from './contentStore';

export const SEARCH_GROUPS = {
  ALL: 'all',
  PRAYERS: 'prayers',
  AKATHISTS: 'akathists',
  PSALTER: 'psalter',
  CANONS: 'canons',
  SCRIPTURE: 'scripture',
};

export const SEARCH_GROUP_OPTIONS = [
  {key: SEARCH_GROUPS.ALL, label: 'Все'},
  {key: SEARCH_GROUPS.PRAYERS, label: 'Молитвы'},
  {key: SEARCH_GROUPS.AKATHISTS, label: 'Акафисты'},
  {key: SEARCH_GROUPS.PSALTER, label: 'Псалтирь'},
  {key: SEARCH_GROUPS.CANONS, label: 'Каноны'},
  {key: SEARCH_GROUPS.SCRIPTURE, label: 'Писание'},
];

const GROUP_LABELS = Object.fromEntries(
  SEARCH_GROUP_OPTIONS.filter((item) => item.key !== SEARCH_GROUPS.ALL).map((item) => [
    item.key,
    item.label,
  ])
);

const COMBINING_MARK = /[\u0300-\u036f\u0483-\u0489\ufe20-\ufe2f]/u;
const SEARCH_CHARACTER = /[\p{L}\p{N}]/u;

const clean = (value) =>
  String(value || '')
    .replace(/\u00ad/g, '')
    .replace(/\u200b/g, '')
    .replace(/\s+/g, ' ')
    .trim();

const previewText = (value, limit = 190) => {
  const text = clean(value);

  if (!text) {
    return '';
  }

  return text.length > limit ? text.slice(0, limit).trimEnd() + '…' : text;
};

const localized = (item, field, language) => {
  if (!item) {
    return '';
  }

  if (language === 'uk') {
    return clean(item[`${field}_uk`]) || clean(item[field]);
  }

  return clean(item[field]);
};

const foldWithMap = (value) => {
  const source = String(value || '');
  const chars = [];
  const map = [];
  let previousWasSpace = true;

  for (let sourceIndex = 0; sourceIndex < source.length; ) {
    const codePoint = source.codePointAt(sourceIndex);
    const originalChar = String.fromCodePoint(codePoint);

    if (COMBINING_MARK.test(originalChar)) {
      sourceIndex += originalChar.length;
      continue;
    }

    const decomposed = originalChar.normalize('NFD').toLowerCase();

    let addedCharacter = false;

    for (const char of decomposed) {
      if (COMBINING_MARK.test(char)) {
        continue;
      }

      if (SEARCH_CHARACTER.test(char)) {
        chars.push(char);
        map.push(sourceIndex);
        previousWasSpace = false;
        addedCharacter = true;
      } else if (!previousWasSpace) {
        chars.push(' ');
        map.push(sourceIndex);
        previousWasSpace = true;
      }
    }

    if (!addedCharacter && !previousWasSpace) {
      chars.push(' ');
      map.push(sourceIndex);
      previousWasSpace = true;
    }

    sourceIndex += originalChar.length;
  }

  while (chars.length && chars[chars.length - 1] === ' ') {
    chars.pop();
    map.pop();
  }

  return {
    value: chars.join(''),
    map,
  };
};

export const normalizeSearchText = (value) => foldWithMap(value).value;

const languageLabel = (language) => {
  if (language === 'traditional') {
    return 'ЦС традиц.';
  }

  if (language === 'church') {
    return 'ЦС';
  }

  if (language === 'ukrainian') {
    return 'Укр.';
  }

  if (language === 'russian') {
    return 'Рус.';
  }

  return '';
};

const field = (value, language = '', role = 'content', weight = 0) => {
  const text = clean(value);

  if (!text) {
    return null;
  }

  return {
    text,
    normalized: normalizeSearchText(text),
    language,
    role,
    weight,
  };
};

const compactFields = (items) => items.filter(Boolean);

const makeEntry = ({
  id,
  group,
  kind,
  title,
  source,
  fields = [],
  route,
  preview = '',
  searchTitle = true,
  searchSource = false,
}) => ({
  id,
  group,
  kind,
  title: clean(title),
  source: clean(source),
  fields: compactFields(fields),
  route,
  preview: clean(preview),
  titleNormalized: searchTitle ? normalizeSearchText(title) : '',
  sourceNormalized: searchSource ? normalizeSearchText(source) : '',
});

const textFields = (text) =>
  compactFields([
    field(text?.title, '', 'title', 520),
    field(text?.title_uk, '', 'title', 500),
    field(text?.traditional_title, 'traditional', 'title', 500),
    field(text?.description, '', 'description', 280),
    field(text?.description_uk, 'ukrainian', 'description', 260),
    field(text?.content, 'church', 'content', 120),
    field(text?.traditional_content, 'traditional', 'content', 120),
    field(text?.translation, 'russian', 'content', 130),
    field(text?.translation_uk, 'ukrainian', 'content', 125),
  ]);

const prayerRuleItemTitle = (item, ruleTitle) => {
  if (item?.item_type === 'text') {
    return (
      clean(item.text?.title) ||
      clean(item.text?.traditional_title) ||
      clean(item.text?.description) ||
      ruleTitle
    );
  }

  return clean(item?.title) || ruleTitle;
};

const akathistSectionTitle = (section) => {
  const number = Number(section?.number || 0);

  if (section?.section_type === 'kontakion') {
    return number ? `Кондак ${number}` : 'Кондак';
  }

  if (section?.section_type === 'ikos') {
    return number ? `Икос ${number}` : 'Икос';
  }

  if (section?.section_type === 'prayer') {
    return number ? `Молитва ${number}` : 'Молитва';
  }

  return clean(section?.text?.title) || 'Раздел';
};

const canonSectionTitle = (section) => {
  const heading = clean(section?.heading) || clean(section?.display_heading);

  if (heading) {
    return heading;
  }

  if (section?.ode_number) {
    return `Песнь ${section.ode_number}`;
  }

  if (section?.section_type === 'prayer') {
    return 'Молитва';
  }

  return 'Раздел канона';
};

const bibleSectionLabel = (section) => {
  if (section === 'gospels') {
    return 'Евангелие';
  }

  if (section === 'acts') {
    return 'Деяния';
  }

  if (section === 'epistles') {
    return 'Послания';
  }

  if (section === 'revelation') {
    return 'Апокалипсис';
  }

  return 'Ветхий Завет';
};

const collectStructuredTextIds = (content) => {
  const ids = new Set();

  (content?.prayer_rules?.list || []).forEach((rule) => {
    (rule.items || []).forEach((item) => {
      if (item.text?.id) {
        ids.add(Number(item.text.id));
      }
    });
  });

  Object.values(content?.akathists?.by_slug || {}).forEach((akathist) => {
    [
      akathist?.troparion,
      akathist?.kontakion_before,
      akathist?.common_rule?.opening,
      akathist?.common_rule?.ending,
    ]
      .filter(Boolean)
      .forEach((item) => {
        if (item.id) {
          ids.add(Number(item.id));
        }
      });

    (akathist?.sections || []).forEach((section) => {
      if (section.text?.id) {
        ids.add(Number(section.text.id));
      }
    });
  });

  Object.values(content?.canons?.by_slug || {}).forEach((canon) => {
    (canon?.sections || []).forEach((section) => {
      if (section.text?.id) {
        ids.add(Number(section.text.id));
      }
    });
  });

  return ids;
};

const cachedIndexes = new Map();

let cachedBibleCorpus = null;
let cachedBibleCorpusKey = '';
let pendingBibleCorpus = null;

const buildSearchIndexIterator = function* (language = 'ru') {
  const content = getCurrentContent() || {};
  const bible = getCurrentBibleContent('rst') || {};
  const cacheKey = [
    language,
    content.content_version || content.generated_at || 'public',
    bible.content_version || bible.generated_at || 'bible',
  ].join(':');

  if (cachedIndexes.has(cacheKey)) {
    return cachedIndexes.get(cacheKey);
  }

  const entries = [];
  const structuredTextIds = collectStructuredTextIds(content);

  for (const rule of content?.prayer_rules?.list || []) {
    ((rule) => {
      const ruleTitle =
        localized(rule, 'name', language) ||
        clean(rule.name) ||
        clean(rule.traditional_name) ||
        'Молитвенное правило';

      entries.push(
        makeEntry({
          id: `prayer-rule:${rule.id}`,
          group: SEARCH_GROUPS.PRAYERS,
          kind: 'prayer-rule',
          title: ruleTitle,
          source: 'Молитвенное правило',
          fields: compactFields([
            field(rule.name, '', 'title', 540),
            field(rule.name_uk, 'ukrainian', 'title', 520),
            field(rule.traditional_name, 'traditional', 'title', 520),
            field(rule.description, '', 'description', 260),
            field(rule.description_uk, 'ukrainian', 'description', 250),
          ]),
          route: {
            name: 'PrayerRule',
            params: {
              slug: rule.slug,
            },
          },
          preview: localized(rule, 'description', language),
        })
      );

      (rule.items || []).forEach((item) => {
        const itemTitle = prayerRuleItemTitle(item, ruleTitle);
        const itemFields =
          item.item_type === 'text'
            ? textFields(item.text)
            : compactFields([
                field(item.title, '', 'title', 430),
                field(item.title_uk, 'ukrainian', 'title', 410),
                field(item.content, 'church', 'content', 120),
                field(item.content_uk, 'ukrainian', 'content', 120),
                field(item.note, '', 'description', 180),
                field(item.note_uk, 'ukrainian', 'description', 180),
              ]);

        if (!itemFields.length) {
          return;
        }

        entries.push(
          makeEntry({
            id: `prayer-rule:${rule.id}:item:${item.id}`,
            group: SEARCH_GROUPS.PRAYERS,
            kind: 'prayer',
            title: itemTitle,
            source: `Молитвенное правило · ${ruleTitle}`,
            fields: itemFields,
            route: {
              name: 'PrayerRule',
              params: {
                slug: rule.slug,
                focusTarget: {
                  anchor_type: 'prayer_rule_item',
                  anchor_id: Number(item.id),
                  start_offset: null,
                  end_offset: null,
                },
              },
            },
          })
        );
      });
    })(rule);
    yield entries;
  }

  for (const text of Object.values(content?.texts || {})) {
    ((text) => {
      if (!text?.id || structuredTextIds.has(Number(text.id))) {
        return;
      }

      const title =
        language === 'uk'
          ? clean(text.title_uk) || clean(text.title)
          : clean(text.title) || clean(text.traditional_title);

      if (!title && !text.content && !text.translation) {
        return;
      }

      const categoryNames = (text.categories || [])
        .map((category) => localized(category, 'name', language))
        .filter(Boolean);

      entries.push(
        makeEntry({
          id: `text:${text.id}`,
          group: SEARCH_GROUPS.PRAYERS,
          kind: 'text',
          title: title || 'Молитва',
          source: categoryNames[0] || 'Молитвы',
          fields: textFields(text),
          route: {
            name: 'Reader',
            params: {
              slug: text.slug,
              focusTarget: {
                anchor_type: 'text',
                anchor_id: Number(text.id),
                start_offset: null,
                end_offset: null,
              },
            },
          },
          preview:
            language === 'uk'
              ? clean(text.translation_uk) || clean(text.translation) || clean(text.content)
              : clean(text.translation) || clean(text.content),
        })
      );
    })(text);
    yield entries;
  }

  for (const akathist of Object.values(content?.akathists?.by_slug || {})) {
    ((akathist) => {
      if (!akathist?.id) {
        return;
      }

      const akathistTitle =
        localized(akathist, 'title', language) || clean(akathist.title) || 'Акафист';

      entries.push(
        makeEntry({
          id: `akathist:${akathist.id}`,
          group: SEARCH_GROUPS.AKATHISTS,
          kind: 'akathist',
          title: akathistTitle,
          source: 'Акафист',
          fields: compactFields([
            field(akathist.title, '', 'title', 560),
            field(akathist.title_uk, 'ukrainian', 'title', 540),
            field(akathist.description, '', 'description', 260),
            field(akathist.description_uk, 'ukrainian', 'description', 250),
          ]),
          route: {
            name: 'Akathist',
            params: {
              akathistId: Number(akathist.id),
              slug: akathist.slug,
              title: akathistTitle,
            },
          },
          preview: localized(akathist, 'description', language),
        })
      );

      const addAkathistText = (text, title, key) => {
        if (!text?.id) {
          return;
        }

        entries.push(
          makeEntry({
            id: `akathist:${akathist.id}:special:${key}`,
            group: SEARCH_GROUPS.AKATHISTS,
            kind: 'akathist-section',
            title,
            source: `Акафист · ${akathistTitle}`,
            fields: textFields(text),
            route: {
              name: 'Akathist',
              params: {
                akathistId: Number(akathist.id),
                slug: akathist.slug,
                title: akathistTitle,
                focusTarget: {
                  anchor_type: 'akathist_special',
                  anchor_id: Number(text.id),
                  start_offset: null,
                  end_offset: null,
                  metadata: {
                    special: key,
                  },
                },
              },
            },
          })
        );
      };

      addAkathistText(akathist.troparion, 'Тропарь', 'troparion');
      addAkathistText(akathist.kontakion_before, 'Кондак', 'kontakion_before');
      addAkathistText(akathist.common_rule?.opening, 'Молитвы перед акафистом', 'opening');
      addAkathistText(akathist.common_rule?.ending, 'Молитвы после акафиста', 'ending');

      (akathist.sections || []).forEach((section) => {
        if (!section?.id || !section.text) {
          return;
        }

        entries.push(
          makeEntry({
            id: `akathist:${akathist.id}:section:${section.id}`,
            group: SEARCH_GROUPS.AKATHISTS,
            kind: 'akathist-section',
            title: akathistSectionTitle(section),
            source: `Акафист · ${akathistTitle}`,
            fields: compactFields([
              ...textFields(section.text),
              field(section.note, '', 'description', 180),
              field(section.note_uk, 'ukrainian', 'description', 170),
            ]),
            route: {
              name: 'Akathist',
              params: {
                akathistId: Number(akathist.id),
                slug: akathist.slug,
                title: akathistTitle,
                focusTarget: {
                  anchor_type: 'akathist_section',
                  anchor_id: Number(section.id),
                  start_offset: null,
                  end_offset: null,
                },
              },
            },
          })
        );
      });
    })(akathist);
    yield entries;
  }

  for (const canon of Object.values(content?.canons?.by_slug || {})) {
    ((canon) => {
      if (!canon?.id) {
        return;
      }

      const canonTitle = localized(canon, 'title', language) || clean(canon.title) || 'Канон';

      entries.push(
        makeEntry({
          id: `canon:${canon.id}`,
          group: SEARCH_GROUPS.CANONS,
          kind: 'canon',
          title: canonTitle,
          source: 'Канон',
          fields: compactFields([
            field(canon.title, '', 'title', 560),
            field(canon.title_uk, 'ukrainian', 'title', 540),
            field(canon.description, '', 'description', 260),
            field(canon.description_uk, 'ukrainian', 'description', 250),
            field(canon.tone, '', 'description', 180),
          ]),
          route: {
            name: 'Canon',
            params: {
              canonId: Number(canon.id),
              slug: canon.slug,
              title: canonTitle,
            },
          },
          preview: localized(canon, 'description', language),
        })
      );

      (canon.sections || []).forEach((section) => {
        if (!section?.id || !section.text) {
          return;
        }

        entries.push(
          makeEntry({
            id: `canon:${canon.id}:section:${section.id}`,
            group: SEARCH_GROUPS.CANONS,
            kind: 'canon-section',
            title: canonSectionTitle(section),
            source: `Канон · ${canonTitle}`,
            fields: compactFields([
              field(section.heading, '', 'title', 460),
              field(section.heading_uk, 'ukrainian', 'title', 440),
              ...textFields(section.text),
            ]),
            route: {
              name: 'Canon',
              params: {
                canonId: Number(canon.id),
                slug: canon.slug,
                title: canonTitle,
                focusTarget: {
                  anchor_type: 'canon_section',
                  anchor_id: Number(section.id),
                  start_offset: null,
                  end_offset: null,
                },
              },
            },
          })
        );
      });
    })(canon);
    yield entries;
  }

  const psalter = (content?.psalters?.list || [])[0] || null;

  if (psalter) {
    const psalterTitle = localized(psalter, 'name', language) || clean(psalter.name) || 'Псалтирь';

    entries.push(
      makeEntry({
        id: `psalter:${psalter.id}`,
        group: SEARCH_GROUPS.PSALTER,
        kind: 'psalter',
        title: psalterTitle,
        source: 'Псалтирь',
        fields: compactFields([
          field(psalter.name, '', 'title', 560),
          field(psalter.name_uk, 'ukrainian', 'title', 540),
          field(psalter.description, '', 'description', 250),
          field(psalter.description_uk, 'ukrainian', 'description', 240),
          field(psalter.prayers_before, 'church', 'content', 110),
          field(psalter.prayers_before_russian, 'russian', 'content', 120),
          field(psalter.prayers_before_traditional, 'traditional', 'content', 110),
          field(psalter.prayers_after, 'church', 'content', 110),
          field(psalter.prayers_after_russian, 'russian', 'content', 120),
          field(psalter.prayers_after_traditional, 'traditional', 'content', 110),
        ]),
        route: {
          name: 'Psalter',
          params: {},
        },
      })
    );
  }

  for (const kathisma of Object.values(content?.kathismas?.by_number || {})) {
    ((kathisma) => {
      const kathismaNumber = Number(kathisma?.number || 0);

      if (!kathismaNumber) {
        return;
      }

      const kathismaTitle =
        localized(kathisma, 'title', language) ||
        clean(kathisma.title) ||
        `Кафизма ${kathismaNumber}`;

      entries.push(
        makeEntry({
          id: `kathisma:${kathisma.id || kathismaNumber}`,
          group: SEARCH_GROUPS.PSALTER,
          kind: 'kathisma',
          title: kathismaTitle,
          source: 'Псалтирь',
          fields: compactFields([
            field(kathisma.title, '', 'title', 500),
            field(kathisma.title_uk, 'ukrainian', 'title', 480),
            field(`Кафизма ${kathismaNumber}`, '', 'title', 520),
            field(kathisma.prayers_after, 'church', 'content', 110),
            field(kathisma.prayers_after_russian, 'russian', 'content', 120),
            field(kathisma.prayers_after_traditional, 'traditional', 'content', 110),
          ]),
          route: {
            name: 'Kathisma',
            params: {
              kathismaNumber,
              kathismaTitle,
            },
          },
        })
      );

      (kathisma.psalms || []).forEach((psalm) => {
        const psalmNumber = Number(psalm?.number || 0);
        const psalmTitle =
          language === 'uk'
            ? clean(psalm.title_uk) || clean(psalm.title_russian) || `Псалом ${psalmNumber}`
            : clean(psalm.title_russian) ||
              clean(psalm.title_church_slavonic) ||
              `Псалом ${psalmNumber}`;

        const psalmPreview = previewText(
          (psalm.verses || [])
            .slice(0, 2)
            .map(
              (verse) =>
                clean(verse.russian) ||
                clean(verse.church_slavonic) ||
                clean(verse.church_slavonic_traditional)
            )
            .filter(Boolean)
            .join(' ')
        );

        entries.push(
          makeEntry({
            id: `psalm:${psalm.id}`,
            group: SEARCH_GROUPS.PSALTER,
            kind: 'psalm',
            title: `Псалом ${psalmNumber}`,
            source: `Псалтирь · ${kathismaTitle}`,
            fields: compactFields([
              field(`Псалом ${psalmNumber}`, '', 'title', 540),
              field(psalmTitle, '', 'title', 480),
              field(psalm.title_church_slavonic, 'church', 'title', 450),
              field(psalm.title_church_slavonic_traditional, 'traditional', 'title', 450),
              field(psalm.description, '', 'description', 220),
              field(psalm.description_uk, 'ukrainian', 'description', 210),
            ]),
            route: {
              name: 'Kathisma',
              params: {
                kathismaNumber,
                kathismaTitle,
                focusTarget: {
                  save_type: 'psalm',
                  anchor_type: 'psalm',
                  anchor_id: Number(psalm.id),
                  start_offset: null,
                  end_offset: null,
                  metadata: {
                    psalm_id: Number(psalm.id),
                    psalm_number: psalmNumber,
                  },
                },
              },
            },
            preview: psalmPreview,
          })
        );

        (psalm.verses || []).forEach((verse) => {
          const verseNumber = Number(verse?.number || 0);

          entries.push(
            makeEntry({
              id: `psalm:${psalm.id}:verse:${verse.id}`,
              group: SEARCH_GROUPS.PSALTER,
              kind: 'psalm-verse',
              title: `Псалом ${psalmNumber}:${verseNumber}`,
              source: `Псалтирь · ${kathismaTitle}`,
              searchTitle: false,
              fields: compactFields([
                field(`Псалом ${psalmNumber}:${verseNumber}`, '', 'reference', 620),
                field(verse.church_slavonic, 'church', 'content', 130),
                field(verse.church_slavonic_traditional, 'traditional', 'content', 130),
                field(verse.russian, 'russian', 'content', 140),
                field(verse.ukrainian, 'ukrainian', 'content', 135),
              ]),
              route: {
                name: 'Kathisma',
                params: {
                  kathismaNumber,
                  kathismaTitle,
                  focusTarget: {
                    save_type: 'fragment',
                    anchor_type: 'psalm_verse',
                    anchor_id: Number(verse.id),
                    start_offset: null,
                    end_offset: null,
                    metadata: {
                      psalm_id: Number(psalm.id),
                      psalm_number: psalmNumber,
                      verse_number: verseNumber,
                    },
                  },
                },
              },
              preview: previewText(
                clean(verse.russian) ||
                  clean(verse.church_slavonic) ||
                  clean(verse.church_slavonic_traditional)
              ),
            })
          );
        });
      });
    })(kathisma);
    yield entries;
  }

  for (const book of bible?.books || []) {
    ((book) => {
      const displayName = bibleContent.getDisplayName(book);
      const sectionLabel = bibleSectionLabel(book.section);
      const firstChapter = (book.chapters || [])[0];
      const bookPreview = previewText(
        (firstChapter?.verses || [])
          .slice(0, 2)
          .map((verse) => clean(verse.text))
          .filter(Boolean)
          .join(' ')
      );

      entries.push(
        makeEntry({
          id: `bible-book:${book.id}`,
          group: SEARCH_GROUPS.SCRIPTURE,
          kind: 'bible-book',
          title: displayName,
          source: `Писание · ${sectionLabel}`,
          fields: compactFields([
            field(displayName, '', 'title', 600),
            field(book.name, '', 'title', 580),
            field(book.short_name, '', 'title', 540),
          ]),
          route: {
            name: 'BibleBook',
            params: {
              bookId: Number(book.id),
            },
          },
          preview: bookPreview,
        })
      );

      (book.chapters || []).forEach((chapter) => {
        const chapterPreview = previewText(
          (chapter.verses || [])
            .slice(0, 2)
            .map((verse) => clean(verse.text))
            .filter(Boolean)
            .join(' ')
        );

        entries.push(
          makeEntry({
            id: `bible-chapter:${book.id}:${chapter.id}`,
            group: SEARCH_GROUPS.SCRIPTURE,
            kind: 'bible-chapter',
            title: `${displayName} ${chapter.number}`,
            source: `Писание · ${sectionLabel}`,
            fields: compactFields([
              field(`${displayName} ${chapter.number}`, '', 'reference', 640),
              field(`${book.short_name || displayName} ${chapter.number}`, '', 'reference', 620),
            ]),
            route: {
              name: 'BibleChapter',
              params: {
                bookId: Number(book.id),
                chapterNumber: Number(chapter.number),
                resume: false,
              },
            },
            preview: chapterPreview,
          })
        );
      });
    })(book);
    yield entries;
  }

  if (cachedIndexes.size >= 4) {
    cachedIndexes.clear();
  }

  cachedIndexes.set(cacheKey, entries);

  return entries;
};

/**
 * Cooperative index building. Each yield follows one source item (a prayer,
 * akathist, canon, kathisma or Bible book). Work is distributed across frames;
 * the initial search screen never performs the whole indexing pass at once.
 */
export const buildSearchIndexAsync = async (
  language = 'ru',
  {onProgress = () => {}, isCancelled = () => false, batchSize = 3} = {}
) => {
  const iterator = buildSearchIndexIterator(language);
  let step;
  let processed = 0;
  let lastPublished = 0;
  let lastPublishTime = 0;
  let latestEntries = [];

  while (!(step = iterator.next()).done) {
    if (isCancelled()) {
      iterator.return();
      return null;
    }
    latestEntries = step.value;
    processed += 1;
    if (processed % batchSize === 0) {
      const now = Date.now();
      if (
        latestEntries.length !== lastPublished &&
        (lastPublishTime === 0 || now - lastPublishTime >= 160)
      ) {
        lastPublished = latestEntries.length;
        lastPublishTime = now;
        onProgress(latestEntries.slice());
      }
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  if (isCancelled()) {
    return null;
  }

  const entries = step.value || latestEntries;
  onProgress(entries.slice());
  return entries;
};

// Retained for existing synchronous callers; SearchScreen uses the async path.
export const buildSearchIndex = (language = 'ru') => {
  const iterator = buildSearchIndexIterator(language);
  let step = iterator.next();
  while (!step.done) {
    step = iterator.next();
  }
  return step.value;
};

const hasWholeToken = (value, token) => {
  if (!value || !token) {
    return false;
  }

  return ` ${value} `.includes(` ${token} `);
};

const firstMatchField = (entry, normalizedQuery, tokens) => {
  const full = entry.fields
    .filter((item) => item.normalized.includes(normalizedQuery))
    .sort((a, b) => b.weight - a.weight)[0];

  if (full) {
    return full;
  }

  return (
    entry.fields
      .filter((item) => tokens.some((token) => item.normalized.includes(token)))
      .sort((a, b) => b.weight - a.weight)[0] || null
  );
};

const makeSnippet = (value, query, radius = 78) => {
  const source = clean(value);

  if (!source) {
    return '';
  }

  const folded = foldWithMap(source);
  const normalizedQuery = normalizeSearchText(query);
  const tokens = getQueryTokens(normalizedQuery);
  let index = normalizedQuery ? folded.value.indexOf(normalizedQuery) : -1;

  if (index < 0 && tokens.length) {
    index = folded.value.indexOf(tokens[0]);
  }

  if (index < 0) {
    return source.length > radius * 2 ? source.slice(0, radius * 2).trim() + '…' : source;
  }

  const sourceIndex = folded.map[index] ?? 0;
  const start = Math.max(0, sourceIndex - radius);
  const end = Math.min(source.length, sourceIndex + radius);

  return (
    (start > 0 ? '…' : '') +
    source.slice(start, end).replace(/\s+/g, ' ').trim() +
    (end < source.length ? '…' : '')
  );
};

const scoreEntry = (entry, normalizedQuery, tokens) => {
  const searchable = [
    entry.titleNormalized,
    entry.sourceNormalized,
    ...entry.fields.map((item) => item.normalized),
  ].filter(Boolean);

  if (!tokens.every((token) => searchable.some((value) => value.includes(token)))) {
    return null;
  }

  let score = 0;

  if (entry.titleNormalized === normalizedQuery) {
    score += 1800;
  } else if (entry.titleNormalized.startsWith(normalizedQuery)) {
    score += 1350;
  } else if (entry.titleNormalized.includes(normalizedQuery)) {
    score += 1050;
  } else if (tokens.every((token) => entry.titleNormalized.includes(token))) {
    score += 780;
  }

  if (entry.sourceNormalized.includes(normalizedQuery)) {
    score += 260;
  }

  const matchedField = firstMatchField(entry, normalizedQuery, tokens);

  if (matchedField) {
    score += matchedField.weight;

    if (matchedField.normalized.includes(normalizedQuery)) {
      score += 180;
    }
  }

  tokens.forEach((token) => {
    if (searchable.some((value) => hasWholeToken(value, token))) {
      score += 260;
    }
  });

  score += Math.max(0, 80 - entry.title.length);

  return {
    score,
    matchedField,
  };
};

const buildSearchResult = (entry, query, normalizedQuery, tokens) => {
  const match = scoreEntry(entry, normalizedQuery, tokens);

  if (!match) {
    return null;
  }

  const matchedField = match.matchedField;
  const snippet =
    matchedField?.role === 'content' || matchedField?.role === 'description'
      ? makeSnippet(matchedField.text, query)
      : entry.preview
        ? makeSnippet(entry.preview, query)
        : '';

  return {
    ...entry,
    score: match.score,
    snippet,
    matchedLanguage: matchedField?.language || '',
    matchedLanguageLabel: languageLabel(matchedField?.language),
    groupLabel: GROUP_LABELS[entry.group] || '',
  };
};

const sortSearchResults = (matches, limit) => {
  matches.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title, 'ru'));

  return {
    items: matches.slice(0, limit),
    total: matches.length,
  };
};

export const searchIndex = (index, query, {group = SEARCH_GROUPS.ALL, limit = 100} = {}) => {
  const normalizedQuery = normalizeSearchText(query);

  if (normalizedQuery.length < 2) {
    return {
      items: [],
      total: 0,
    };
  }

  const tokens = getQueryTokens(normalizedQuery);

  if (!tokens.length) {
    return {
      items: [],
      total: 0,
    };
  }

  const matches = [];

  (index || []).forEach((entry) => {
    if (group !== SEARCH_GROUPS.ALL && entry.group !== group) {
      return;
    }

    const result = buildSearchResult(entry, query, normalizedQuery, tokens);

    if (result) {
      matches.push(result);
    }
  });

  return sortSearchResults(matches, limit);
};

const yieldToSearchUI = () => new Promise((resolve) => setTimeout(resolve, 0));

const getQueryTokens = (normalizedQuery) =>
  Array.from(
    new Set(
      String(normalizedQuery || '')
        .split(' ')
        .filter((token) => token.length >= 2)
    )
  );

const bibleCorpusKey = (bible) => String(bible?.content_version || bible?.generated_at || 'bible');

export const prepareBibleSearchCorpus = async ({
  chunkSize = 900,
  isCancelled = () => false,
} = {}) => {
  const bible = getCurrentBibleContent('rst') || {};
  const key = bibleCorpusKey(bible);

  if (cachedBibleCorpus && cachedBibleCorpusKey === key) {
    return cachedBibleCorpus;
  }

  if (pendingBibleCorpus?.key === key) {
    return pendingBibleCorpus.promise;
  }

  const promise = (async () => {
    const corpus = [];
    let processed = 0;

    for (const book of bible.books || []) {
      const displayName = bibleContent.getDisplayName(book);
      const sectionLabel = bibleSectionLabel(book.section);

      for (const chapter of book.chapters || []) {
        for (const verse of chapter.verses || []) {
          if (isCancelled()) {
            return null;
          }

          const text = clean(verse.text);
          const reference = `${displayName} ${chapter.number}:${verse.number}`;
          const shortReference = `${book.short_name || displayName} ${chapter.number}:${verse.number}`;

          corpus.push({
            id: `bible:${book.id}:${chapter.id}:${verse.id}`,
            bookId: Number(book.id),
            bookSlug: book.slug,
            chapterNumber: Number(chapter.number),
            verseId: Number(verse.id),
            verseNumber: Number(verse.number),
            title: reference,
            source: `Писание · ${sectionLabel}`,
            text,
            normalizedText: normalizeSearchText(text),
            normalizedReference: normalizeSearchText(reference),
            normalizedShortReference: normalizeSearchText(shortReference),
          });

          processed += 1;

          if (processed % chunkSize === 0) {
            await yieldToSearchUI();
          }
        }
      }
    }

    if (isCancelled()) {
      return null;
    }

    cachedBibleCorpus = corpus;
    cachedBibleCorpusKey = key;

    return corpus;
  })();

  pendingBibleCorpus = {
    key,
    promise,
  };

  try {
    return await promise;
  } finally {
    if (pendingBibleCorpus?.promise === promise) {
      pendingBibleCorpus = null;
    }
  }
};

export const warmSearchData = async () => {
  try {
    buildSearchIndex('ru');
    await prepareBibleSearchCorpus();
  } catch (error) {
    console.log('Фоновая подготовка поиска отложена:', error?.message || error);
  }
};

const searchBibleVersesAsync = async ({
  query,
  normalizedQuery,
  tokens,
  isCancelled,
  chunkSize = 1400,
  onProgress = () => {},
}) => {
  // Build the shared Bible corpus independently of individual queries.
  // Changing a tab or typing another letter must not discard all preparation.
  const corpus = await prepareBibleSearchCorpus();

  if (!corpus || isCancelled()) {
    return null;
  }

  const matches = [];

  for (let offset = 0; offset < corpus.length; offset += chunkSize) {
    if (isCancelled()) {
      return null;
    }

    const end = Math.min(corpus.length, offset + chunkSize);

    for (let itemIndex = offset; itemIndex < end; itemIndex += 1) {
      const item = corpus[itemIndex];
      const searchable = [
        item.normalizedReference,
        item.normalizedShortReference,
        item.normalizedText,
      ];

      if (!tokens.every((token) => searchable.some((value) => value.includes(token)))) {
        continue;
      }

      let score = 150;

      if (
        item.normalizedReference === normalizedQuery ||
        item.normalizedShortReference === normalizedQuery
      ) {
        score += 1800;
      } else if (
        item.normalizedReference.startsWith(normalizedQuery) ||
        item.normalizedShortReference.startsWith(normalizedQuery)
      ) {
        score += 1200;
      } else if (
        item.normalizedReference.includes(normalizedQuery) ||
        item.normalizedShortReference.includes(normalizedQuery)
      ) {
        score += 850;
      }

      if (item.normalizedText.includes(normalizedQuery)) {
        score += 260;
      }

      tokens.forEach((token) => {
        if (hasWholeToken(item.normalizedText, token)) {
          score += 260;
        } else if (item.normalizedText.includes(token)) {
          score += 90;
        }
      });

      matches.push({
        id: item.id,
        group: SEARCH_GROUPS.SCRIPTURE,
        kind: 'bible-verse',
        title: item.title,
        source: item.source,
        score,
        snippet: makeSnippet(item.text, query),
        matchedLanguage: 'russian',
        matchedLanguageLabel: languageLabel('russian'),
        groupLabel: GROUP_LABELS[SEARCH_GROUPS.SCRIPTURE] || '',
        route: {
          name: 'BibleChapter',
          params: {
            bookId: item.bookId,
            chapterNumber: item.chapterNumber,
            resume: false,
            focusTarget: {
              save_type: 'fragment',
              anchor_type: 'bible_verse',
              anchor_id: item.verseId,
              start_offset: null,
              end_offset: null,
              metadata: {
                book_id: item.bookId,
                book_slug: item.bookSlug,
                chapter_number: item.chapterNumber,
                verse_number: item.verseNumber,
              },
            },
          },
        },
      });
    }

    onProgress(matches.slice());
    if (end < corpus.length) {
      await yieldToSearchUI();
    }
  }

  return matches;
};

export const searchIndexAsync = async (
  index,
  query,
  {
    group = SEARCH_GROUPS.ALL,
    limit = 100,
    chunkSize = 650,
    isCancelled = () => false,
    onProgress = () => {},
  } = {}
) => {
  const normalizedQuery = normalizeSearchText(query);

  if (normalizedQuery.length < 2) {
    return {
      items: [],
      total: 0,
    };
  }

  const tokens = getQueryTokens(normalizedQuery);

  if (!tokens.length) {
    return {
      items: [],
      total: 0,
    };
  }

  const entries =
    group === SEARCH_GROUPS.ALL
      ? index || []
      : (index || []).filter((entry) => entry.group === group);
  const matches = [];

  for (let offset = 0; offset < entries.length; offset += chunkSize) {
    if (isCancelled()) {
      return null;
    }

    const end = Math.min(entries.length, offset + chunkSize);

    for (let entryIndex = offset; entryIndex < end; entryIndex += 1) {
      const result = buildSearchResult(entries[entryIndex], query, normalizedQuery, tokens);

      if (result) {
        matches.push(result);
      }
    }

    onProgress(sortSearchResults([...matches], limit));
    if (end < entries.length) {
      await yieldToSearchUI();
    }
  }

  if (isCancelled()) {
    return null;
  }

  if (group === SEARCH_GROUPS.ALL || group === SEARCH_GROUPS.SCRIPTURE) {
    const bibleMatches = await searchBibleVersesAsync({
      query,
      normalizedQuery,
      tokens,
      isCancelled,
      onProgress: (partialBible) =>
        onProgress(sortSearchResults([...matches, ...partialBible], limit)),
    });

    if (bibleMatches === null || isCancelled()) {
      return null;
    }

    matches.push(...bibleMatches);
  }

  await yieldToSearchUI();

  if (isCancelled()) {
    return null;
  }

  return sortSearchResults(matches, limit);
};

export const getSearchSuggestions = (index, query, {group = SEARCH_GROUPS.ALL, limit = 6} = {}) => {
  const normalizedQuery = normalizeSearchText(query);

  if (normalizedQuery.length < 2) {
    return [];
  }

  const seen = new Set();
  const suggestions = [];

  (index || []).forEach((entry) => {
    if (
      !entry.titleNormalized ||
      (group !== SEARCH_GROUPS.ALL && entry.group !== group) ||
      !entry.titleNormalized.includes(normalizedQuery)
    ) {
      return;
    }

    const key = entry.titleNormalized;

    if (seen.has(key)) {
      return;
    }

    seen.add(key);
    suggestions.push({
      title: entry.title,
      position: entry.titleNormalized.indexOf(normalizedQuery),
      starts: entry.titleNormalized.startsWith(normalizedQuery),
    });
  });

  return suggestions
    .sort(
      (a, b) =>
        Number(b.starts) - Number(a.starts) ||
        a.position - b.position ||
        a.title.length - b.title.length
    )
    .slice(0, limit)
    .map((item) => item.title);
};

export const getHighlightSegments = (text, query) => {
  const source = String(text || '');
  const normalizedQuery = normalizeSearchText(query);
  const tokens = Array.from(
    new Set(normalizedQuery.split(' ').filter((token) => token.length >= 2))
  );

  if (!source || !tokens.length) {
    return [{text: source, highlighted: false}];
  }

  const folded = foldWithMap(source);
  const ranges = [];

  tokens.forEach((token) => {
    let offset = 0;

    while (offset < folded.value.length) {
      const found = folded.value.indexOf(token, offset);

      if (found < 0) {
        break;
      }

      const start = folded.map[found];
      const mappedEnd = folded.map[Math.min(folded.map.length - 1, found + token.length - 1)];
      let end = Math.min(source.length, Number(mappedEnd ?? start) + 1);

      while (end < source.length && COMBINING_MARK.test(source[end])) {
        end += 1;
      }

      if (Number.isFinite(start) && end > start) {
        ranges.push({start, end});
      }

      offset = found + Math.max(1, token.length);
    }
  });

  if (!ranges.length) {
    return [{text: source, highlighted: false}];
  }

  ranges.sort((a, b) => a.start - b.start || a.end - b.end);

  const merged = [];

  ranges.forEach((range) => {
    const previous = merged[merged.length - 1];

    if (previous && range.start <= previous.end) {
      previous.end = Math.max(previous.end, range.end);
    } else {
      merged.push({...range});
    }
  });

  const segments = [];
  let cursor = 0;

  merged.forEach((range) => {
    if (range.start > cursor) {
      segments.push({
        text: source.slice(cursor, range.start),
        highlighted: false,
      });
    }

    segments.push({
      text: source.slice(range.start, range.end),
      highlighted: true,
    });

    cursor = range.end;
  });

  if (cursor < source.length) {
    segments.push({
      text: source.slice(cursor),
      highlighted: false,
    });
  }

  return segments;
};

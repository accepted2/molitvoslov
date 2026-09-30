const bundledContent = require('../data/offlineContent.json');

const normalizeSearchText = (value) =>
  String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f\u0483-\u0489]/g, '')
    .replace(/[\u00AD\u2011]/g, '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^0-9a-zа-яіїєґ\s]+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const preview = (value, limit = 130) => {
  const clean = String(value || '')
    .replace(/\s+/g, ' ')
    .trim();

  if (clean.length <= limit) {
    return clean;
  }

  return clean.slice(0, limit - 1).trimEnd() + '…';
};

const textTitle = (item) => {
  const explicit = String(item?.title || item?.description || '').trim();
  if (explicit) {
    return explicit;
  }

  const source = String(item?.translation || item?.content || '').trim();
  const firstLine = source.split(/\r?\n/).find((line) => line.trim()) || '';

  return preview(firstLine, 72) || 'Молитва';
};

const categoryNames = (item) =>
  (item?.categories || [])
    .map((category) => String(category?.name || '').trim())
    .filter(Boolean);

const composeFullText = (item) => {
  const church = String(item?.content || '').trim();
  const russian = String(item?.translation || '').trim();

  if (church && russian && normalizeSearchText(church) !== normalizeSearchText(russian)) {
    return church + '\n\nРусский перевод\n' + russian;
  }

  return church || russian;
};

const buildTextEntries = () =>
  Object.values(bundledContent?.texts || {})
    .filter((item) => item && (item.content || item.translation))
    .map((item) => {
      const title = textTitle(item);
      const categories = categoryNames(item);
      const content = String(item.content || '');
      const translation = String(item.translation || '');
      const description = String(item.description || '');
      const fullText = composeFullText(item);

      return {
        key: 'library:' + String(item.id ?? item.slug ?? title),
        kind: 'library',
        id: item.id ?? null,
        slug: item.slug || '',
        title,
        subtitle: categories.length
          ? 'Библиотека · ' + categories.slice(0, 2).join(' · ')
          : 'Библиотека молитв',
        preview: preview(translation || content || description),
        text: fullText,
        origin_data: {
          text_id: item.id ?? null,
          slug: item.slug || '',
          language: item.language || '',
          category_slugs: (item.categories || [])
            .map((category) => category?.slug)
            .filter(Boolean),
        },
        search: {
          title: normalizeSearchText(title),
          description: normalizeSearchText(description),
          categories: normalizeSearchText(categories.join(' ')),
          content: normalizeSearchText(content),
          translation: normalizeSearchText(translation),
        },
      };
    });

const buildPsalmEntries = () => {
  const seen = new Set();
  const entries = [];

  Object.values(bundledContent?.kathismas?.by_number || {}).forEach((kathisma) => {
    (kathisma?.psalms || []).forEach((psalm) => {
      const psalmId = Number(psalm?.id || 0);

      if (!psalmId || seen.has(psalmId)) {
        return;
      }

      seen.add(psalmId);

      const church = (psalm.verses || [])
        .map((verse) => {
          const value = String(verse?.church_slavonic || '').trim();
          return value ? `${verse.number}. ${value}` : '';
        })
        .filter(Boolean)
        .join('\n');

      const russian = (psalm.verses || [])
        .map((verse) => {
          const value = String(verse?.russian || '').trim();
          return value ? `${verse.number}. ${value}` : '';
        })
        .filter(Boolean)
        .join('\n');

      if (!church && !russian) {
        return;
      }

      const title = `Псалом ${psalm.number}`;
      const subtitle = `Псалтирь · Кафизма ${kathisma.number}`;
      const description = [
        psalm.title_russian,
        psalm.title_church_slavonic,
        psalm.description,
      ]
        .filter(Boolean)
        .join(' ');

      entries.push({
        key: 'psalm:' + psalmId,
        kind: 'library',
        id: psalmId,
        slug: '',
        title,
        subtitle,
        preview: preview(russian || church || description),
        text:
          church && russian
            ? church + '\n\nРусский перевод\n' + russian
            : church || russian,
        origin_data: {
          source_type: 'psalter',
          psalm_id: psalmId,
          psalm_number: Number(psalm.number),
          kathisma_number: Number(kathisma.number),
        },
        search: {
          title: normalizeSearchText(
            [title, psalm.title_russian, psalm.title_church_slavonic]
              .filter(Boolean)
              .join(' ')
          ),
          description: normalizeSearchText(description),
          categories: normalizeSearchText('Псалтирь Кафизма ' + kathisma.number),
          content: normalizeSearchText(church),
          translation: normalizeSearchText(russian),
        },
      });
    });
  });

  return entries;
};

const buildIndex = () => [
  ...buildTextEntries(),
  ...buildPsalmEntries(),
];

let cachedIndex = null;

const getIndex = () => {
  if (!cachedIndex) {
    cachedIndex = buildIndex();
  }
  return cachedIndex;
};

const scoreResult = (entry, tokens, normalizedQuery) => {
  const fields = entry.search;
  const haystack = [
    fields.title,
    fields.description,
    fields.categories,
    fields.content,
    fields.translation,
  ].join(' ');

  if (!tokens.every((token) => haystack.includes(token))) {
    return -1;
  }

  let score = 0;

  if (fields.title === normalizedQuery) {
    score += 140;
  } else if (fields.title.startsWith(normalizedQuery)) {
    score += 105;
  } else if (fields.title.includes(normalizedQuery)) {
    score += 80;
  }

  tokens.forEach((token) => {
    if (fields.title.includes(token)) score += 24;
    if (fields.categories.includes(token)) score += 14;
    if (fields.description.includes(token)) score += 10;
    if (fields.translation.includes(token)) score += 5;
    if (fields.content.includes(token)) score += 4;
  });

  if (entry.title.length < 80) {
    score += 3;
  }

  return score;
};

export const searchBuiltInPrayers = (query, {limit = 40} = {}) => {
  const normalizedQuery = normalizeSearchText(query);

  if (normalizedQuery.length < 2) {
    return [];
  }

  const tokens = normalizedQuery.split(' ').filter(Boolean);

  return getIndex()
    .map((entry) => ({
      entry,
      score: scoreResult(entry, tokens, normalizedQuery),
    }))
    .filter((item) => item.score >= 0)
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }
      return left.entry.title.localeCompare(right.entry.title, 'ru');
    })
    .slice(0, limit)
    .map((item) => item.entry);
};

export const searchPersonalPrayerRows = (prayers, query, {limit = 20} = {}) => {
  const normalizedQuery = normalizeSearchText(query);

  if (normalizedQuery.length < 2) {
    return [];
  }

  const tokens = normalizedQuery.split(' ').filter(Boolean);

  return (prayers || [])
    .map((prayer) => {
      const title = String(prayer?.title || 'Моя молитва');
      const text = String(prayer?.text || '');
      const normalizedTitle = normalizeSearchText(title);
      const normalizedText = normalizeSearchText(text);
      const haystack = normalizedTitle + ' ' + normalizedText;

      if (!tokens.every((token) => haystack.includes(token))) {
        return null;
      }

      let score = 30;

      if (normalizedTitle === normalizedQuery) score += 100;
      else if (normalizedTitle.startsWith(normalizedQuery)) score += 75;
      else if (normalizedTitle.includes(normalizedQuery)) score += 55;

      tokens.forEach((token) => {
        if (normalizedTitle.includes(token)) score += 18;
        if (normalizedText.includes(token)) score += 4;
      });

      return {
        score,
        entry: {
          key: 'personal:' + prayer.sync_id,
          kind: 'personal',
          prayer,
          title,
          subtitle: 'Моя молитва',
          preview: preview(text || (prayer.photos?.length ? 'Молитва с фото' : '')),
          text,
        },
      };
    })
    .filter(Boolean)
    .sort((left, right) => right.score - left.score)
    .slice(0, limit)
    .map((item) => item.entry);
};

export const searchAllPrayers = (prayers, query) => [
  ...searchPersonalPrayerRows(prayers, query),
  ...searchBuiltInPrayers(query),
];

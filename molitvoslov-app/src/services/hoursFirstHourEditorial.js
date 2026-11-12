import editedFirstHour from '../data/hoursFirstHourEditorial.json';

const clean = (value) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300\u0301\u0340\u0341\u0483-\u0489]/g, '')
    .normalize('NFC')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase('ru');

const identifyPsalm = (section) => {
  const title = clean(section?.title);
  const candidate = title || clean(section?.rows?.[0]?.church || '');
  const match = /^(?:псалом|псалм|ѱалом)(?:ъ)?[ .:№]*([0-9]{1,3})(?![0-9])/u.exec(candidate);
  return match ? Number(match[1]) : null;
};

export const getEditedFirstHour = (content) => {
  const original = content?.sections;
  if (!Array.isArray(original) || !original.length) {
    return {applied: false, reason: 'No imported First Hour sections'};
  }

  // The imported Psalms must be identifiable in the actual local edition:
  // never replace or guess Psalms from a different hour.
  const psalms = [5, 89, 100];
  const indexes = psalms.map(number => original.findIndex(section =>
    identifyPsalm(section) === number));
  const distinctAndOrdered = indexes.every(i => i >= 0) &&
    indexes[0] < indexes[1] && indexes[1] < indexes[2];

  if (!distinctAndOrdered) {
    return {
      applied: false,
      reason: 'Psalms 5, 89, 100 not found in the expected sequence',
      detected: original.map((section, i) => ({
        index: i, title: section?.title || '', psalm: identifyPsalm(section),
      })),
    };
  }

  const [firstIndex, , lastIndex] = indexes;
  // Preserve existing Scripture and its paired Russian translation exactly.
  const psalmSections = original.slice(firstIndex, lastIndex + 1);
  const before = original.slice(0, firstIndex);
  const after = original.slice(lastIndex + 1);

  const churchSections = [
    {...editedFirstHour.opening, rows: editedFirstHour.opening.rows.map(row => ({...row}))},
    ...psalmSections,
    ...editedFirstHour.afterPsalms.map(section => ({
      ...section,
      rows: section.rows.map(row => ({...row})),
    })),
  ];

  // A translation was not supplied for the revised prayers. Keep all
  // imported Russian paragraphs intact, but show them separately in
  // ЦС+РУС rather than incorrectly pairing unrelated sentences.
  const russianUnpaired = [...before, ...after]
    .map(section => ({
      title: section.title || '',
      kind: section.kind || '',
      rows: (section.rows || [])
        .filter(row => typeof row.russian === 'string' && row.russian.trim())
        .map(row => ({russian: row.russian})),
    }))
    .filter(section => section.rows.length);

  return {
    applied: true,
    sections: churchSections,
    russianUnpaired,
    preservedPsalms: psalms,
  };
};

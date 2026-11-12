// Fixed identifiers and ordering for the Hours library.
// Liturgical variants are not interchangeable and are not assembled from
// made-up text. The corresponding offline text is stored in hoursTexts.json.
const HOURS = [
  {number: 1, title: 'Первый час', psalms: 'Пс. 5, 89, 100'},
  {number: 3, title: 'Третий час', psalms: 'Пс. 16, 24, 50'},
  {number: 6, title: 'Шестой час', psalms: 'Пс. 53, 54, 90'},
  {number: 9, title: 'Девятый час', psalms: 'Пс. 83, 84, 85'},
];
const hourEntries = (groupId, {showPsalms = false} = {}) =>
  HOURS.map((hour) => ({
    id: groupId + '-' + hour.number,
    number: hour.number,
    title: hour.title,
    subtitle: showPsalms ? hour.psalms : '',
  }));

export const HOURS_GROUPS = [
  {
    id: 'ordinary',
    title: 'Вседневные часы',
    description: 'Обычное последование первого, третьего, шестого и девятого часов.',
    items: hourEntries('ordinary', {showPsalms: true}),
  },
  {
    id: 'lenten',
    title: 'Великопостные часы',
    description: 'Часы Великого поста: тропари, поклоны, кафизмы и уставные чтения.',
    items: hourEntries('lenten'),
  },
  {
    id: 'royal-nativity',
    title: 'Царские часы — Рождество',
    description: 'Часы навечерия Рождества Христова.',
    items: hourEntries('royal-nativity'),
  },
  {
    id: 'royal-theophany',
    title: 'Царские часы — Богоявление',
    description: 'Часы навечерия Богоявления.',
    items: hourEntries('royal-theophany'),
  },
  {
    id: 'royal-friday',
    title: 'Царские часы — Великая Пятница',
    description: 'Особые часы воспоминания Страстей Христовых.',
    items: hourEntries('royal-friday'),
  },
  {
    id: 'paschal',
    title: 'Пасхальные часы',
    description: 'Единое краткое последование Светлой седмицы.',
    items: [
      {id: 'paschal-hours', title: 'Последование Пасхальных часов', subtitle: ''},
    ],
  },
  {
    id: 'interhours',
    title: 'Междочасия',
    description: 'Дополнительные последования после соответствующих часов.',
    items: HOURS.map(({number}) => ({
      id: 'interhour-' + number,
      title: 'Междочасие ' +
        ({1: 'первого', 3: 'третьего', 6: 'шестого', 9: 'девятого'}[number]) +
        ' часа',
      subtitle: '',
    })),
  },
];

export const HOURS_ENTRIES = HOURS_GROUPS.flatMap((group) =>
  group.items.map((item) => ({...item, groupId: group.id, groupTitle: group.title}))
);
export const getHoursEntry = (id) => HOURS_ENTRIES.find((entry) => entry.id === id) || null;

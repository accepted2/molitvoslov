// Orthodox Hours (Часы): fixed liturgical categories, with checked source URLs.
// Full service texts are shown from their sources online. Do not claim
// an offline or daily-variable text exists until it has been imported and reviewed.
const HOURS = [
  {number: 1, title: 'Первый час', psalms: 'Пс. 5, 89, 100'},
  {number: 3, title: 'Третий час', psalms: 'Пс. 16, 24, 50'},
  {number: 6, title: 'Шестой час', psalms: 'Пс. 53, 54, 90'},
  {number: 9, title: 'Девятый час', psalms: 'Пс. 83, 84, 85'},
];

const makeHours = (prefix, url, source, options = {}) =>
  HOURS.map(({number, title, psalms}) => ({
    id: prefix + '-' + number,
    title,
    subtitle: options.showPsalms ? psalms : options.subtitle || '',
    source,
    sourceUrl: Array.isArray(url) ? url[HOURS.findIndex((item) => item.number === number)] : url,
    focusHeading: Array.isArray(url) ? null : title,
    sourceNote: options.sourceNote || null,
  }));

const ordinaryUrls = [
  'https://azbyka.ru/bogosluzhenie/chas-pervyj/',
  'https://azbyka.ru/bogosluzhenie/chas-tretij/',
  'https://azbyka.ru/bogosluzhenie/chas-shestoj/',
  'https://azbyka.ru/bogosluzhenie/chas-devyatyj/',
];

const interhourUrls = [
  'https://azbyka.ru/bogosluzhenie/mezhdochasie-pervogo-chasa/',
  'https://azbyka.ru/bogosluzhenie/mezhdochasie-tretego-chasa/',
  'https://azbyka.ru/bogosluzhenie/mezhdochasie-shestogo-chasa/',
  'https://azbyka.ru/bogosluzhenie/cu/mezhdochasie-devyatogo-chasa/',
];

export const HOURS_GROUPS = [
  {
    id: 'ordinary',
    title: 'Вседневные часы',
    description: 'Обычный порядок суточного богослужения.',
    items: makeHours('ordinary', ordinaryUrls, 'Часослов — Азбука веры', {showPsalms: true}),
  },
  {
    id: 'lenten',
    title: 'Великопостные часы',
    description: 'Особый чин в седмичные дни Великого поста: кафизмы, постовые тропари, поклоны; на шестом часе — паримия.',
    items: makeHours(
      'lenten',
      'https://azbyka.ru/otechnik/Pravoslavnoe_Bogosluzhenie/pravoslavnyj-molitvoslov-na-dni-velikogo-posta/3',
      'Православный молитвослов на дни Великого поста — Азбука веры',
      {sourceNote: 'Источник содержит общее последование. Состав изменяемых частей зависит от дня.'}
    ),
  },
  {
    id: 'royal-nativity',
    title: 'Царские часы — Рождество',
    description: 'Навечерие Рождества Христова. Первый, третий, шестой и девятый часы совершаются вместе.',
    items: makeHours(
      'royal-nativity',
      'https://azbyka.ru/otechnik/Pravoslavnoe_Bogosluzhenie/mineja-dekabr/24_2',
      'Минея. Декабрь, 24-й день — Азбука веры',
      {sourceNote: 'Все четыре часа находятся внутри одного последования.'}
    ),
  },
  {
    id: 'royal-theophany',
    title: 'Царские часы — Богоявление',
    description: 'Навечерие Богоявления (Крещения Господня).',
    items: makeHours(
      'royal-theophany',
      'https://azbyka.ru/otechnik/Pravoslavnoe_Bogosluzhenie/mineja-janvar/5_4',
      'Минея. Январь, 5-й день — Азбука веры',
      {sourceNote: 'Все четыре часа находятся внутри одного последования.'}
    ),
  },
  {
    id: 'royal-friday',
    title: 'Царские часы — Великая Пятница',
    description: 'Особое последование воспоминания Страстей Господних.',
    items: makeHours(
      'royal-friday',
      'https://azbyka.ru/otechnik/Pravoslavnoe_Bogosluzhenie/posledovanie-tsarskih-chasov-svjatago-i-velikago-pjatka/',
      'Последование царских часов Великого Пятка — Азбука веры',
      {sourceNote: 'Все четыре часа находятся внутри одного последования.'}
    ),
  },
  {
    id: 'paschal',
    title: 'Пасхальные часы',
    description: 'Единое краткое последование без псалмов, совершаемое на Светлой седмице.',
    items: [{
      id: 'paschal-hours',
      title: 'Последование Пасхальных часов',
      subtitle: 'Одно последование вместо обычных часов',
      source: 'Часы Святой Пасхи — Азбука веры',
      sourceUrl: 'https://azbyka.ru/chasy-pasxalnye',
      focusHeading: 'Текст Часов Пасхи',
    }],
  },
  {
    id: 'interhours',
    title: 'Междочасия',
    description: 'Дополнительные последования после соответствующих часов, преимущественно в монастырском богослужении.',
    items: HOURS.map(({number, title}, index) => ({
      id: 'interhour-' + number,
      title: 'Междочасие ' + ({1: 'первого', 3: 'третьего', 6: 'шестого', 9: 'девятого'}[number]) + ' часа',
      subtitle: number === 9 ? 'Церковнославянский источник' : '',
      source: 'Часослов — Азбука веры',
      sourceUrl: interhourUrls[index],
      focusHeading: null,
    })),
  },
];

export const HOURS_ENTRIES = HOURS_GROUPS.flatMap((group) =>
  group.items.map((item) => ({...item, groupId: group.id, groupTitle: group.title}))
);
export const getHoursEntry = (id) => HOURS_ENTRIES.find((entry) => entry.id === id) || null;

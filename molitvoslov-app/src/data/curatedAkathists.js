const CURATED_AKATHISTS = [
  {
    title: 'Акафист святителю Николаю Чудотворцу',
    slugs: [
      'akafist-svyatitelyu-nikolayu',
      'akafist-svjatitelju-nikolaju-chudotvorcu',
    ],
  },
  {
    title: 'Акафист Пресвятой Богородице пред иконой «Всецарица»',
    slugs: [
      'akafist-presvyatoy-bogorodice-pred-ikonoy-vsecarica',
      'akafist-presvjatoj-bogorodice-pred-ikonoj-vsecarica',
    ],
  },
  {
    title: 'Акафист святителю Спиридону Тримифунтскому, чудотворцу',
    slugs: [
      'akafist-svyatitelyu-spiridonu-trimifuntskomu',
      'akafist-svjatitelju-spiridonu-trimifuntskomu-chudotvorcu',
    ],
  },
  {
    title: 'Акафист святому великомученику и целителю Пантелеимону',
    slugs: [
      'akafist-svyatomu-velikomucheniku-i-celitelyu-panteleimonu',
      'akafist-svjatomu-velikomucheniku-i-celitelju-panteleimonu',
    ],
  },
  {
    title: 'Акафист Пресвятой Богородице (Великий акафист)',
    slugs: [
      'velikiy-akafist-presvyatoy-bogorodice',
      'akafist-presvjatoj-bogorodice-velikij-akafist-chitaemyj-v-subbotu-akafista',
    ],
  },
  {
    title: 'Акафист Иисусу Сладчайшему',
    slugs: [
      'akafist-iisusu-sladchajshemu',
    ],
  },
  {
    title: 'Акафист Рождеству Пресвятой Богородицы',
    slugs: [
      'akafist-rozhdestvu-presvjatoj-bogorodicy',
      'akafist-rozhdestvu-presvyatoy-bogorodicy',
    ],
  },
  {
    title: 'Акафист архангелу Божию Михаилу',
    slugs: [
      'akafist-arhangelu-bozhiju-mihailu',
      'akafist-arhangelu-bozhiyu-mihailu',
    ],
  },
  {
    title: 'Акафист Благовещению Пресвятой Богородицы',
    slugs: [
      'akafist-blagoveshheniju-presvjatoj-bogorodicy',
      'akafist-blagoveshcheniyu-presvyatoy-bogorodicy',
    ],
  },
  {
    title: 'Акафист Богоявлению Господню',
    slugs: [
      'akafist-bogojavleniju-gospodnju',
      'akafist-bogoyavleniyu-gospodnyu',
    ],
  },
  {
    title: 'Акафист Божественным Страстям Христовым',
    slugs: [
      'akafist-bozhestvennym-strastjam-hristovym',
    ],
  },
  {
    title: 'Акафист Честному и Животворящему Кресту Господню',
    slugs: [
      'akafist-chestnomu-i-zhivotvorjashhemu-krestu-gospodnju',
    ],
  },
  {
    title: 'Акафист Честному и Животворящему Кресту Господню (2-й)',
    slugs: [
      'akafist-chestnomu-i-zhivotvorjashhemu-krestu-gospodnju-2-j',
    ],
  },
  {
    title: 'Акафист Честному и Животворящему Кресту Господню (3-й)',
    slugs: [
      'akafist-chestnomu-i-zhivotvorjashhemu-krestu-gospodnju-3-j',
    ],
  },
  {
    title: 'Акафист мученицам Вере, Надежде, Любови и матери их Софии',
    slugs: [
      'akafist-muchenicam-vere-nadezhde-ljubovi-i-materi-ih-sofii',
    ],
  },
];


const normalizeTitle = value =>
  String(value || '')
    .trim()
    .toLocaleLowerCase('ru-RU')
    .replace(/ё/g, 'е')
    .replace(/[^0-9a-zа-я]+/giu, ' ')
    .replace(/\s+/g, ' ')
    .trim();


const curatedTitles =
  new Set(
    CURATED_AKATHISTS.map(
      item =>
        normalizeTitle(
          item.title
        )
    )
  );


const curatedSlugs =
  new Set(
    CURATED_AKATHISTS.flatMap(
      item =>
        item.slugs
    )
  );


export const isCuratedAkathist =
  item => {
    if (!item) {
      return false;
    }

    if (
      curatedSlugs.has(
        String(
          item.slug ||
          ''
        )
      )
    ) {
      return true;
    }

    return curatedTitles.has(
      normalizeTitle(
        item.title
      )
    );
  };

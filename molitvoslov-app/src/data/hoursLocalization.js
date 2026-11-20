import {formatBibleNumber} from '../services/bibleUi';
import {getHoursEntry, HOURS_GROUPS} from './hoursCatalog';

// UI translations never alter Hours IDs or liturgical source text.
const HOURS_NAMES = {
  ru: {1:'Первый час',3:'Третий час',6:'Шестой час',9:'Девятый час'},
  uk: {1:'Перший час',3:'Третій час',6:'Шостий час',9:"Дев’ятий час"},
  csl_traditional: {
    1:'Ча́съ пе́рвый',3:'Ча́съ тре́тїй',6:'Ча́съ ше́стый',9:'Ча́съ девѧ́тый',
  },
};
const INTERHOURS = {
  ru:{1:'Междочасие первого часа',3:'Междочасие третьего часа',6:'Междочасие шестого часа',9:'Междочасие девятого часа'},
  uk:{1:'Міжчасся першого часу',3:'Міжчасся третього часу',6:'Міжчасся шостого часу',9:"Міжчасся дев’ятого часу"},
  csl_traditional:{
    1:'Междоча́сїе пе́рвагѡ ча́са',
    3:'Междоча́сїе тре́тїѧгѡ ча́са',
    6:'Междоча́сїе ше́стагѡ ча́са',
    9:'Междоча́сїе девѧ́тагѡ ча́са',
  },
};
const GROUP_TEXT = {
  uk:{
    ordinary:['Повсякденні часи','Звичайне послідування першого, третього, шостого й дев’ятого часів.'],
    lenten:['Великопісні часи','Часи Великого посту: тропарі, поклони, кафизми та уставні читання.'],
    'royal-nativity':['Царські часи — Різдво','Часи навечір’я Різдва Христового.'],
    'royal-theophany':['Царські часи — Богоявлення','Часи навечір’я Богоявлення.'],
    'royal-friday':['Царські часи — Велика п’ятниця','Особливі часи на згадку про Страсті Христові.'],
    paschal:['Пасхальні часи','Єдине коротке послідування Світлого тижня.'],
    interhours:['Міжчасся','Додаткові послідування після відповідних часів.'],
  },
  csl_traditional:{
    ordinary:['Часы̀ вседне́вныѧ','О҆бы́чное послѣдова́нїе ча́совъ: пе́рвагѡ, тре́тїѧгѡ, ше́стагѡ и҆ девѧ́тагѡ.'],
    lenten:['Часы̀ великопо́стныѧ','Часы̀ великї́ѧ Четыреде́сѧтницы: тропарѝ, покло́ны, каѳі́смы и҆ чте́нїѧ по ᲂу҆ста́вꙋ.'],
    'royal-nativity':['Ца́рскїѧ часы̀ — Ржⷭ҇тво̀ Хрⷭ҇то́во','Часы̀ навече́рїѧ Ржⷭ҇тва̀ Хрⷭ҇то́ва.'],
    'royal-theophany':['Ца́рскїѧ часы̀ — Бг҃оѧвле́нїе','Часы̀ навече́рїѧ ст҃а́гѡ Бг҃оѧвле́нїѧ.'],
    'royal-friday':['Ца́рскїѧ часы̀ — Вели́кїй пѧто́къ','Часы̀ въ воспомина́нїе ст҃ы́хъ страсте́й Хрⷭ҇то́выхъ.'],
    paschal:['Часы̀ ст҃ы́ѧ Па́схи','Кра́ткое послѣдова́нїе Свѣ́тлыѧ седми́цы.'],
    interhours:['Междоча́сїѧ','И҆ны́ѧ послѣдова́нїѧ, чита́емыѧ по ча́сѣхъ.'],
  },
};
const PASCHAL = {
  ru:'Последование Пасхальных часов',
  uk:'Послідування Пасхальних часів',
  csl_traditional:'Послѣдова́нїе ча́совъ ст҃ы́ѧ Па́схи',
};
const PSALMS = {
  1:[5,89,100],3:[16,24,50],6:[53,54,90],9:[83,84,85],
};
const localLanguage = language =>
  (language === 'uk' || language === 'csl_traditional') ? language : 'ru';

export const getLocalizedHoursEntry = (entry, language) => {
  if (!entry) return null;
  const locale = localLanguage(language);
  const number = Number(entry.number ||
    String(entry.id).match(/(?:^|-)\\d+$/)?.[0]?.slice(1));
  const title = entry.id === 'paschal-hours' ? PASCHAL[locale]
    : entry.id.startsWith('interhour-') ? INTERHOURS[locale][number]
      : HOURS_NAMES[locale][number];
  let subtitle = entry.subtitle || '';
  if (entry.id.startsWith('ordinary-') && PSALMS[number]) {
    if (locale === 'uk') subtitle = 'Пс. ' + PSALMS[number].join(', ');
    if (locale === 'csl_traditional') subtitle = 'Ѱал. ' +
      PSALMS[number].map(n=>formatBibleNumber('csl_traditional', n)).join(', ');
  }
  return {...entry, title: title || entry.title, subtitle};
};

export const getLocalizedHoursGroups = language => {
  const locale = localLanguage(language);
  return HOURS_GROUPS.map(group => {
    const translation = GROUP_TEXT[locale]?.[group.id];
    return {
      ...group,
      title: translation?.[0] || group.title,
      description: translation?.[1] || group.description,
      items: group.items.map(item => getLocalizedHoursEntry(item, locale)),
    };
  });
};

export const lookupLocalizedHoursEntry = (id, language) =>
  getLocalizedHoursEntry(getHoursEntry(id), language);

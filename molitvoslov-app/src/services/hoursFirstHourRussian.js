import russianEdition from '../data/hoursFirstHourRussian.json';

// The complete Russian First Hour and the edited Church Slavonic are independent.
// Preserve both texts, and never pair unrelated prayers by numeric row index.
const cloneSection = section => ({...section, rows:(section.rows || []).map(r=>({...r}))});
export const getFirstHourRussianSections = () => [
  cloneSection(russianEdition.opening),
  ...russianEdition.psalms.map(cloneSection),
  ...russianEdition.afterPsalms.map(cloneSection),
];

const onlyChurch = row => {
  const {russian, ...source} = row;
  return {...source};
};
const onlyRussian = row => {
  const {church, ...source} = row;
  return {...source};
};
// Responses and explanatory rubrics are shared across the parallel reader.
// Do not print translations twice merely to fill two equal-width columns.
const isShared = row => {
  if (['comment','placeholder'].includes(row?.presentation)) return true;
  const clean = String(row?.church || '').normalize('NFD')
    .replace(/[\u0300\u0301\u0340\u0341\u0483-\u0489]/gu, '')
    .normalize('NFC').trim().toLowerCase();
  return /^(?:аллилу|господи,?\s+помилуй)/u.test(clean);
};
const shared = row => ({...onlyChurch(row), sharedOnce:true});
const pair = (cs, ru) => {
  if (!ru?.russian?.trim() || isShared(cs)) return shared(cs);
  return {
    ...onlyChurch(cs),
    russian:ru.russian,
    russianPresentation:ru.presentation || '',
    russianAccentPrefix:ru.accentPrefix || '',
    russianRedInitial:ru.redInitial === true,
    russianPreserveLineBreaks:ru.preserveLineBreaks === true,
    dividerAfter:cs.dividerAfter === true || ru.dividerAfter === true,
    compactAfter:cs.compactAfter === true || ru.compactAfter === true,
  };
};
const fullRussian = rows => rows.map(onlyRussian);
const addLentenDialogue = (cs, ru) => {
  if (cs.rows?.length !== 5 || ru.rows?.length !== 8 ||
      cs.accordionId !== 'first-hour-lent-tropar') return null;
  // The Russian edition spells out the priest/reader responses where CS has
  // one shorthand "Слава, и ныне:". Keep the entire dialogue together.
  const reply = {russian:ru.rows.slice(3,7).map(r=>r.russian).join('\n'),
    preserveLineBreaks:true};
  return [
    pair(cs.rows[0],ru.rows[0]),
    pair(cs.rows[1],ru.rows[1]),
    pair(cs.rows[2],ru.rows[2]),
    {...pair(cs.rows[3],reply),russianPreserveLineBreaks:true},
    pair(cs.rows[4],ru.rows[7]),
  ];
};
const addTrisagionRubric = (cs,ru) => {
  if (cs.rows?.length !== 3 || ru.rows?.length !== 9) return null;
  return [
    shared(cs.rows[0]),
    ...fullRussian(ru.rows.slice(0,7)), // Only RU has the prayer texts.
    shared(cs.rows[1]),                 // Kondak placeholder: one copy.
    shared(cs.rows[2]),
    ...fullRussian(ru.rows.slice(8)),   // Distinct instruction, not a translation.
  ];
};
const addDismissal = (cs,ru) => {
  if (cs.rows?.length !== 7 || ru.rows?.length !== 18) return null;
  return [
    shared(cs.rows[0]), ...fullRussian(ru.rows.slice(0,8)),
    shared(cs.rows[1]), ...fullRussian(ru.rows.slice(9,10)),
    pair(cs.rows[2],ru.rows[10]),
    ...fullRussian(ru.rows.slice(11,14)), // RU additional kondak and prayer.
    pair(cs.rows[3],ru.rows[14]),
    shared(cs.rows[4]), pair(cs.rows[5],ru.rows[16]),
    shared(cs.rows[6]),
  ];
};
const psalmNumber = title => {
  const m=/(?:псалом|псалм|ѱалом)(?:ъ)?\s*(\d+)/iu.exec(String(title||''));
  return m ? Number(m[1]) : null;
};
const combinePsalm = (cs,ru) => {
  const n=psalmNumber(cs.title);
  if (!n || n !== psalmNumber(ru.title)) return null;
  const church=cs.rows.map(r=>r.church).filter(Boolean).join('\n');
  const russian=ru.rows.map(r=>r.russian).filter(Boolean).join('\n');
  if (!church || !russian) return null;
  return [{...onlyChurch(cs.rows[0]),church,russian,
    preserveLineBreaks:true,russianPreserveLineBreaks:true}];
};

// The five collapsible groups retain their original IDs; all aligned rows
// remain inside the same disclosure element, and unique RU passages survive.
export const pairFirstHourSections = ({churchSections,russianSections}) => {
  if (!Array.isArray(churchSections)||!Array.isArray(russianSections)||
      churchSections.length!==russianSections.length) return null;
  const afterStart=churchSections.length-12;
  return churchSections.map((cs,index)=>{
    const ru=russianSections[index];
    if (!cs||!ru||(cs.kind&&ru.kind&&cs.kind!==ru.kind)||
        (cs.accordionId||null)!==(ru.accordionId||null)) return null;
    const relative=index-afterStart;
    let explicit=null;
    if(relative===3)explicit=addLentenDialogue(cs,ru);
    if(relative===5)explicit=addTrisagionRubric(cs,ru);
    if(relative===11)explicit=addDismissal(cs,ru);
    let rows=explicit;
    if(!rows && cs.rows?.length===ru.rows?.length)
      rows=cs.rows.map((r,i)=>pair(r,ru.rows[i]));
    if(!rows&&relative>=-3&&relative<0)
      rows=combinePsalm(cs,ru);
    if(!rows)rows=[...cs.rows.map(onlyChurch),...fullRussian(ru.rows)];
    return {...cs,rows,pairedRussian:true,
      pairedByRow:rows.some(r=>!!r.church&&!!r.russian)};
  });
};

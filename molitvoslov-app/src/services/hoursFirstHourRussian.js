import russianEdition from '../data/hoursFirstHourRussian.json';

const cloneSection = section => ({
  ...section, rows:(section.rows || []).map(row=>({...row})),
});

// The civil Russian Lenten dropdown has one shared short doxology, just as CS.
// Keep the archival corpus intact; normalize only the reader's presentation.
const forReading = section => {
  const value=cloneSection(section);
  if(value.kind==='prayer' && value.rows.length===7 &&
     value.rows[6]?.russian?.startsWith('Священник: Боже, сжалься') &&
     value.rows[6].russian.includes('\nЧтец: Аминь.')) {
    const [priest,reader]=value.rows[6].russian.split('\n');
    value.rows=[
      ...value.rows.slice(0,6),
      {...value.rows[6],russian:priest,dividerAfter:true},
      {russian:reader},
    ];
  }
  if(value.accordionId==='first-hour-lent-tropar' && value.rows.length===8) {
    value.rows=[
      ...value.rows.slice(0,3),
      {russian:'Слава, и ныне:',presentation:'liturgical-red',dividerAfter:true},
      value.rows[7],
    ];
  }
  return value;
};
export const getFirstHourRussianSections = () => [
  forReading(russianEdition.opening),
  ...russianEdition.psalms.map(forReading),
  ...russianEdition.afterPsalms.map(forReading),
];

const onlyChurch = row => {
  const {russian,...rest}=row;
  return {...rest};
};
const onlyRussian = row => {
  const {church,...rest}=row;
  return {...rest};
};
const fullRussian = rows => rows.map(onlyRussian);
const shared = (row, presentation, language='church') => {
  const value=language==='russian'?onlyRussian(row):onlyChurch(row);
  return {
    ...value,
    presentation:presentation || value.presentation,
    preserveLineBreaks:value.preserveLineBreaks===true ||
      String(value[language]||'').includes('\n'),
    sharedOnce:true,
  };
};
const sharedDoxology = (row,language='church') => shared(row,'shared-doxology',language);
const sharedResponse = (row,language='church') => {
  const txt=String(row?.[language]||'').normalize('NFD')
    .replace(/[\u0300\u0301\u0340\u0341\u0483-\u0489]/gu,'')
    .normalize('NFC').trim().toLocaleLowerCase('ru');
  const isAlleluia=/^аллилу/u.test(txt);
  return shared(row,isAlleluia?'shared-alleluia':'shared-mercy',language);
};
const isShared = row => {
  if(['comment','placeholder'].includes(row?.presentation))return true;
  const txt=String(row?.church||'').normalize('NFD')
    .replace(/[\u0300\u0301\u0340\u0341\u0483-\u0489]/gu,'')
    .normalize('NFC').trim().toLocaleLowerCase('ru');
  return /^(?:аллилу|господи,?\s+помилуй)/u.test(txt);
};
const pair = (cs,ru) => {
  if (!ru?.russian?.trim() || isShared(cs)) {
    if (/^(?:Аллилу|Го́споди|Господи)/u.test(String(cs?.church||'')))
      return sharedResponse(cs);
    return shared(cs);
  }
  return {
    ...onlyChurch(cs),
    russian:ru.russian,
    russianPresentation:ru.presentation||'',
    russianAccentPrefix:ru.accentPrefix||'',
    russianRedInitial:ru.redInitial===true,
    russianPreserveLineBreaks:ru.preserveLineBreaks===true,
    dividerAfter:cs.dividerAfter===true||ru.dividerAfter===true,
    compactAfter:cs.compactAfter===true||ru.compactAfter===true,
  };
};
const getBogorodichen = (cs,ru) => {
  const church=String(cs.church||'').replace(/^Богородичен:\s*/u,'').trim();
  const russian=String(ru.russian||'').replace(/^Богородичен:\s*/u,'').trim();
  if(!church||!russian) return pair(cs,ru);
  return {
    ...onlyChurch(cs),church,russian,
    accentPrefix:'',russianAccentPrefix:'',
    redInitial:true,russianRedInitial:true,
    russianPresentation:ru.presentation||'',
  };
};
const centeredBogorodichen = () => shared({
  church:'Богородичен:',presentation:'shared-heading',compactAfter:true,
},'shared-heading');

const lenten = (cs,ru) => {
  if(cs.rows?.length!==5||ru.rows?.length!==5) return null;
  return [
    ...[0,1,2].map(i=>pair(cs.rows[i],ru.rows[i])),
    sharedDoxology(cs.rows[3]),
    centeredBogorodichen(),
    getBogorodichen(cs.rows[4],ru.rows[4]),
  ];
};
const ordinaryHymn = (cs,ru) => cs.rows.map((row,i)=>{
  if(i===0||i===2)return sharedDoxology(row);
  if(i===3)return centeredBogorodichen();
  return pair(row,ru.rows[i]);
});
const trisagion = (cs,ru) => {
  if(cs.rows?.length!==3||ru.rows?.length!==9)return null;
  return [
    shared(ru.rows[0],null,'russian'),     // Trisagion, not its redundant heading.
    sharedDoxology(ru.rows[1],'russian'),
    onlyRussian(ru.rows[2]),             // Trinity prayer exists in RU.
    sharedResponse(ru.rows[3],'russian'),
    sharedDoxology(ru.rows[4],'russian'),
    onlyRussian(ru.rows[5]),             // Full Our Father.
    onlyRussian(ru.rows[6]),
    shared(cs.rows[1]),                  // Kondak placeholder.
    shared(cs.rows[2]),                  // One editorial comment.
    onlyRussian(ru.rows[8]),            // Different service instruction.
  ];
};
const afterPrayers = (cs,ru) => {
  if(cs.rows?.length!==8||ru.rows?.length!==8)return null;
  return [
    sharedResponse(cs.rows[0]), pair(cs.rows[1],ru.rows[1]),
    sharedResponse(cs.rows[2]), sharedDoxology(cs.rows[3]),
    pair(cs.rows[4],ru.rows[4]), shared(cs.rows[5]),
    pair(cs.rows[6],ru.rows[6]), // Divider after the priest's words.
    shared(cs.rows[7]),           // Separate "Чтец: Аминь."
  ];
};
const dismissal = (cs,ru) => {
  if(cs.rows?.length!==9||ru.rows?.length!==18)return null;
  return [
    shared(ru.rows[0],null,'russian'),    // Trisagion itself, no repeated heading.
    sharedDoxology(ru.rows[1],'russian'),
    onlyRussian(ru.rows[2]),
    sharedResponse(ru.rows[3],'russian'),
    sharedDoxology(ru.rows[4],'russian'),
    onlyRussian(ru.rows[5]),             // Our Father.
    onlyRussian(ru.rows[6]),
    onlyRussian(ru.rows[7]),             // Reader: Amen.
    sharedResponse(ru.rows[8],'russian'),
    onlyRussian(ru.rows[9]),             // Priest reads a prayer (instruction).
    pair({...cs.rows[2],
      church:String(cs.rows[2].church||'').replace(/^Иерей:\s*/u,''),
      redInitial:true,
    },ru.rows[10]),
    shared(cs.rows[3],'shared-heading'),        // Centered once.
    pair(cs.rows[4],ru.rows[12]),              // Full bilingual hymn.
    onlyRussian(ru.rows[13]),                  // Separate Russian priest response.
    shared(ru.rows[14],'choir-response','russian'), // Red "Хор:" only.
    sharedResponse(ru.rows[15],'russian'),
    shared(ru.rows[16],null,'russian'),   // Bless once.
    shared(ru.rows[17],null,'russian'),   // Dismissal instruction once.
  ];
};
const psalmNumber = title => {
  const found=/(?:псалом|псалм|ѱалом)(?:ъ)?\s*(\d+)/iu.exec(String(title||''));
  return found?Number(found[1]):null;
};
const combinePsalm=(cs,ru)=>{
  if(!psalmNumber(cs.title)||psalmNumber(cs.title)!==psalmNumber(ru.title))return null;
  const church=cs.rows.map(r=>r.church).filter(Boolean).join('\n');
  const russian=ru.rows.map(r=>r.russian).filter(Boolean).join('\n');
  if(!church||!russian)return null;
  return [{...onlyChurch(cs.rows[0]),church,russian,preserveLineBreaks:true,russianPreserveLineBreaks:true}];
};
export const pairFirstHourSections=({churchSections,russianSections})=>{
  if(!Array.isArray(churchSections)||!Array.isArray(russianSections)||
    churchSections.length!==russianSections.length)return null;
  const firstAfter=churchSections.length-12;
  return churchSections.map((cs,i)=>{
    const ru=russianSections[i];
    if(!cs||!ru||(cs.kind&&ru.kind&&cs.kind!==ru.kind)||
      (cs.accordionId||null)!==(ru.accordionId||null))return null;
    const relative=i-firstAfter;
    let rows=null;
    if(relative===2&&cs.rows.length===5&&ru.rows.length===5)
      rows=ordinaryHymn(cs,ru);
    if(relative===3) rows=lenten(cs,ru);
    if(relative===5) rows=trisagion(cs,ru);
    if(relative===9) rows=afterPrayers(cs,ru);
    if(relative===11)rows=dismissal(cs,ru);
    if(!rows&&cs.rows?.length===ru.rows?.length)
      rows=cs.rows.map((row,j)=>relative===0&&j===0
        ?sharedDoxology(row):pair(row,ru.rows[j]));
    if(!rows&&relative<0&&relative>=-3)
      rows=combinePsalm(cs,ru);
    if(!rows)rows=[...cs.rows.map(onlyChurch),...fullRussian(ru.rows)];
    const isLenten=cs.accordionId==='first-hour-lent-tropar';
    return {
      ...cs,rows,pairedRussian:true,
      ...(isLenten?{dividerAfterDropdown:true}:{}),
      pairedByRow:rows.some(r=>!!r.church&&!!r.russian),
    };
  });
};

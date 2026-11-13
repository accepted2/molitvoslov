import {Alert, Share} from 'react-native';
import {shareImportableContent} from './shareInvitations';

// Public links resolve to a read-only landing page. Private content is sent
// only as explicit plain text; never expose account UUIDs in a public URL.
export const SHARE_ORIGIN = 'https://molitvoslov-3o9d.onrender.com';
const slug = value => {
  const s=String(value??'').trim();
  return s && s.length<=120 && /^[\p{L}\p{N}._-]+$/u.test(s)
    ? encodeURIComponent(s) : null;
};
export const sharePathFor = (screen,params={}) => {
  let id,chapter;
  switch(screen){
    case 'BibleBook':
      id=slug(params.bookId);
      return id ? 'bible-book/'+id+'/' +
        (params.translationCode==='csl_traditional'?'csl_traditional':'rst') : null;
    case 'BibleChapter':
      id=slug(params.bookId);
      chapter=Number(params.chapterNumber);
      return id && Number.isInteger(chapter) && chapter>=1 && chapter<=250
        ? 'bible/'+id+'/'+chapter+'/' +
          (params.translationCode==='csl_traditional'?'csl_traditional':'rst') : null;
    case 'Akathist':
      id=slug(params.akathistId || params.slug);
      return id?'akathist/'+id:null;
    case 'Canon':
      id=slug(params.canonId || params.slug);
      return id?'canon/'+id:null;
    case 'Kathisma':
      chapter=Number(params.kathismaNumber);
      return Number.isInteger(chapter)&&chapter>=1&&chapter<=20
        ? 'kathisma/'+chapter:null;
    case 'PrayerRule': id=slug(params.slug);return id?'prayer/'+id:null;
    case 'Reader': id=slug(params.slug);return id?'reader/'+id:null;
    case 'HoursReading':id=slug(params.entryId);return id?'hours/'+id:null;
    case 'SaintDetail':{
      id=slug(params.date);
      if(!id||!/^20\d\d-\d\d-\d\d$/.test(id))return null;
      const section=['life','troparion','kontakion','prayer'].includes(params.focusSection)
        ? params.focusSection:'life';
      return 'saint/'+id+'/'+section;
    }
    case 'Psalter':return 'psalter';
    default:return null;
  }
};
export const publicShareUrl = (screen,params) => {
  const path=sharePathFor(screen,params);
  return path?SHARE_ORIGIN+'/api/share/?path='+encodeURIComponent(path):null;
};
export const shareMessage = ({title,text,url,privateContent=false}) => {
  const heading=String(title||'Молитвослов').trim();
  const body=String(text||'').trim();
  // Native share text should be bounded; never imply the full text was sent.
  const truncated=body.length>24000?body.slice(0,23980).trim()+
    '\n\n[Фрагмент сокращён. Полный текст — в приложении.]':body;
  return ['☦ '+heading,truncated,
    !privateContent&&url?'Открыть в Молитвослове:\n'+url:'',
    'Молитвослов'].filter(Boolean).join('\n\n');
};
export const documentShareText = document => {
  const parts=[];
  for(const section of document?.sections||[]){
    if(section.title)parts.push(section.title);
    for(const row of section.rows||[]){
      if(row.sharedTitle)parts.push(row.sharedTitle);
      if(row.blocks?.length){
        const first=row.blocks.find(block=>typeof block?.text==='string'&&block.text.trim());
        if(first)parts.push(first.text);
      }else if(typeof row.text==='string')parts.push(row.text);
    }
  }
  return parts.join('\n\n');
};
export const prayerRuleShareText = (rule,mode='church') =>
  (rule?.items||[]).map(entry=>{
    if(entry?.item_type==='text' && entry.text){
      const body=entry.text;
      const value=mode==='russian'?body.translation
        :mode==='traditional'?body.traditional_content:body.content;
      return [body.title,value||body.content||body.translation]
        .filter(Boolean).join('\n');
    }
    return entry.content||'';
  }).filter(Boolean).join('\n\n');

export const isPrivateShareSource = source =>
  ['personal_prayer','personal_prayer_book','memorial','memorial_book']
    .includes(String(source||''));
export const shareContent = async ({title,text,screen,params,privateContent=false,
  confirmPrivate=false}) => {
  const url=privateContent?null:publicShareUrl(screen,params);
  if(!String(text||'').trim()&&!url){
    Alert.alert('Нет содержимого','Выберите текст для отправки.');
    return false;
  }
  const send=async()=>{
    try{
      await Share.share({message:shareMessage({title,text,url,privateContent}),
        title:String(title||'Молитвослов')});
    }catch(error){
      Alert.alert('Не удалось поделиться',error?.message||'Попробуйте ещё раз.');
    }
  };
  if(privateContent && confirmPrivate){
    Alert.alert('Отправка личного содержимого',
      'Текст будет передан выбранному приложению. Личные данные не публикуются по ссылке. Фотографии и вложения не включены.',
      [{text:'Отмена',style:'cancel'}, {text:'Поделиться',onPress:send}]);
    return true;
  }
  await send();
  return true;
};
// A selected quote links to its public source. Offsets stay local:
 // URL access never exposes the user's saved ranges or account.
export const resolveSelectedShareTarget = config => {
  const meta=config?.metadata||{};
  switch(config?.sourceType){
    case 'bible':
      return {screen:'BibleChapter',params:{
        bookId:meta.book_id||config.sourceId,
        chapterNumber:meta.chapter_number,
      }};
    case 'akathist':
      return {screen:'Akathist',params:{akathistId:config.sourceId,slug:meta.slug}};
    case 'canon':
      return {screen:'Canon',params:{canonId:config.sourceId,slug:meta.slug}};
    case 'prayer_rule':
      return {screen:'PrayerRule',params:{slug:meta.slug}};
    case 'text':
      return {screen:'Reader',params:{slug:meta.slug}};
    case 'psalter':
      return meta.kathisma_number
        ? {screen:'Kathisma',params:{kathismaNumber:meta.kathisma_number}}
        : {screen:'Psalter',params:{}};
    case 'hours':
      return {screen:'HoursReading',params:{entryId:meta.entry_id}};
    case 'calendar':
      return {screen:'SaintDetail',params:{date:meta.date,focusSection:meta.section}};
    default:return {};
  }
};
export const shareSavedItem = item => {
  const meta=item?.metadata||{};
  const type=item?.source_type;
  const mapping={
    bible:['BibleChapter',{bookId:meta.book_id||item.source_id,
      chapterNumber:meta.chapter_number}],
    akathist:['Akathist',{akathistId:item.source_id,slug:meta.slug}],
    canon:['Canon',{canonId:item.source_id,slug:meta.slug}],
    psalter:meta.kathisma_number
      ? ['Kathisma',{kathismaNumber:meta.kathisma_number}]
      : ['Psalter',{}],
    prayer_rule:['PrayerRule',{slug:meta.slug}],
    text:['Reader',{slug:meta.slug}],
    calendar:['SaintDetail',{date:meta.date,focusSection:meta.section}],
  };
  const [screen,params]=mapping[type]||[null,{}];
  if(String(item?.text||'').trim()){
    return shareImportableContent({
      kind:'quote',
      title:item?.item_title||item?.source_title||'Цитата',
      text:item.text,
      privateContent:isPrivateShareSource(type),
      fallbackText:item.text,
    });
  }
  return shareContent({
    title:item?.item_title||item?.source_title||'Избранное',
    text:item?.text||'',
    screen,params,
    privateContent:isPrivateShareSource(type),
    confirmPrivate:isPrivateShareSource(type),
  });
};

import {Alert, Share} from 'react-native';
import {API_BASE_URL, authenticatedFetch, getApiToken} from './backendAuth';
import {syncMemorials} from './memorials';
import {syncPrayerBooks} from './prayerBooks';
import {syncSavedItems} from './savedItems';
import {showShareFeedback,hideShareFeedback} from './shareFeedback';

const readableError = async response => {
  const result=await response.json().catch(()=>({}));
  const error=new Error(
    response.status===404 ? 'Сервер ещё не поддерживает ссылки на получаемые материалы.'
      : result?.detail || 'Ошибка сервера ('+response.status+')');
  error.status=response.status;
  throw error;
};
const inviteUrl = token =>
  API_BASE_URL+'/api/share/?invite='+encodeURIComponent(token);

export const fetchSharedInvitation = async token => {
  // Any holder of the public sharing link can preview its snapshot.
  // Importing a copy still requires a destination account.
  const response=await fetch(API_BASE_URL+'/api/shared/'+encodeURIComponent(token)+'/');
  if(!response.ok)return readableError(response);
  return response.json();
};
export const importSharedInvitation = async token => {
  const response=await authenticatedFetch(
    '/api/shared/'+encodeURIComponent(token)+'/import/', {
      method:'POST',body:JSON.stringify({}),
    });
  if(!response.ok)return readableError(response);
  const result=await response.json();
  // Server creates the copy under the recipient's account. Pull it into the
  // existing offline database instead of creating a second local copy.
  try{
    if(result.kind==='quote')await syncSavedItems();
    else if(result.kind==='memorial')await syncMemorials();
    else if(result.kind==='prayerbook')await syncPrayerBooks();
  }catch(error){
    console.warn('[sharing] import succeeded remotely; local pull failed:',error);
    return {...result,localPending:true};
  }
  return result;
};

const createInvite = async (kind,rest) => {
  const response=await authenticatedFetch('/api/shared/create/',{
    method:'POST',
    body:JSON.stringify({kind,...rest}),
  });
  if(!response.ok)return readableError(response);
  return response.json();
};

const shareAsText=async(title,text)=>{
  const message='☦ '+String(title||'Молитвослов')+'\n\n'+String(text||'');
  await new Promise(resolve=>setTimeout(resolve,160));
  try {await Share.share({title:String(title||'Молитвослов'),message});}
  catch(error){showShareFeedback({
    title:'Не удалось отправить',
    message:error?.message||'Попробуйте другое приложение.',
  });}
};
export const shareImportableContent=async({
  kind,title,text='',sourceSyncId,privateContent=false,fallbackText='',
})=>{
  const token=await getApiToken();
  const usableText=kind==='quote'?String(fallbackText||text||'').trim():'';
  if(!token){
    showShareFeedback({
      title:'Для ссылки нужен аккаунт',
      message:'Для ссылки с кнопкой "Добавить себе" войдите через Google. '+
        (usableText?'Сам текст можно отправить сейчас.':'Ссылка без входа недоступна.'),
      cancelLabel:'Закрыть',
      ...(usableText?{confirmLabel:'Отправить текст',
        onConfirm:()=>shareAsText(title,usableText)}:{}),
    });
    return false;
  }
  const send=async()=>{
    showShareFeedback({loading:true,title:'Подготавливаем ссылку',
      message:'Создаём безопасную копию и ссылку для получателя...'});
    try{
      if(kind==='memorial')await syncMemorials();
      if(kind==='prayerbook')await syncPrayerBooks();
      if(kind==='quote')await syncSavedItems().catch(()=>{});
      const request=kind==='quote'?{title,text}:{source_sync_id:sourceSyncId};
      const invite=await createInvite(kind,request);
      const url=inviteUrl(invite.token);
      const message=[
        '☦ '+String(title||invite.title||'Молитвослов'),
        kind==='quote'?String(text).slice(0,1200):'',
        'Открыть и добавить себе:\n'+url,
      ].filter(Boolean).join('\n\n');
      hideShareFeedback();
      await new Promise(resolve=>setTimeout(resolve,160));
      await Share.share({message,title:title||'Молитвослов'});
      return true;
    }catch(error){
      showShareFeedback({
        title:error?.status===404?'Ссылка пока недоступна':'Не удалось подготовить ссылку',
        message:(error?.message||'Проверьте интернет и повторите.')+
          (usableText?' Вы можете отправить текст без ссылки.':''),
        cancelLabel:'Закрыть',
        ...(usableText?{confirmLabel:'Отправить текст',
          onConfirm:()=>shareAsText(title,usableText)}:{}),
      });
      return false;
    }
  };
  // A public link does not require approval from its owner after sharing.
  return send();
};

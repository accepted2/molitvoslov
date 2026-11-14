import {Alert, Share} from 'react-native';
import {API_BASE_URL, authenticatedFetch, getApiToken} from './backendAuth';
import {syncMemorials} from './memorials';
import {syncPrayerBooks} from './prayerBooks';
import {syncSavedItems} from './savedItems';
import {showShareFeedback,hideShareFeedback} from './shareFeedback';

const readableError = async (response, action='create') => {
  const result=await response.json().catch(()=>({}));
  const message=result?.detail || (
    response.status===401 ? 'Войдите в аккаунт, чтобы добавить этот материал.'
      : response.status===404 && action==='open'
        ? 'Ссылка недействительна, отозвана или срок её действия истёк.'
        : response.status===404
          ? 'Сервер ещё не поддерживает ссылки на получаемые материалы.'
          : 'Ошибка сервера ('+response.status+')');
  const error=new Error(message);
  error.status=response.status;
  throw error;
};
const inviteUrl = token =>
  API_BASE_URL+'/api/share/?invite='+encodeURIComponent(token);

// Image bytes are served by Django only while the same invitation is valid.
// Do not expose Supabase storage paths or keys to the receiving device.
export const sharedPhotoUrl = (token,index) =>
  API_BASE_URL+'/api/shared/'+encodeURIComponent(token)+
  '/photo/'+String(index)+'/';

export const fetchSharedInvitation = async token => {
  // Any holder of the public sharing link can preview its snapshot.
  // Importing a copy still requires a destination account.
  const response=await fetch(API_BASE_URL+'/api/shared/'+encodeURIComponent(token)+'/');
  if(!response.ok)return readableError(response,'open');
  return response.json();
};
export const importSharedInvitation = async token => {
  const response=await authenticatedFetch(
    '/api/shared/'+encodeURIComponent(token)+'/import/', {
      method:'POST',body:JSON.stringify({}),
    });
  if(!response.ok)return readableError(response,'open');
  const result=await response.json();
  // Server creates the copy under the recipient's account. Pull it into the
  // existing offline database instead of creating a second local copy.
  try{
    let syncResult;
    if(result.kind==='quote')syncResult=await syncSavedItems();
    else if(result.kind==='memorial')syncResult=await syncMemorials();
    else if(result.kind==='prayerbook')syncResult=await syncPrayerBooks();
    if(syncResult?.success===false){
      throw syncResult.error || new Error('Не удалось обновить локальную копию.');
    }
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
      // Share the server snapshot only after all pending local edits and
      // photographs have actually reached the user's cloud account.
      const sync=kind==='memorial'?await syncMemorials()
        :kind==='prayerbook'?await syncPrayerBooks():null;
      if(sync?.success===false){
        throw new Error('Не удалось загрузить все данные в облако. '+
          (sync.error?.message||'Проверьте интернет и повторите.'));
      }
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

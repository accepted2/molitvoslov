import {Alert, Share} from 'react-native';
import {API_BASE_URL, authenticatedFetch, getApiToken} from './backendAuth';
import {syncMemorials} from './memorials';
import {syncPrayerBooks} from './prayerBooks';
import {syncSavedItems} from './savedItems';

const readableError = async response => {
  const result=await response.json().catch(()=>({}));
  throw new Error(result?.detail || 'Ошибка сервера ('+response.status+')');
};
const inviteUrl = token =>
  API_BASE_URL+'/api/share/?invite='+encodeURIComponent(token);

export const fetchSharedInvitation = async token => {
  const response=await authenticatedFetch(
    '/api/shared/'+encodeURIComponent(token)+'/');
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

const promptPrivate = (title, action) => new Promise(resolve=>{
  Alert.alert('Поделиться личным содержимым',
    'Вы создадите ссылку на копию "'+String(title||'').slice(0,60)+
    '". Получатель с аккаунтом сможет добавить её себе. Ссылка действует семь дней. Фотографии не передаются.',
    [{text:'Отмена',style:'cancel',onPress:()=>resolve(false)},
     {text:'Создать ссылку',onPress:()=>resolve(true)}],
    {cancelable:true,onDismiss:()=>resolve(false)},
  );
}).then(ok=>ok?action():false);

export const shareImportableContent = async ({
  kind,title,text='',sourceSyncId,privateContent=false,
  fallbackText='',
}) => {
  const token=await getApiToken();
  if(!token){
    Alert.alert('Поделиться',
      'Для ссылки с кнопкой "Добавить себе" нужно войти в аккаунт. Можно отправить обычный текст.',
      [{text:'Отмена',style:'cancel'},
       {text:'Отправить текст',onPress:()=>{
         if(fallbackText||text)
           Share.share({message:'☦ '+title+'\n\n'+(fallbackText||text)})
             .catch(error=>Alert.alert('Ошибка',error.message));
       }}]);
    return false;
  }
  const send=async()=>{
    try{
      if(kind==='memorial')await syncMemorials();
      if(kind==='prayerbook')await syncPrayerBooks();
      if(kind==='quote')await syncSavedItems().catch(()=>{});
      const request=kind==='quote'
        ? {title,text}
        : {source_sync_id:sourceSyncId};
      const invite=await createInvite(kind,request);
      const url=inviteUrl(invite.token);
      const message=['☦ '+String(title||invite.title||'Молитвослов'),
        kind==='quote'?String(text).slice(0,1200):'Приглашение из приложения «Молитвослов».',
        'Посмотреть и добавить себе:\n'+url,
        'Ссылка действует 7 дней.'].filter(Boolean).join('\n\n');
      await Share.share({message,title:title||'Молитвослов'});
      return true;
    }catch(error){
      Alert.alert('Не удалось подготовить ссылку',
        error?.message||'Проверьте интернет и повторите.');
      return false;
    }
  };
  return privateContent?promptPrivate(title,send):send();
};

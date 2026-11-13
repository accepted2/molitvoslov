import AsyncStorage from '@react-native-async-storage/async-storage';
import {getCachedBackendUser, getApiToken} from './backendAuth';

const PREFIX = '@molitvoslov/home-category-order/v1:';
const normalize = keys => Array.isArray(keys)
  ? [...new Set(keys.filter(key => typeof key === 'string' && key.length > 0 &&
    key.length < 100))].slice(0,150)
  : [];
const keyFor = id => PREFIX + (id ? 'account-' + id : 'guest');

export const mergeCategoryOrder = (entries, savedOrder) => {
  const rank = new Map(normalize(savedOrder).map((key,index)=>[key,index]));
  return entries.map((entry,index)=>({...entry,__sortIndex:index}))
    .sort((a,b) => (rank.get(a.key) ?? (rank.size+a.__sortIndex)) -
      (rank.get(b.key) ?? (rank.size+b.__sortIndex)))
    .map(({__sortIndex,...entry})=>entry);
};

// Live drag-and-drop targets an absolute slot, not an offset based on the
// already-changing index of the dragged card.
export const moveCategoryKeyToIndex = (keys, key, targetIndex) => {
  const list=normalize(keys);
  const from=list.indexOf(key);
  if(from<0||!Number.isFinite(targetIndex))return list;
  const to=Math.max(0,Math.min(list.length-1,Math.trunc(targetIndex)));
  if(from===to)return list;
  list.splice(from,1);
  list.splice(to,0,key);
  return list;
};

export const getCategoryDragTarget = (startIndex, translationY, stride, total) => {
  if(total<=0||!Number.isFinite(startIndex))return 0;
  if(!Number.isFinite(translationY)||!Number.isFinite(stride)||stride<=0)
    return Math.max(0,Math.min(total-1,Math.trunc(startIndex)));
  const slot=Math.round(startIndex+translationY/stride);
  return Math.max(0,Math.min(total-1,slot));
};

export const moveCategoryKey = (keys, key, offset) => {
  const list=normalize(keys);
  const from=list.indexOf(key);
  if(from<0||!Number.isFinite(offset))return list;
  const to=Math.max(0,Math.min(list.length-1,from+Math.trunc(offset)));
  if(from===to)return list;
  list.splice(from,1);
  list.splice(to,0,key);
  return list;
};

export const readHomeOrderForUser = async (userId, {inheritGuest=false}={}) => {
  const own=await AsyncStorage.getItem(keyFor(userId));
  if(own) {
    try{return normalize(JSON.parse(own));}catch{return [];}
  }
  if(inheritGuest&&userId)return readHomeOrderForUser(null);
  return [];
};
export const getHomeCategoryOrder = async () => {
  const token=await getApiToken().catch(()=>null);
  const user=token ? await getCachedBackendUser().catch(()=>null) : null;
  return readHomeOrderForUser(user?.id,{inheritGuest:true});
};
export const setHomeOrderForUser = async (userId, keys) => {
  const order=normalize(keys);
  await AsyncStorage.setItem(keyFor(userId),JSON.stringify(order));
  return order;
};
export const saveHomeCategoryOrder = async keys => {
  const token=await getApiToken().catch(()=>null);
  const user=token ? await getCachedBackendUser().catch(()=>null) : null;
  return setHomeOrderForUser(user?.id,keys);
};

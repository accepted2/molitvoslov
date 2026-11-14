// Universal HTTPS links remain clickable in Telegram and other messengers.
// When Android verifies our host, this adapter routes the original HTTPS intent
// directly to React Navigation without opening the Render landing page.
export const APP_LINK_HOST='molitvoslov-3o9d.onrender.com';
export const APP_LINK_ORIGIN='https://'+APP_LINK_HOST;
const APP_SCHEME='molitvoslov://';
const SLUG=String.raw`[\p{L}\p{N}._-]+`;
const SEGMENT=String.raw`[\p{L}\p{N}._-]+`;
const publicPatterns=[
  new RegExp(String.raw`^bible/${SEGMENT}/[1-9]\d{0,2}(?:/(?:rst|csl_traditional)(?:/[1-9]\d{0,2})?)?$`,'u'),
  new RegExp(String.raw`^bible-book/${SEGMENT}(?:/(?:rst|csl_traditional))?$`,'u'),
  new RegExp(String.raw`^(?:akathist|canon|hours)/${SLUG}(?:/[1-9]\d{0,8})?$`,'u'),
  new RegExp(String.raw`^prayer/${SLUG}(?:/[1-9]\d{0,8})?$`,'u'),
  new RegExp(String.raw`^reader/${SLUG}$`,'u'),
  /^kathisma\/(?:[1-9]|1\d|20)(?:\/[1-9]\d{0,2}\/(?:church|russian|traditional|both))?$/,
  new RegExp(String.raw`^saint/20\d{2}-\d{2}-\d{2}/(?:life|troparion|kontakion|prayer)(?:/${SLUG})?$`,'u'),
  new RegExp(String.raw`^category/[1-9]\d{0,5}/${SLUG}(?:/[1-9]\d{0,8})?$`,'u'),
  /^psalter$/,
];

export const isSupportedAppPath = path =>
  typeof path==='string' && path.length<=240 &&
  !path.split('/').some(part=>part==='.'||part==='..') &&
  publicPatterns.some(pattern=>pattern.test(path));

const decodeComponent=value=>{
  try{return decodeURIComponent(value.replace(/\+/g,' '));}
  catch{return null;}
};

const queryParams=raw=>{
  const result={};
  for(const part of String(raw||'').split('&')){
    if(!part)continue;
    const pivot=part.indexOf('=');
    const name=decodeComponent(pivot<0?part:part.slice(0,pivot));
    const value=decodeComponent(pivot<0?'':part.slice(pivot+1));
    if(!name || value===null || Object.prototype.hasOwnProperty.call(result,name)){
      return null;
    }
    result[name]=value;
  }
  return result;
};

// Returning null intentionally ignores unrecognized or malformed URL intents.
// Existing custom-scheme links (including invitation tokens) continue working.
export const normalizeIncomingAppLink = url => {
  if(typeof url!=='string'||!url)return null;
  if(url.startsWith(APP_SCHEME))return url;
  const match=/^https:\/\/molitvoslov-3o9d\.onrender\.com\/api\/share\/\?([^#]*)$/i.exec(url);
  if(!match)return null;
  const query=queryParams(match[1]);
  if(!query)return null;
  if(Object.prototype.hasOwnProperty.call(query,'invite')){
    return /^[A-Za-z0-9_-]{43}$/.test(query.invite)
      ? APP_SCHEME+'shared/'+query.invite : null;
  }
  let destination=query.path;
  // Old sharePathFor() percent-encodes non-Latin slugs before encoding the
  // query string. Decode exactly one additional layer if necessary; validate
  // the resulting route rather than letting encoded slashes bypass checks.
  if(!isSupportedAppPath(destination) &&
    typeof destination==='string' && destination.includes('%')){
    const decoded=decodeComponent(destination);
    if(isSupportedAppPath(decoded))destination=decoded;
  }
  if(!isSupportedAppPath(destination))return null;
  // Encode individual segments, not the slashes needed by navigation.
  return APP_SCHEME+destination.split('/').map(encodeURIComponent).join('/');
};

#!/usr/bin/env node
'use strict';
// Safely apply the November 18 log fixes without touching local widget code.
// Validate ALL changes before ANY writes. Backup modified files and preserve
// Windows CRLF and UTF-8 BOM. --dry-run never mutates the project.
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const changes=[{"path":"src/services/localPrayerReminders.js","changes":[{"old":"      importance: Notifications.AndroidImportance.HIGH,\n      sound: 'default',","now":"      importance: Notifications.AndroidImportance.HIGH,\n      // Omitting sound uses Android's default notification sound. In Expo SDK 57\n      // the literal \"default\" is misidentified as an unbundled custom sound."},{"old":"          sound: 'default',","now":"          sound: Platform.OS === 'android' ? true : 'default',"},{"old":"      body: item.title,\n      data: {kind: 'molitvoslov-reminder', reminderId: item.id, reminderScheduleVersion: 2},\n      sound: 'default',","now":"      body: item.title,\n      data: {kind: 'molitvoslov-reminder', reminderId: item.id, reminderScheduleVersion: 2},\n      sound: Platform.OS === 'android' ? true : 'default',"}]},{"path":"src/screens/MenuScreen.js","changes":[{"old":"  InteractionManager,\n","now":""},{"old":"    let interaction = null;\n    const timer = setTimeout(() => {\n      interaction = InteractionManager.runAfterInteractions(() => {\n        if (!cancelled) {\n          updateCalendarWidget(calendarToday, calendarLanguage);\n        }\n      });\n    }, 1200);\n\n    return () => {\n      cancelled = true;\n      clearTimeout(timer);\n      interaction?.cancel?.();\n    };","now":"    let idleHandle = null;\n    let idleKind = null;\n    const timer = setTimeout(() => {\n      const refreshWhenIdle = () => {\n        if (!cancelled) updateCalendarWidget(calendarToday, calendarLanguage);\n      };\n      // React Native 0.86 deprecates InteractionManager. Schedule the widget\n      // refresh when the JS thread is idle without delaying navigation.\n      if (typeof globalThis.requestIdleCallback === 'function') {\n        idleKind = 'idle';\n        idleHandle = globalThis.requestIdleCallback(refreshWhenIdle, {timeout: 3000});\n      } else {\n        idleKind = 'timeout';\n        idleHandle = setTimeout(refreshWhenIdle, 0);\n      }\n    }, 1200);\n\n    return () => {\n      cancelled = true;\n      clearTimeout(timer);\n      if (idleKind === 'idle' && typeof globalThis.cancelIdleCallback === 'function') {\n        globalThis.cancelIdleCallback(idleHandle);\n      } else if (idleKind === 'timeout') {\n        clearTimeout(idleHandle);\n      }\n    };"}]},{"path":"src/services/accountPreferencesSync.js","changes":[{"old":"import {authenticatedFetch, getApiToken, getCachedBackendUser} from './backendAuth';","now":"import {authenticatedFetch, getApiToken, getCachedBackendUser, deleteApiToken} from './backendAuth';"},{"old":"    const user = await getCachedBackendUser().catch(() => null);\n    const token = await getApiToken().catch(() => null);\n    if (!user?.id || !token) return;","now":"    const user = await getCachedBackendUser().catch(() => null);\n    // Keep offline pending changes even if the server token has expired.\n    // They remain scoped to the cached account ID, never another account.\n    if (!user?.id) return;"},{"old":"  if (!response.ok) {\n    const data = await response.json().catch(() => ({}));","now":"  if (!response.ok) {\n    const data = await response.json().catch(() => ({}));\n    const message = String(data?.detail || data?.error || '');\n    // A 401, or a 403 explicitly reporting an invalid token, means the\n    // saved credential is expired. Do NOT treat all 403s as expired logins.\n    if (response.status === 401 || (\n      response.status === 403 &&\n      /недействительн.*токен|invalid\\s+token/i.test(message)\n    )) {\n      // Clear ONLY the credential, not the account identity, local settings,\n      // or queued offline edits. Re-login will obtain a new backend token.\n      await deleteApiToken();\n      const error = new Error('Для облачной синхронизации требуется повторный вход.');\n      error.code = 'reauth-required';\n      throw error;\n    }\n    throw new Error(message || 'Cloud settings HTTP ' + response.status);\n  }"},{"old":"  running = syncOnce().finally(() => { running = null; });","now":"  running = syncOnce()\n    .catch(error => {\n      // Authorization is a recoverable state, not a network retry error.\n      // Account UI can prompt for login; do not emit repeating WARN messages.\n      if (error?.code === 'reauth-required') {\n        return {success: false, reason: 'reauth-required'};\n      }\n      throw error;\n    })\n    .finally(() => { running = null; });"}]},{"path":"src/screens/AccountScreen.js","optional":true,"changes":[{"old":"      setSettingsCloudStatus(result?.success\n        ? result.pending?'Есть изменения, ожидающие отправки':'Настройки синхронизированы'\n        : 'Синхронизация недоступна: '+(result?.reason||'проверьте интернет'));","now":"      setSettingsCloudStatus(result?.success\n        ? result.pending?'Есть изменения, ожидающие отправки':'Настройки синхронизированы'\n        : result?.reason === 'reauth-required'\n          ? 'Для синхронизации настроек повторно войдите в аккаунт'\n          : 'Синхронизация недоступна: '+(result?.reason||'проверьте интернет'));"}]}];
const normalize=s=>s.replace(/\r\n/g,'\n');
const parse=require('@babel/parser').parse;
const planned=[];
for(const entry of changes){
 const file=path.join(root,entry.path);
 const original=fs.readFileSync(file,'utf8');
 const bom=original.startsWith('\uFEFF')?'\uFEFF':'';
 let content=normalize(original.slice(bom.length));
 let skipped=false;
 for(const [i,patch] of entry.changes.entries()){
  const countBefore=content.split(patch.old).length-1;
  const countAfter=patch.now?content.split(patch.now).length-1:0;
  if(countBefore===1 && countAfter===0)content=content.replace(patch.old,patch.now);
  else if(countBefore===0 && (!patch.now || countAfter===1))continue;
  else{
   const error=entry.path+': local code differs around fix '+(i+1)+
     '. NO FILES MODIFIED; send this message for a safe merge.';
   if(entry.optional){console.warn('SKIP OPTIONAL: '+error);skipped=true;break}
   throw Error(error);
  }
 }
 if(skipped)continue;
 if(entry.path.endsWith('localPrayerReminders.js')){
  const channel=content.slice(content.indexOf('const channelReady ='),
    content.indexOf('const hasPermission ='));
  if(!channel.includes('Notifications.setNotificationChannelAsync') ||
     /sound\s*:/.test(channel) || !content.includes("Platform.OS === 'android' ? true : 'default'"))
    throw Error(entry.path+': default sound fix not fully present. NO FILES MODIFIED.');
 }
 if(entry.path.endsWith('MenuScreen.js') &&
     (content.includes('InteractionManager.runAfterInteractions') ||
      !content.includes('globalThis.requestIdleCallback')))
   throw Error(entry.path+': deprecated callback still present. NO FILES MODIFIED.');
 if(entry.path.endsWith('accountPreferencesSync.js') &&
     (!content.includes("error.code = 'reauth-required'") ||
      !content.includes('await deleteApiToken()')))
   throw Error(entry.path+': auth recovery incomplete. NO FILES MODIFIED.');
 parse(content,{sourceType:'module',plugins:['jsx']});
 let updated=bom+content;
 if(original.includes('\r\n'))updated=updated.replace(/\n/g,'\r\n');
 planned.push({file,path:entry.path,original,updated});
}
const changed=planned.filter(x=>x.original!==x.updated);
if(!changed.length){console.log('PASS: notification, idle and auth fixes already installed.');process.exit(0)}
if(process.argv.includes('--dry-run')){
 console.log('DRY RUN: validated; NO FILES MODIFIED.');
 console.log('Would change:',changed.map(x=>x.path).join(', '));
 process.exit(0);
}
const backupDir=path.resolve(root,'..','build-backups',
 'log-fixes-before-'+new Date().toISOString().replace(/[:.]/g,'-'));
fs.mkdirSync(backupDir,{recursive:true});
for(const item of changed){
 fs.copyFileSync(item.file,path.join(backupDir,item.path.replace(/[\\/]/g,'__')));
}
const written=[];
try{
 for(const item of changed){
  fs.writeFileSync(item.file,item.updated,'utf8');
  written.push(item);
 }
}catch(error){
 for(const item of written)fs.writeFileSync(item.file,item.original,'utf8');
 throw error;
}
console.log('PASS: notification sound, idle callback and expired-auth handling installed.');
console.log('Changed:',changed.map(x=>x.path).join(', '));
console.log('Backups:',backupDir);

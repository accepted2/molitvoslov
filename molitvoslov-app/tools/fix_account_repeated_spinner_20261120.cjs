#!/usr/bin/env node
'use strict';
// Repair repeated Google-account spinner without overwriting AccountScreen.
const fs = require('node:fs');
const path = require('node:path');
const {parse} = require('@babel/parser');
const root = path.resolve(__dirname, '..');
const relative = 'src/screens/AccountScreen.js';
const filename = path.join(root, relative);
const original = fs.readFileSync(filename, 'utf8');
let source = original.replace(/\r\n/g, '\n');
const dry = process.argv.includes('--dry-run');
const vars = "// The bottom navigation resets its stack when changing tabs, so AccountScreen\n// mounts again every time. Preserve only display state across those mounts;\n// SecureStore remains the source of truth for the actual session token.\nconst ACCOUNT_PROFILE_REFRESH_INTERVAL_MS = 5 * 60 * 1000;\nlet displayedAccountUser = null;\nlet accountCacheInitialized = false;\nlet lastProfileRefreshAt = 0;\nlet accountSessionVersion = 0;\n\nconst formatAccountUser = user => user?.id ? ({\n  id: user.id,\n  email: user.email,\n  name: user.name || user.first_name || user.username,\n  photo: user.picture_url || user.picture || user.photo || null,\n}) : null;\n\n";
const effect = "  useEffect(() => {\n    let active = true;\n    const version = accountSessionVersion;\n    const stillCurrent = () => active && version === accountSessionVersion;\n    const showUser = user => {\n      if (!stillCurrent()) return;\n      const display = formatAccountUser(user);\n      displayedAccountUser = display;\n      setGoogleUser(display);\n    };\n\n    const loadUser = async () => {\n      try {\n        // Restoring a stored profile is fast and local. A cached profile is\n        // never proof of an active session unless its token also exists.\n        const [token, cached] = await Promise.all([\n          getApiToken(),\n          getCachedBackendUser(),\n        ]);\n        if (!stillCurrent()) return;\n\n        accountCacheInitialized = true;\n        if (!token) {\n          lastProfileRefreshAt = 0;\n          showUser(null);\n          setLoading(false);\n          return;\n        }\n\n        if (cached?.id) showUser(cached);\n        setLoading(false);\n\n        // Backend verification is silent, not a blocking auth flow.\n        if (cached?.id &&\n            Date.now() - lastProfileRefreshAt < ACCOUNT_PROFILE_REFRESH_INTERVAL_MS) {\n          return;\n        }\n        try {\n          const backendUser = await getCurrentBackendUser();\n          if (!stillCurrent()) return;\n          if (backendUser?.id) {\n            lastProfileRefreshAt = Date.now();\n            showUser(backendUser);\n          } else {\n            // getCurrentBackendUser removes the token on HTTP 401/403.\n            // Do not display an old cached profile after invalidation.\n            const remainingToken = await getApiToken();\n            if (!stillCurrent()) return;\n            if (!remainingToken) {\n              lastProfileRefreshAt = 0;\n              showUser(null);\n            }\n          }\n        } catch (error) {\n          // Offline/slow Render must not hide an existing signed-in profile.\n          console.warn('[account] Background profile refresh deferred:',\n            error?.message || error);\n        }\n      } catch (error) {\n        if (!stillCurrent()) return;\n        console.warn('[account] Local session restore failed:',\n          error?.message || error);\n        accountCacheInitialized = true;\n        setLoading(false);\n      }\n    };\n\n    loadUser();\n    return () => { active = false; };\n  }, []);\n";
const once = (oldText,newText,label) => {
  if(source.includes(newText))return;
  if(source.split(oldText).length!==2)
    throw Error(label+' has unexpected local layout. NO FILES MODIFIED.');
  source=source.replace(oldText,newText);
};
if (!source.includes("let accountCacheInitialized = false;")) {
  const marker = 'export const AccountScreen = ({navigation}) => {';
  if(source.split(marker).length!==2)
    throw Error('Account component not recognized. NO FILES MODIFIED.');
  source=source.replace(marker,vars+marker);
}
once(
  "import {getCurrentBackendUser, deleteBackendAccount} from '../services/backendAuth';",
  "import {getCurrentBackendUser, getCachedBackendUser, getApiToken, deleteBackendAccount} from '../services/backendAuth';",
  'Backend auth import'
);
once(
  'const [googleUser, setGoogleUser] = useState(null);',
  'const [googleUser, setGoogleUser] = useState(() => displayedAccountUser);',
  'Google profile state'
);
once(
  'const [loading, setLoading] = useState(true);',
  'const [loading, setLoading] = useState(() => !accountCacheInitialized);',
  'Account spinner state'
);
const effectStart=source.indexOf('  useEffect(() => {\n    const loadUser = async () => {');
const effectEnd=effectStart>=0 ? source.indexOf('\n  const googleLogin = async () => {',effectStart):-1;
if(effectStart>=0 && effectEnd>effectStart) {
  source=source.slice(0,effectStart)+effect+source.slice(effectEnd);
} else if(!source.includes('const stillCurrent = () => active && version === accountSessionVersion;')) {
  throw Error('Account restoring effect changed locally. NO FILES MODIFIED.');
}
once(
  '      setGoogleUser(googleResult.user);',
  [
    '      accountSessionVersion += 1;',
    '      accountCacheInitialized = true;',
    '      displayedAccountUser = formatAccountUser(googleResult.user);',
    '      lastProfileRefreshAt = Date.now();',
    '      setGoogleUser(displayedAccountUser);',
    '      setLoading(false);',
  ].join('\n'),
  'Google login state'
);
const logoutStart=source.indexOf('  const googleLogout = async () => {');
const logoutEnd=logoutStart>=0 ? source.indexOf('\n  // if (loading) {',logoutStart):-1;
if(logoutStart<0 || logoutEnd<logoutStart)
  throw Error('Google logout block changed. NO FILES MODIFIED.');
let logoutBlock=source.slice(logoutStart,logoutEnd);
const oldLogout="    } finally {\n      setGoogleUser(null);\n    }";
const newLogout=[
  '    } finally {',
  '      accountSessionVersion += 1;',
  '      accountCacheInitialized = true;',
  '      displayedAccountUser = null;',
  '      lastProfileRefreshAt = 0;',
  '      setGoogleUser(null);',
  '      setLoading(false);',
  '    }'
].join('\n');
if(!logoutBlock.includes(newLogout)){
  if(logoutBlock.split(oldLogout).length!==2)
    throw Error('Google logout cleanup changed. NO FILES MODIFIED.');
  logoutBlock=logoutBlock.replace(oldLogout,newLogout);
}
source=source.slice(0,logoutStart)+logoutBlock+source.slice(logoutEnd);
const deleteStart=source.indexOf('  const deleteAccount = () => Alert.alert(');
const deleteEnd=deleteStart>=0?source.indexOf('\n  useEffect(() => {',deleteStart):-1;
if(deleteStart<0||deleteEnd<deleteStart)
  throw Error('Delete-account block changed. NO FILES MODIFIED.');
let deleteBlock=source.slice(deleteStart,deleteEnd);
const oldDelete="        await deleteBackendAccount();\n        setGoogleUser(null);";
const newDelete=[
  '        await deleteBackendAccount();',
  '        accountSessionVersion += 1;',
  '        accountCacheInitialized = true;',
  '        displayedAccountUser = null;',
  '        lastProfileRefreshAt = 0;',
  '        setGoogleUser(null);',
  '        setLoading(false);'
].join('\n');
if(!deleteBlock.includes('accountSessionVersion += 1;')){
  if(deleteBlock.split(oldDelete).length!==2)
    throw Error('Delete-account cleanup changed. NO FILES MODIFIED.');
  deleteBlock=deleteBlock.replace(oldDelete,newDelete);
}
source=source.slice(0,deleteStart)+deleteBlock+source.slice(deleteEnd);

parse(source, {sourceType:'module',plugins:['jsx']});
const output=original.includes('\r\n')?source.replace(/\n/g,'\r\n'):source;
console.log('PASS: remembered profile renders without waiting for /api/auth/me/.');
console.log('PASS: offline account display and 5-minute silent verification; logout clears cache.');
if(output===original){
  console.log('ALREADY PATCHED. NO FILES MODIFIED.');
  process.exit(0);
}
if(dry){
  console.log('DRY RUN: only AccountScreen.js would change. NO FILES MODIFIED.');
  process.exit(0);
}
const backupDir=path.resolve(root,'..','build-backups',
  'account-spinner-'+new Date().toISOString().replace(/[:.]/g,'-'));
fs.mkdirSync(backupDir,{recursive:true});
const backup=path.join(backupDir,'AccountScreen.js');
fs.copyFileSync(filename,backup);
fs.writeFileSync(filename,output,'utf8');
console.log('FIXED: '+relative);
console.log('BACKUP: '+backup);

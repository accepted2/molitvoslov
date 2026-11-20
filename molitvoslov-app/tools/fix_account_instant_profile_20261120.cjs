#!/usr/bin/env node
'use strict';

// Repair repeated Account spinner without replacing the locally customized
// AccountScreen or altering any stored Google credentials and backend tokens.
const fs = require('node:fs');
const path = require('node:path');
const {parse} = require('@babel/parser');
const root = path.resolve(__dirname, '..');
const relative = 'src/screens/AccountScreen.js';
const filename = path.join(root, relative);
const original = fs.readFileSync(filename,'utf8');
let source = original.replace(/\r\n/g,'\n');
const dry = process.argv.includes('--dry-run');
const modified = [];

const patch = (before,after,label) => {
  if (source.includes(after)) return;
  const count = source.split(before).length-1;
  if (count !== 1) throw Error(label + ': local source mismatch ('+count+
    ' occurrences), NO FILES MODIFIED.');
  source=source.replace(before,after);
  modified.push(label);
};

const authImportOld = "from '../services/backendAuth';";
if (!source.includes(authImportOld)) throw Error('Missing backendAuth import. NO FILES MODIFIED.');
if (!source.includes('getCachedBackendUser') || !source.includes('getApiToken')) {
  const backendLine = source.split('\n').find(line =>
    line.startsWith('import ') && line.includes(authImportOld));
  if (!backendLine) throw Error('Unrecognized backendAuth import. NO FILES MODIFIED.');
  patch(backendLine,backendLine+
    "\nimport {getCachedBackendUser, getApiToken} from '../services/backendAuth';",
    'Add local-only auth imports');
}

const cacheHeader = "// The bottom navigation resets its stack when changing tabs, so AccountScreen\n// mounts again every time. Preserve only display state across those mounts;\n// SecureStore remains the source of truth for the actual session token.\nconst ACCOUNT_PROFILE_REFRESH_INTERVAL_MS = 5 * 60 * 1000;\nlet displayedAccountUser = null;\nlet accountCacheInitialized = false;\nlet lastProfileRefreshAt = 0;\nlet accountSessionVersion = 0;\n\nconst formatAccountUser = user => user?.id ? ({\n  id: user.id,\n  email: user.email,\n  name: user.name || user.first_name || user.username,\n  photo: user.picture_url || user.picture || user.photo || null,\n}) : null;\n\n";
if (!source.includes('const ACCOUNT_PROFILE_REFRESH_INTERVAL_MS =')) {
  patch('export const AccountScreen = ({navigation}) => {',
    cacheHeader + 'export const AccountScreen = ({navigation}) => {',
    'Remember profile across tab remounts');
}

patch(
  '  const [googleUser, setGoogleUser] = useState(null);',
  '  const [googleUser, setGoogleUser] = useState(() => displayedAccountUser);',
  'Instant cached profile');
patch(
  '  const [loading, setLoading] = useState(true);',
  '  const [loading, setLoading] = useState(() => !accountCacheInitialized);',
  'No spinner after first local session read');

const effect = "  useEffect(() => {\n    let active = true;\n    const version = accountSessionVersion;\n    const stillCurrent = () => active && version === accountSessionVersion;\n    const showUser = user => {\n      if (!stillCurrent()) return;\n      const display = formatAccountUser(user);\n      displayedAccountUser = display;\n      setGoogleUser(display);\n    };\n\n    const loadUser = async () => {\n      try {\n        // Restoring a stored profile is fast and local. A cached profile is\n        // never proof of an active session unless its token also exists.\n        const [token, cached] = await Promise.all([\n          getApiToken(),\n          getCachedBackendUser(),\n        ]);\n        if (!stillCurrent()) return;\n\n        accountCacheInitialized = true;\n        if (!token) {\n          lastProfileRefreshAt = 0;\n          showUser(null);\n          setLoading(false);\n          return;\n        }\n\n        if (cached?.id) showUser(cached);\n        setLoading(false);\n\n        // Backend verification is silent, not a blocking auth flow.\n        if (cached?.id &&\n            Date.now() - lastProfileRefreshAt < ACCOUNT_PROFILE_REFRESH_INTERVAL_MS) {\n          return;\n        }\n        try {\n          const backendUser = await getCurrentBackendUser();\n          if (!stillCurrent()) return;\n          if (backendUser?.id) {\n            lastProfileRefreshAt = Date.now();\n            showUser(backendUser);\n          } else {\n            // getCurrentBackendUser removes the token on HTTP 401/403.\n            // Do not display an old cached profile after invalidation.\n            const remainingToken = await getApiToken();\n            if (!stillCurrent()) return;\n            if (!remainingToken) {\n              lastProfileRefreshAt = 0;\n              showUser(null);\n            }\n          }\n        } catch (error) {\n          // Offline/slow Render must not hide an existing signed-in profile.\n          console.warn('[account] Background profile refresh deferred:',\n            error?.message || error);\n        }\n      } catch (error) {\n        if (!stillCurrent()) return;\n        console.warn('[account] Local session restore failed:',\n          error?.message || error);\n        accountCacheInitialized = true;\n        setLoading(false);\n      }\n    };\n\n    loadUser();\n    return () => { active = false; };\n  }, []);\n";
if (!source.includes('[account] Background profile refresh deferred:')) {
  const begin = source.indexOf("  useEffect(() => {\n    const loadUser = async () => {");
  const end = source.indexOf('\n  const googleLogin = async () => {',begin);
  if (begin<0 || end<=begin) throw Error(
    'Unrecognized local account loading effect; NO FILES MODIFIED');
  const oldEffect=source.slice(begin,end);
  if (!oldEffect.includes('await getCurrentBackendUser()') ||
      !oldEffect.includes('setLoading(false)')) throw Error(
        'Unexpected account loading logic; NO FILES MODIFIED');
  source=source.slice(0,begin)+effect+source.slice(end);
  modified.push('Local profile first; nonblocking 5-minute validation');
}

const originalLogin = '      setGoogleUser(googleResult.user);\n' +
  '      await adoptAnonymousLocalData(googleResult.user.id);';
const newLogin = "      accountSessionVersion += 1;\n      accountCacheInitialized = true;\n      displayedAccountUser = formatAccountUser(googleResult.user);\n      lastProfileRefreshAt = Date.now();\n      setGoogleUser(displayedAccountUser);\n      setLoading(false);\n      await adoptAnonymousLocalData(googleResult.user.id);";
patch(originalLogin,newLogin,'Update cache on Google login');

if (!source.includes("displayedAccountUser = null;\n        lastProfileRefreshAt = 0;\n        setGoogleUser(null);")) {
  const index=source.indexOf('await deleteBackendAccount()');
  if(index>=0) {
    const resetIndex=source.indexOf('        setGoogleUser(null);', index);
    if(resetIndex<index || resetIndex>index+650) throw Error(
      'Unknown delete account success block; NO FILES MODIFIED');
    source=source.slice(0,resetIndex) + "        accountSessionVersion += 1;\n        accountCacheInitialized = true;\n        displayedAccountUser = null;\n        lastProfileRefreshAt = 0;\n        setGoogleUser(null);" +
      source.slice(resetIndex+'        setGoogleUser(null);'.length);
    modified.push('Invalidate cache after account deletion');
  }
}

const oldLogout = "    } finally {\n      setGoogleUser(null);\n    }\n  };";
const newLogout = "    } finally {\n      accountSessionVersion += 1;\n      accountCacheInitialized = true;\n      displayedAccountUser = null;\n      lastProfileRefreshAt = 0;\n      setGoogleUser(null);\n      setLoading(false);\n    }\n  };";
patch(oldLogout,newLogout,'Invalidate cache after explicit logout');

parse(source,{sourceType:'module',plugins:['jsx']});
for (const required of ['getCachedBackendUser','getApiToken',
  'ACCOUNT_PROFILE_REFRESH_INTERVAL_MS','lastProfileRefreshAt',
  'accountSessionVersion += 1','setLoading(false)']) {
  if (!source.includes(required)) throw Error(
    'Failed account invariant: '+required+'; NO FILES MODIFIED.');
}

const output=original.includes('\r\n') ? source.replace(/\n/g,'\r\n') : source;
console.log('PREFLIGHT PASS: cached profile shown immediately on tab remount.');
console.log('PASS: backend auth/me refreshed silently at most once per five minutes.');
console.log('PASS: Google login/logout and account deletion invalidate screen cache.');
console.log('CHANGES: '+(modified.join('; ')||'already applied'));
if (output === original) {
  console.log('ALREADY APPLIED. NO FILES MODIFIED.');
  process.exit(0);
}
if (dry) {
  console.log('DRY RUN: only '+relative+' would change. NO FILES MODIFIED.');
  process.exit(0);
}
const backupDir=path.resolve(root,'..','build-backups',
  'account-no-spinner-'+new Date().toISOString().replace(/[:.]/g,'-'));
fs.mkdirSync(backupDir,{recursive:true});
const backup=path.join(backupDir,'AccountScreen.js');
fs.copyFileSync(filename,backup);
fs.writeFileSync(filename,output,'utf8');
console.log('UPDATED: '+relative);
console.log('BACKUP: '+backup);

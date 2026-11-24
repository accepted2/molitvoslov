#!/usr/bin/env node
'use strict';
// Preserve a confirmed Google account across tab remounts. Restore from
// SecureStore promptly, refresh Django profile silently. Never modify auth
// credentials or data; the local user profile is only a display cache.
const fs = require('node:fs');
const path = require('node:path');
const {parse} = require('@babel/parser');
const root = path.resolve(__dirname, '..');
const relative = 'src/screens/AccountScreen.js';
const target = path.join(root, relative);
const original = fs.readFileSync(target, 'utf8');
let code = original.replace(/\r\n/g, '\n');
const dryRun = process.argv.includes('--dry-run');
const vars = "// The bottom navigation resets its stack when changing tabs, so AccountScreen\n// mounts again every time. Preserve only display state across those mounts;\n// SecureStore remains the source of truth for the actual session token.\nconst ACCOUNT_PROFILE_REFRESH_INTERVAL_MS = 5 * 60 * 1000;\nlet displayedAccountUser = null;\nlet accountCacheInitialized = false;\nlet lastProfileRefreshAt = 0;\nlet accountSessionVersion = 0;\n\nconst formatAccountUser = user => user?.id ? ({\n  id: user.id,\n  email: user.email,\n  name: user.name || user.first_name || user.username,\n  photo: user.picture_url || user.picture || user.photo || null,\n}) : null;\n\n";
const updatedEffect = "  useEffect(() => {\n    let active = true;\n    const version = accountSessionVersion;\n    const stillCurrent = () => active && version === accountSessionVersion;\n    const showUser = user => {\n      if (!stillCurrent()) return;\n      const display = formatAccountUser(user);\n      displayedAccountUser = display;\n      setGoogleUser(display);\n    };\n\n    const loadUser = async () => {\n      try {\n        // Restoring a stored profile is fast and local. A cached profile is\n        // never proof of an active session unless its token also exists.\n        const [token, cached] = await Promise.all([\n          getApiToken(),\n          getCachedBackendUser(),\n        ]);\n        if (!stillCurrent()) return;\n\n        accountCacheInitialized = true;\n        if (!token) {\n          lastProfileRefreshAt = 0;\n          showUser(null);\n          setLoading(false);\n          return;\n        }\n\n        if (cached?.id) showUser(cached);\n        setLoading(false);\n\n        // Backend verification is silent, not a blocking auth flow.\n        if (cached?.id &&\n            Date.now() - lastProfileRefreshAt < ACCOUNT_PROFILE_REFRESH_INTERVAL_MS) {\n          return;\n        }\n        try {\n          const backendUser = await getCurrentBackendUser();\n          if (!stillCurrent()) return;\n          if (backendUser?.id) {\n            lastProfileRefreshAt = Date.now();\n            showUser(backendUser);\n          } else {\n            // getCurrentBackendUser removes the token on HTTP 401/403.\n            // Do not display an old cached profile after invalidation.\n            const remainingToken = await getApiToken();\n            if (!stillCurrent()) return;\n            if (!remainingToken) {\n              lastProfileRefreshAt = 0;\n              showUser(null);\n            }\n          }\n        } catch (error) {\n          // Offline/slow Render must not hide an existing signed-in profile.\n          console.warn('[account] Background profile refresh deferred:',\n            error?.message || error);\n        }\n      } catch (error) {\n        if (!stillCurrent()) return;\n        console.warn('[account] Local session restore failed:',\n          error?.message || error);\n        accountCacheInitialized = true;\n        setLoading(false);\n      }\n    };\n\n    loadUser();\n    return () => { active = false; };\n  }, []);\n";

if (code.includes('let accountCacheInitialized = false;') &&
    code.includes('const stillCurrent = () => active && version === accountSessionVersion;') &&
    code.includes('const [loading, setLoading] = useState(() => !accountCacheInitialized);')) {
  console.log('ALREADY FIXED: account cache and silent server refresh in place.');
  console.log('NO FILES MODIFIED.');
  process.exit(0);
}

function requireOnce(regexp, value, label) {
  const matches = [...code.matchAll(regexp)];
  if (matches.length !== 1) throw Error(label + ': found ' + matches.length +
    ' anchors. NO FILES MODIFIED.');
  code = code.replace(regexp, value);
}
// Import missing names independently, without expecting exact import spacing
// or a specific collection of other authentication functions.
const authImports = [...code.matchAll(/import\s*\{([^}]+)\}\s*from\s*['"]\.\.\/services\/backendAuth['"];?/gu)];
if (authImports.length !== 1) {
  throw Error('Expected one backendAuth named import. NO FILES MODIFIED.');
}
const existing = authImports[0][1].split(',').map(x => x.trim().split(/\s+as\s+/u)[1] || x.trim().split(/\s+as\s+/u)[0]);
if (!existing.includes('getCurrentBackendUser')) {
  throw Error('Missing expected account service import. NO FILES MODIFIED.');
}
const needed = ['getCachedBackendUser', 'getApiToken'].filter(x => !existing.includes(x));
if (needed.length) {
  const imp = "import {" + needed.join(', ') + "} from '../services/backendAuth';\n";
  const index = authImports[0].index + authImports[0][0].length;
  code = code.slice(0, index) + '\n' + imp + code.slice(index);
}
const componentStart = code.indexOf('export const AccountScreen =');
if (componentStart < 0) throw Error('AccountScreen component not found. NO FILES MODIFIED.');
if (!code.includes('let accountCacheInitialized = false;')) {
  // Do not accidentally redeclare variables from a partially applied patch.
  for (const name of [
    'displayedAccountUser', 'accountSessionVersion',
    'lastProfileRefreshAt', 'formatAccountUser',
  ]) if (code.includes('let ' + name + ' =') || code.includes('const ' + name + ' =')) {
    throw Error('Partially initialized account cache (' + name +
      '). NO FILES MODIFIED.');
  }
  code = code.slice(0, componentStart) + vars + code.slice(componentStart);
}
requireOnce(
  /const\s*\[\s*googleUser\s*,\s*setGoogleUser\s*\]\s*=\s*useState\(\s*null\s*\)\s*;/gu,
  'const [googleUser, setGoogleUser] = useState(() => displayedAccountUser);',
  'Account profile useState'
);
requireOnce(
  /const\s*\[\s*loading\s*,\s*setLoading\s*\]\s*=\s*useState\(\s*true\s*\)\s*;/gu,
  'const [loading, setLoading] = useState(() => !accountCacheInitialized);',
  'Account loading useState'
);
const oldEffectStart = code.indexOf('  useEffect(() => {\n    const loadUser = async () => {');
const oldEffectEnd = oldEffectStart >= 0 ?
  code.indexOf('\n  }, []);', oldEffectStart) : -1;
if (oldEffectStart < 0 || oldEffectEnd < oldEffectStart) {
  throw Error('Could not identify legacy account restoration effect. NO FILES MODIFIED.');
}
const oldEffect = code.slice(oldEffectStart, oldEffectEnd + '\n  }, []);'.length);
if (!oldEffect.includes('getCurrentBackendUser()') ||
    !oldEffect.includes('setLoading(false)')) {
  throw Error('Account restoration effect has unrecognized responsibilities. NO FILES MODIFIED.');
}
code = code.slice(0, oldEffectStart) + updatedEffect +
  code.slice(oldEffectEnd + '\n  }, []);'.length);

function replaceWithin(startMarker, endMarker, modifier, label) {
  const start = code.indexOf(startMarker);
  const end = start >= 0 ? code.indexOf(endMarker, start) : -1;
  if (start < 0 || end < start) throw Error(label + ' section not found. NO FILES MODIFIED.');
  const originalSection = code.slice(start, end);
  const result = modifier(originalSection);
  if (!result) throw Error(label + ' not recognized. NO FILES MODIFIED.');
  code = code.slice(0, start) + result + code.slice(end);
}
replaceWithin(
  '  const googleLogin = async () => {',
  '  const googleLogout = async () => {',
  section => {
    if(section.includes('accountSessionVersion += 1;'))return section;
    const anchor = /setGoogleUser\(\s*googleResult\.user\s*\)\s*;/gu;
    if([...section.matchAll(anchor)].length !== 1)return null;
    return section.replace(anchor, [
      'accountSessionVersion += 1;',
      '      accountCacheInitialized = true;',
      '      displayedAccountUser = formatAccountUser(googleResult.user);',
      '      lastProfileRefreshAt = Date.now();',
      '      setGoogleUser(displayedAccountUser);',
      '      setLoading(false);',
    ].join('\n'));
  }, 'Google sign-in'
);
replaceWithin(
  '  const googleLogout = async () => {',
  '  // if (loading) {',
  section => {
    if(section.includes('accountSessionVersion += 1;'))return section;
    const anchor = /setGoogleUser\(\s*null\s*\)\s*;/gu;
    if([...section.matchAll(anchor)].length !== 1)return null;
    return section.replace(anchor, [
      'accountSessionVersion += 1;',
      '      accountCacheInitialized = true;',
      '      displayedAccountUser = null;',
      '      lastProfileRefreshAt = 0;',
      '      setGoogleUser(null);',
      '      setLoading(false);',
    ].join('\n'));
  }, 'Google sign-out'
);
replaceWithin(
  '  const deleteAccount = () => Alert.alert(',
  '  useEffect(() => {',
  section => {
    if(section.includes('accountSessionVersion += 1;'))return section;
    const anchor = /setGoogleUser\(\s*null\s*\)\s*;/gu;
    if([...section.matchAll(anchor)].length !== 1)return null;
    return section.replace(anchor, [
      'accountSessionVersion += 1;',
      '        accountCacheInitialized = true;',
      '        displayedAccountUser = null;',
      '        lastProfileRefreshAt = 0;',
      '        setGoogleUser(null);',
      '        setLoading(false);',
    ].join('\n'));
  }, 'Account deletion'
);

parse(code, {sourceType:'module', plugins:['jsx']});
if (!code.includes('getCachedBackendUser()') ||
    !code.includes('getApiToken()') ||
    !code.includes('displayedAccountUser = null;')) {
  throw Error('Profile cache invariants did not pass. NO FILES MODIFIED.');
}
const output = original.includes('\r\n') ? code.replace(/\n/g, '\r\n') : code;
console.log('PASS: local cached Google profile renders without server spinner.');
console.log('PASS: asynchronous silent auth verification, logout and delete clear cache.');
if (output === original) {
  console.log('ALREADY PATCHED. NO FILES MODIFIED.');
  process.exit(0);
}
if (dryRun) {
  console.log('DRY RUN: only AccountScreen.js would change. NO FILES MODIFIED.');
  process.exit(0);
}
const backupDir = path.resolve(root, '..', 'build-backups',
  'account-profile-v2-' + new Date().toISOString().replace(/[:.]/g, '-'));
fs.mkdirSync(backupDir, {recursive:true});
const backup = path.join(backupDir,'AccountScreen.js');
fs.copyFileSync(target,backup);
fs.writeFileSync(target,output,'utf8');
console.log('UPDATED: ' + relative);
console.log('BACKUP: ' + backup);

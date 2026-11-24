'use strict';
// Safe local APK version bump to 1.0.32 (33).
// Accept only 1.0.30 (31) or 1.0.31 (32). Preserve unrelated local edits.
const fs=require('fs'), path=require('path');
const root=path.resolve(__dirname,'..');
const appFile=path.join(root,'app.json');
const nativeFile=path.join(root,'android/app/build.gradle');
const originalApp=fs.readFileSync(appFile,'utf8');
const originalNative=fs.readFileSync(nativeFile,'utf8');
const app=JSON.parse(originalApp);
const oldVer=String(app.expo?.version);
const oldCode=Number(app.expo?.android?.versionCode);
const id=String(app.expo?.android?.package);
if(id!=='com.accepted2.molitvoslov')throw Error('Unexpected Android package; no changes made');
const codeRegex=/(^[ \t]*versionCode[ \t]+)([0-9]+)\b/m;
const verRegex=/(^[ \t]*versionName[ \t]+["'])([^"']+)(["'])/m;
const nativeCode=originalNative.match(codeRegex)?.[2];
const nativeVer=originalNative.match(verRegex)?.[2];
if(nativeCode!==String(oldCode)||nativeVer!==oldVer){
 throw Error('app.json and Gradle versions differ. No changes made: '+oldVer+'/'+oldCode+
 ' vs '+nativeVer+'/'+nativeCode);
}
if(oldVer==='1.0.32'&&oldCode===33){
 console.log('PASS: version 1.0.32 (33) already installed in source.');
 process.exit(0);
}
if(!((oldVer==='1.0.30'&&oldCode===31)||
    (oldVer==='1.0.31'&&oldCode===32))){
 throw Error('Unexpected local version '+oldVer+' ('+oldCode+'); refusing downgrade.');
}
const jsonVersion=new RegExp('("version"\\s*:\\s*")'+oldVer.replace(/\./g,'\\.')+'(")');
const jsonCode=new RegExp('("versionCode"\\s*:\\s*)'+oldCode+'\\b');
if([...originalApp.matchAll(new RegExp(jsonVersion.source,'g'))].length!==1 ||
   [...originalApp.matchAll(new RegExp(jsonCode.source,'g'))].length!==1 ||
   [...originalNative.matchAll(new RegExp(codeRegex.source,'gm'))].length!==1 ||
   [...originalNative.matchAll(new RegExp(verRegex.source,'gm'))].length!==1){
 throw Error('Could not identify unique version fields safely.');
}
const updatedApp=originalApp.replace(jsonVersion,(_m,a,b)=>a+'1.0.32'+b)
  .replace(jsonCode,(_m,prefix)=>prefix+'33');
const updatedNative=originalNative.replace(codeRegex,(_m,prefix)=>prefix+'33')
 .replace(verRegex,(_m,prefix,_ver,suffix)=>prefix+'1.0.32'+suffix);
if(JSON.parse(updatedApp).expo.version!=='1.0.32'||
 JSON.parse(updatedApp).expo.android.versionCode!==33 ||
 !/versionCode\s+33\b/.test(updatedNative)||!/versionName\s+["']1\.0\.32["']/.test(updatedNative)){
 throw Error('Version candidate failed validation; no files modified.');
}
const backup=path.resolve(root,'..','build-backups',
 'cold-start-version-'+new Date().toISOString().replace(/[:.]/g,'-'));
fs.mkdirSync(backup,{recursive:true});
fs.copyFileSync(appFile,path.join(backup,'app.json'));
fs.copyFileSync(nativeFile,path.join(backup,'build.gradle'));
try{
 fs.writeFileSync(appFile,updatedApp,'utf8');
 fs.writeFileSync(nativeFile,updatedNative,'utf8');
}catch(e){
 fs.writeFileSync(appFile,originalApp,'utf8');
 fs.writeFileSync(nativeFile,originalNative,'utf8');
 throw e;
}
console.log('PASS: local test APK version 1.0.32 (33).');
console.log('Backup:',backup);

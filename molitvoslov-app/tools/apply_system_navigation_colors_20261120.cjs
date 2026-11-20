#!/usr/bin/env node
'use strict';
// Existing Android native theme: dark brown bar, light OS-owned buttons.
// Does not regenerate Android, replace user files, or touch personal data.
const fs = require('node:fs');
const path = require('node:path');
const {parse} = require('@babel/parser');
const root = path.resolve(__dirname, '..');
const xmlPath = path.join(root,'android/app/src/main/res/values/styles.xml');
const appPath = path.join(root,'App.js');
const componentPath = path.join(root,'src/components/navigation/SystemNavigationBackdrop.js');
const dry = process.argv.includes('--dry-run');
if (!fs.existsSync(xmlPath) || !fs.existsSync(componentPath)) {
  throw Error('Native styles.xml or SystemNavigationBackdrop.js missing. NO FILES MODIFIED.');
}
const changes=[];
const original=fs.readFileSync(appPath,'utf8');
let js=original.replace(/\r\n/g,'\n');
const imp="import {SystemNavigationBackdrop} from './src/components/navigation/SystemNavigationBackdrop';";
if (!js.includes(imp)) {
  const marker="import {PrayerBeadsPreviewScreen} from './src/components/feedback/PrayerBeadsPreviewScreen';";
  if(js.split(marker).length!==2)throw Error('App.js import changed. NO FILES MODIFIED.');
  js=js.replace(marker,marker+'\n'+imp);
}
if (!js.includes('<SystemNavigationBackdrop />')) {
  const marker='          <ShareFeedbackHost />';
  if(js.split(marker).length!==2)throw Error('App.js layout changed. NO FILES MODIFIED.');
  js=js.replace(marker,marker+'\n          <SystemNavigationBackdrop />');
}
parse(js,{sourceType:'module',plugins:['jsx']});
const result=original.includes('\r\n')?js.replace(/\n/g,'\r\n'):js;
if(result!==original)changes.push({path:appPath,name:'App.js',result});
const xml=fs.readFileSync(xmlPath,'utf8');
const eol=xml.includes('\r\n')?'\r\n':'\n';
const matches=[...xml.matchAll(/<style\b(?=[^>]*\bname=["']AppTheme["'])[^>]*>[\s\S]*?<\/style>/gu)];
if(matches.length!==1)throw Error('Exactly one AppTheme expected. NO FILES MODIFIED.');
let section=matches[0][0];
const desired={
  'android:navigationBarColor':'#4D3020',
  'android:windowLightNavigationBar':'false',
  'android:enforceNavigationBarContrast':'false'
};
for(const [attr,val] of Object.entries(desired)){
  const itemReg=new RegExp("<item\\s+name=[\\x22\\x27]"+attr+
    "[\\x22\\x27][^>]*>[\\s\\S]*?<\\/item>",'gu');
  const count=[...section.matchAll(itemReg)].length;
  if(count>1)throw Error('Duplicate AppTheme attribute: '+attr+'. NO FILES MODIFIED.');
  const entry='<item name="'+attr+'">'+val+'</item>';
  if(count) section=section.replace(itemReg,entry);
  else section=section.replace('</style>','    '+entry+eol+'  </style>');
}
const xmlNext=xml.slice(0,matches[0].index)+section+
  xml.slice(matches[0].index+matches[0][0].length);
if(xmlNext!==xml)changes.push({path:xmlPath,name:'styles.xml',result:xmlNext});
console.log('PASS: Android system buttons use light appearance on a brown backdrop.');
console.log('Android 15+ may apply automatic contrast, depending on system mode.');
console.log('CHANGES: '+(changes.map(c=>c.name).join(', ')||'none'));
if(!changes.length){console.log('ALREADY APPLIED. NO FILES MODIFIED.');process.exit(0);}
if(dry){console.log('DRY RUN. NO FILES MODIFIED.');process.exit(0);}
const backup=path.resolve(root,'..','build-backups','android-system-nav-'+
  new Date().toISOString().replace(/[:.]/g,'-'));
fs.mkdirSync(backup,{recursive:true});
for(const change of changes)fs.copyFileSync(change.path,path.join(backup,change.name));
for(const change of changes){
  fs.writeFileSync(change.path,change.result,'utf8');
  console.log('UPDATED: '+change.name);
}
console.log('BACKUP: '+backup);

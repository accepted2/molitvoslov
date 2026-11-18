#!/usr/bin/env node
'use strict';
// Adjust only the pure-JS reminder regression test for the actual SDK 57
// Android sound contract. Android content.sound === true; the notification
// channel has no literal "default" custom-sound setting. In the test mock,
// Android's getNotificationChannelAsync returns the resolved default sound.
// No production reminders, notification schedules, or user data are modified.
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const file=path.join(root,'tools/test_local_prayer_reminders_20261117.js');
const raw=fs.readFileSync(file,'utf8');
const bom=raw.startsWith('\uFEFF')?'\uFEFF':'';
let source=raw.slice(bom.length).replace(/\r\n/g,'\n');
const marker='MOLITVOSLOV_SDK57_ANDROID_REMINDER_SOUND_TEST_V1';
if(source.includes(marker)){
 console.log('PASS: SDK 57 reminders test already updated. NO FILES MODIFIED.');
 process.exit(0);
}
const changes=[
  {
    old:'const channels = new Map();',
    now:'const channels = new Map();\n'+
        'const requestedChannels = new Map(); // '+marker,
  },
  {
    old:'  setNotificationChannelAsync: async (id, options) => { channels.set(id, options); },',
    now:[
      '  setNotificationChannelAsync: async (id, options) => {',
      '    requestedChannels.set(id, options);',
      "    // Simulate Android's read-back of an unmodified default channel sound.",
      '    channels.set(id, {...options, sound: Object.hasOwn(options, "sound")',
      '      ? options.sound : "default"});',
      '  },',
    ].join('\n'),
  },
  {
    old:"  assert.strictEqual([...scheduled.values()][0].content.sound, 'default');",
    now:"  assert.strictEqual([...scheduled.values()][0].content.sound, true);",
  },
  {
    old:"  assert.strictEqual(channels.get('prayer-reminders-audible-v2').sound, 'default');",
    now:[
      "  assert.strictEqual(Object.hasOwn(",
      "    requestedChannels.get('prayer-reminders-audible-v2'), 'sound'), false,",
      "    'Do not pass literal default as an Android custom channel sound');",
      "  assert.strictEqual(channels.get('prayer-reminders-audible-v2').sound, 'default',",
      "    'Android read-back can report the system default sound');",
    ].join('\n'),
  },
  {
    old:"  assert.strictEqual([...scheduled.values()].find(item => item.trigger.type === 'timeInterval').content.sound, 'default');",
    now:"  assert.strictEqual([...scheduled.values()].find(item => item.trigger.type === 'timeInterval').content.sound, true);",
  },
];
for(const [i,{old,now}] of changes.entries()){
 const found=source.split(old).length-1;
 if(found!==1)throw Error(
  'Local reminder test differs at change '+(i+1)+' (matches='+found+'). NO FILES MODIFIED.'
 );
 source=source.replace(old,now);
}
// Validate syntax without executing the async tests.
new Function(source);
let out=bom+source;
if(raw.includes('\r\n'))out=out.replace(/\n/g,'\r\n');
if(process.argv.includes('--dry-run')){
 console.log('DRY RUN PASS: corrected Android sound expectations. NO FILES MODIFIED.');
 process.exit(0);
}
const backupDir=path.resolve(root,'..','build-backups','reminder-test-sound-before-'
 +new Date().toISOString().replace(/[:.]/g,'-'));
fs.mkdirSync(backupDir,{recursive:true});
fs.copyFileSync(file,path.join(backupDir,'test_local_prayer_reminders_20261117.js'));
fs.writeFileSync(file,out,'utf8');
console.log('PASS: reminders test now checks Android sound:true and default channel behavior.');
console.log('BACKUP: '+backupDir);

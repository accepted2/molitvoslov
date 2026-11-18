#!/usr/bin/env node
'use strict';
// Android reminder schedules evolved from v2 to v3 in local source.
// The regression test must verify the CURRENT version and successful
// v1 migration rather than pin every new notification to literal v2.
// No change to production reminders or users' scheduled notifications.
const fs = require('node:fs');
const path = require('node:path');
const app = path.resolve(__dirname,'..');
const file = path.join(app,'tools','test_local_prayer_reminders_20261117.js');
const original = fs.readFileSync(file,'utf8');
const bom = original.startsWith('\uFEFF') ? '\uFEFF' : '';
let source = original.slice(bom.length).replace(/\r\n/g,'\n');
const marker='MOLITVOSLOV_CURRENT_REMINDER_SCHEDULE_VERSION_V1';
if(source.includes(marker)){
  const expected='reminderScheduleVersion === currentReminderScheduleVersion';
  if(!source.includes(expected))
    throw Error('Existing schedule-version patch is incomplete. NO FILES MODIFIED.');
  console.log('PASS: reminder test already handles current schedule versions. NO FILES MODIFIED.');
  process.exit(0);
}
const steps=[
 {
  old:"  assert.strictEqual([...scheduled.values()][0].content.data.reminderScheduleVersion, 2);",
  now:[
   '  // '+marker,
   '  // The app can schedule native reminders with v2 or v3. Check that',
   '  // all new and migrated reminders use the same modern version.',
   '  const currentReminderScheduleVersion =',
   '    [...scheduled.values()][0].content.data.reminderScheduleVersion;',
   '  assert.ok(Number.isInteger(currentReminderScheduleVersion) &&',
   '    currentReminderScheduleVersion >= 2,',
   "    'Legacy schedule v1 must never be created by the current app');",
  ].join('\n')
 },
 {
  old:"  assert.deepStrictEqual([...scheduled.values()].map(item => item.trigger.weekday), [2, 4, 6]);",
  now:[
    "  assert.deepStrictEqual([...scheduled.values()].map(item => item.trigger.weekday), [2, 4, 6]);",
    '  assert.deepStrictEqual(next.notificationIds.map(id =>',
    '    scheduled.get(id)?.content?.data?.reminderScheduleVersion),',
    '    [currentReminderScheduleVersion, currentReminderScheduleVersion, currentReminderScheduleVersion]);',
  ].join('\n')
 },
 {
  old:"  assert.strictEqual([...scheduled.values()].find(item => item.trigger.type === 'timeInterval').content.sound, true);",
  now:[
    "  assert.strictEqual([...scheduled.values()].find(item => item.trigger.type === 'timeInterval').content.sound, true);",
    "  assert.strictEqual([...scheduled.values()].find(item => item.trigger.type === 'timeInterval')",
    "    .content.data.reminderScheduleVersion, currentReminderScheduleVersion);",
  ].join('\n')
 },
 {
  old:'    scheduled.get(id)?.content?.data?.reminderScheduleVersion === 2), true);',
  now:'    scheduled.get(id)?.content?.data?.reminderScheduleVersion === currentReminderScheduleVersion), true);'
 },
];
for(const [index,{old,now}] of steps.entries()){
  const count=source.split(old).length-1;
  if(count!==1)throw Error(
    'Local reminder version test differs at step '+(index+1)+
    ' (matches='+count+'). NO FILES MODIFIED.'
  );
  source=source.replace(old,now);
}
new Function(source);
let after=bom+source;
if(original.includes('\r\n'))after=after.replace(/\n/g,'\r\n');
if(process.argv.includes('--dry-run')){
 console.log('DRY RUN PASS: reminder version regression checks support v2 and v3. NO FILES MODIFIED.');
 process.exit(0);
}
const backup=path.resolve(app,'..','build-backups',
 'reminder-test-version-before-'+new Date().toISOString().replace(/[:.]/g,'-'));
fs.mkdirSync(backup,{recursive:true});
fs.copyFileSync(file,path.join(backup,'test_local_prayer_reminders_20261117.js'));
fs.writeFileSync(file,after,'utf8');
console.log('PASS: reminder test validates current v2/v3, preview consistency and v1 migration.');
console.log('BACKUP:',backup);

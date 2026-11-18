#!/usr/bin/env node
'use strict';
// Applies only to the local reminders screen and native scheduling version.
// Keeps all existing reminders, user times and unrelated working-tree changes.
// Entire patch is validated first, with backups before any writing.
const fs = require('node:fs');
const path = require('node:path');
const parse = require('@babel/parser').parse;
const root = path.resolve(__dirname, '..');
const edits = [
  {
    name: 'src/screens/NotificationsScreen.js',
    steps: [
      {
        old: "  const [draft, setDraft] = useState(null);",
        now: "  const [draft, setDraft] = useState(null);\n  const [timePickerOpen, setTimePickerOpen] = useState(false);",
      },
      {
        old: [
          "  const openCreate = () => setDraft(initialDraft());",
          "  const openEdit = item => setDraft({",
          "    id: item.id, title: item.title, target: item.target, time: item.time,",
          "    days: [...item.days], enabled: item.enabled,",
          "  });",
          "  const changeDraft = update => setDraft(previous => ({...previous, ...update}));",
        ].join('\n'),
        now: [
          "  const openCreate = () => {",
          "    setTimePickerOpen(false);",
          "    setDraft(initialDraft());",
          "  };",
          "  const openEdit = item => {",
          "    setTimePickerOpen(false);",
          "    setDraft({",
          "      id: item.id, title: item.title, target: item.target, time: item.time,",
          "      days: [...item.days], enabled: item.enabled,",
          "    });",
          "  };",
          "  const changeDraft = update => setDraft(previous => ({...previous, ...update}));",
          "  // Clock controls avoid error-prone manual typing; +/-1 handles exact minutes.",
          "  const stepReminderTime = delta => setDraft(previous => {",
          "    if (!previous) return previous;",
          "    const safe = reminderTimeValid(previous.time) ? previous.time : '07:00';",
          "    const [hour, minute] = safe.split(':').map(Number);",
          "    const total = (hour * 60 + minute + delta + 1440) % 1440;",
          "    const nextHour = String(Math.floor(total / 60)).padStart(2, '0');",
          "    const nextMinute = String(total % 60).padStart(2, '0');",
          "    return {...previous, time: nextHour + ':' + nextMinute};",
          "  });",
        ].join('\n'),
      },
      {
        old: [
          '            <Text style={styles.fieldLabel}>Время</Text>',
          '            <TextInput',
          '              accessibilityLabel="Время в формате часы двоеточие минуты"',
          "              style={[styles.textInput, {width: 124, textAlign: 'center'}]}",
          '              value={draft.time}',
          '              maxLength={5} keyboardType="numbers-and-punctuation"',
          '              placeholder="07:00"',
          '              onChangeText={time => changeDraft({time})}',
          '            />',
        ].join('\n'),
        now: [
          '            <Text style={styles.fieldLabel}>Время</Text>',
          '            <Pressable accessibilityRole="button"',
          "              accessibilityLabel={'Выбрать время. Сейчас ' + draft.time}",
          '              accessibilityState={{expanded: timePickerOpen}}',
          '              onPress={() => setTimePickerOpen(value => !value)}',
          '              style={styles.timeSelector}>',
          '              <Feather name="clock" size={22} color={ACCENT} />',
          '              <Text style={styles.timeSelectorValue}>{draft.time}</Text>',
          '              <Feather name={timePickerOpen ? "chevron-up" : "chevron-down"} size={20} color={ACCENT} />',
          '            </Pressable>',
          '            {timePickerOpen && (',
          '              <View style={styles.timePanel}>',
          '                <Text style={styles.timePanelTitle}>Установите время</Text>',
          '                <View style={styles.clockRow}>',
          '                  <View style={styles.clockGroup}>',
          '                    <Text style={styles.clockCaption}>Часы</Text>',
          '                    <View style={styles.clockControls}>',
          '                      <Pressable accessibilityRole="button" accessibilityLabel="На час раньше"',
          '                        onPress={() => stepReminderTime(-60)} style={styles.clockStep}>',
          '                        <Feather name="minus" size={22} color={INK} />',
          '                      </Pressable>',
          '                      <Text style={styles.clockNumber}>{draft.time.slice(0, 2)}</Text>',
          '                      <Pressable accessibilityRole="button" accessibilityLabel="На час позже"',
          '                        onPress={() => stepReminderTime(60)} style={styles.clockStep}>',
          '                        <Feather name="plus" size={22} color={INK} />',
          '                      </Pressable>',
          '                    </View>',
          '                  </View>',
          '                  <Text style={styles.clockColon}>:</Text>',
          '                  <View style={styles.clockGroup}>',
          '                    <Text style={styles.clockCaption}>Минуты</Text>',
          '                    <View style={styles.clockControls}>',
          '                      <Pressable accessibilityRole="button" accessibilityLabel="На пять минут раньше"',
          '                        onPress={() => stepReminderTime(-5)} style={styles.clockStep}>',
          '                        <Feather name="minus" size={22} color={INK} />',
          '                      </Pressable>',
          '                      <Text style={styles.clockNumber}>{draft.time.slice(3, 5)}</Text>',
          '                      <Pressable accessibilityRole="button" accessibilityLabel="На пять минут позже"',
          '                        onPress={() => stepReminderTime(5)} style={styles.clockStep}>',
          '                        <Feather name="plus" size={22} color={INK} />',
          '                      </Pressable>',
          '                    </View>',
          '                  </View>',
          '                </View>',
          '                <View style={styles.fineTuneRow}>',
          '                  <Pressable accessibilityRole="button" onPress={() => stepReminderTime(-1)}',
          '                    style={styles.fineTuneButton}><Text style={styles.fineTuneText}>−1 мин</Text></Pressable>',
          '                  <Text style={styles.clockCaption}>Точная настройка</Text>',
          '                  <Pressable accessibilityRole="button" onPress={() => stepReminderTime(1)}',
          '                    style={styles.fineTuneButton}><Text style={styles.fineTuneText}>+1 мин</Text></Pressable>',
          '                </View>',
          '                <Text style={styles.clockCaption}>Быстрый выбор</Text>',
          '                <View style={styles.timePresets}>',
          "                  {['06:00', '07:00', '08:00', '09:00', '18:00', '20:00', '21:00'].map(time => (",
          '                    <Pressable key={time} accessibilityRole="button"',
          '                      accessibilityState={{selected: draft.time === time}}',
          '                      onPress={() => changeDraft({time})}',
          '                      style={[styles.timePreset, draft.time === time && styles.timePresetActive]}>',
          '                      <Text style={styles.timePresetText}>{time}</Text>',
          '                    </Pressable>',
          '                  ))}',
          '                </View>',
          '                <Pressable accessibilityRole="button" onPress={() => setTimePickerOpen(false)}',
          '                  style={styles.timeDone}><Text style={styles.timeDoneText}>Готово</Text></Pressable>',
          '              </View>',
          '            )}',
        ].join('\n'),
      },
      {
        old: "const styles = StyleSheet.create({\n  screen: {",
        now: [
          "const styles = StyleSheet.create({",
          "  timeSelector: {minHeight: 58, borderWidth: 1, borderColor: BORDER, borderRadius: 13,",
          "    backgroundColor: '#FCEDD5', paddingHorizontal: 18, flexDirection: 'row',",
          "    alignItems: 'center', gap: 14, alignSelf: 'flex-start', minWidth: 210},",
          "  timeSelectorValue: {fontSize: 29, fontWeight: '700', color: INK, minWidth: 91},",
          "  timePanel: {backgroundColor: '#F8E8CC', borderRadius: 15, borderWidth: 1,",
          "    borderColor: BORDER, padding: 14, marginTop: 10, gap: 12},",
          "  timePanelTitle: {fontSize: 16, fontWeight: '700', color: INK},",
          "  clockRow: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},",
          "  clockGroup: {flex: 1, alignItems: 'center', gap: 6},",
          "  clockCaption: {fontSize: 12, color: '#78583E', fontWeight: '600'},",
          "  clockControls: {width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},",
          "  clockStep: {width: 39, height: 46, alignItems: 'center', justifyContent: 'center',",
          "    backgroundColor: '#FCEDD5', borderRadius: 10},",
          "  clockNumber: {fontSize: 27, color: INK, fontWeight: '700'},",
          "  clockColon: {fontSize: 28, fontWeight: '700', color: ACCENT, marginTop: 18},",
          "  fineTuneRow: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},",
          "  fineTuneButton: {paddingVertical: 9, paddingHorizontal: 16, borderRadius: 9, backgroundColor: '#FCEDD5'},",
          "  fineTuneText: {fontSize: 14, color: INK, fontWeight: '600'},",
          "  timePresets: {flexDirection: 'row', flexWrap: 'wrap', gap: 7},",
          "  timePreset: {borderRadius: 10, borderWidth: 1, borderColor: BORDER, backgroundColor: '#FCEDD5',",
          "    paddingVertical: 10, paddingHorizontal: 12},",
          "  timePresetActive: {backgroundColor: '#E8CDA4', borderColor: ACCENT},",
          "  timePresetText: {fontSize: 14, fontWeight: '600', color: INK},",
          "  timeDone: {backgroundColor: ACCENT, alignItems: 'center', justifyContent: 'center',",
          "    minHeight: 44, borderRadius: 10},",
          "  timeDoneText: {color: '#FFF7E9', fontSize: 15, fontWeight: '700'},",
          "  screen: {",
        ].join('\n'),
      },
    ],
  },
  {
    name: 'src/services/localPrayerReminders.js',
    steps: [
      {
        old: 'reminderScheduleVersion: 2',
        now: 'reminderScheduleVersion: 3',
        repeat: 2,
      },
      {
        old: 'reminderScheduleVersion === 2',
        now: 'reminderScheduleVersion === 3',
        repeat: 2,
      },
    ],
  },
  {
    name: 'src/services/accountPreferencesSync.js',
    steps: [
      {
        old: "  if (!user?.id || !token) return {success: false, reason: 'no-user'};",
        now: [
          "  if (!user?.id) return {success: false, reason: 'no-user'};",
          "  if (!token) return {success: false, reason: 'reauth-required'};",
        ].join('\n'),
      },
      {
        old: [
          "      if (error?.code === 'reauth-required') {",
          "        return {success: false, reason: 'reauth-required'};",
          "      }",
          "      throw error;",
        ].join('\n'),
        now: [
          "      if (error?.code === 'reauth-required') {",
          "        return {success: false, reason: 'reauth-required'};",
          "      }",
          "      // Extra guard if an auth adapter throws the server detail directly.",
          "      // Do not suppress unrelated 403 or 503 errors.",
          "      if (/^(?:Недействительный токен|Invalid token)\.?$/i.test(",
          "        String(error?.message || '').trim())) {",
          "        return deleteApiToken().then(() => ({success: false, reason: 'reauth-required'}));",
          "      }",
          "      throw error;",
        ].join('\n'),
      },
    ],
  },
];
const nl = data => data.replace(/\r\n/g, '\n');
const plan = [];
for (const entry of edits) {
  const file = path.join(root, entry.name);
  const original = fs.readFileSync(file, 'utf8');
  const bom = original.startsWith('\uFEFF') ? '\uFEFF' : '';
  let output = nl(original.slice(bom.length));
  for (const step of entry.steps) {
    const oldCount = output.split(step.old).length - 1;
    const newCount = output.split(step.now).length - 1;
    const expected = step.repeat || 1;
    if (oldCount === expected && newCount === 0) {
      output = output.split(step.old).join(step.now);
    } else if (oldCount === 0 && newCount === expected) {
      // Already installed.
    } else if (!step.repeat && newCount === 1 && step.now.includes(step.old)) {
      // Insertion steps leave the old anchor inside the installed form.
    } else {
      throw new Error(entry.name + ': unexpected source near patch: ' + step.old.slice(0, 68) +
        '. NO FILES MODIFIED; do not overwrite your working tree.');
    }
  }
  parse(output, {sourceType: 'module', plugins: ['jsx']});
  if (entry.name.endsWith('NotificationsScreen.js')) {
    if (!output.includes('const stepReminderTime = delta =>') ||
      !output.includes('Точная настройка') ||
      output.includes('accessibilityLabel="Время в формате часы двоеточие минуты"')) {
      throw new Error(entry.name + ': time selector validation failed.');
    }
  }
  if (entry.name.endsWith('localPrayerReminders.js') &&
    ((output.match(/reminderScheduleVersion: 3/g) || []).length !== 2 ||
     (output.match(/reminderScheduleVersion === 3/g) || []).length !== 2)) {
    throw new Error(entry.name + ': schedule migration validation failed.');
  }
  let updated = bom + output;
  if (original.includes('\r\n')) updated = updated.replace(/\n/g, '\r\n');
  plan.push({file, name: entry.name, original, updated});
}
const changed = plan.filter(entry => entry.original !== entry.updated);
if (process.argv.includes('--dry-run')) {
  console.log('DRY RUN PASS: source parsed; would change: ' +
    (changed.map(entry => entry.name).join(', ') || 'nothing'));
  process.exit(0);
}
if (!changed.length) { console.log('PASS: time picker and alarm migration already installed.'); process.exit(0); }
const backupDir = path.resolve(root, '..', 'build-backups',
  'notification-time-ui-before-' + new Date().toISOString().replace(/[:.]/g, '-'));
fs.mkdirSync(backupDir, {recursive: true});
for (const entry of changed)
  fs.copyFileSync(entry.file, path.join(backupDir, entry.name.replace(/[\\/]/g, '__')));
const written = [];
try {
  for (const entry of changed) {
    fs.writeFileSync(entry.file, entry.updated, 'utf8');
    written.push(entry);
  }
} catch (error) {
  for (const entry of written) fs.writeFileSync(entry.file, entry.original, 'utf8');
  throw error;
}
console.log('PASS: time controls, native reminder v3 migration and re-login fallback installed.');
console.log('Changed:', changed.map(entry => entry.name).join(', '));
console.log('Backups:', backupDir);

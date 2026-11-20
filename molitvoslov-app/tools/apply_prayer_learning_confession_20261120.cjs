#!/usr/bin/env node
'use strict';
// Install the offline learning route and semantic confession grouping safely.
// Does not switch branches, overwrite prayer data or touch private notes.
const fs = require('node:fs');
const path = require('node:path');
const {parse} = require('@babel/parser');
const root = path.resolve(__dirname, '..');
const dry = process.argv.includes('--dry-run');
const edits = {"src/navigation/AppNavigator.js":[["import {ConfessionPreparationScreen} from '../screens/ConfessionPreparationScreen';","import {ConfessionPreparationScreen} from '../screens/ConfessionPreparationScreen';\nimport {PrayerLearningScreen} from '../screens/PrayerLearningScreen';"],["        <Stack.Screen\n          name=\"ConfessionPreparation\"\n          component={ConfessionPreparationScreen}\n          options={{\n            headerShown: false,\n          }}\n        />","        <Stack.Screen\n          name=\"ConfessionPreparation\"\n          component={ConfessionPreparationScreen}\n          options={{\n            headerShown: false,\n          }}\n        />\n        <Stack.Screen\n          name=\"PrayerLearning\"\n          component={PrayerLearningScreen}\n          options={{\n            headerShown: false,\n          }}\n        />"]],"src/screens/MenuScreen.js":[["    {key:'misc',title:t('menu.miscTitle'),subtitle:t('menu.miscSubtitle'),","    {key:'prayer-learning',title:'Учимся молиться',\n      subtitle:'Церковнославянская азбука, числа и наставления',\n      symbol:'Ѣ',iconSource:CATEGORY_ICONS.misc,artwork:homeArtwork.misc,\n      onPress:()=>navigation.navigate('PrayerLearning')},\n    {key:'misc',title:t('menu.miscTitle'),subtitle:t('menu.miscSubtitle'),"]],"src/screens/ConfessionPreparationScreen.js":[["import confessionDocument from '../data/confessionDocument.json';","import confessionDocument from '../data/confessionDocument.json';\nimport {buildSemanticConfessionDocument} from '../services/confessionSemanticGrouping';"],["const CATALOG_BY_ID = Object.fromEntries([\n  ...confessionCatalog.items,\n  ...confessionDocument.entries,\n].map(item => [item.id, item]));","const SEMANTIC_DOCUMENT = buildSemanticConfessionDocument(confessionDocument);\nconst CATALOG_BY_ID = Object.fromEntries([\n  ...confessionCatalog.items,\n  ...confessionDocument.entries,\n].map(item => [item.id, item]));\nfor (const [id, group] of Object.entries(SEMANTIC_DOCUMENT.lookup)) {\n  const original = CATALOG_BY_ID[id];\n  if (original && group.memberIds.length > 1) {\n    CATALOG_BY_ID[id] = {...original, title: group.title};\n  }\n}"],["const source = catalogMode ? confessionDocument.blocks : chosenEntries;","const source = catalogMode ? SEMANTIC_DOCUMENT.blocks : chosenEntries;"],["  const openSinMenu = useCallback(id => {\n    if (CATALOG_BY_ID[id]) setMenuSinId(id);\n  }, []);","  const openSinMenu = useCallback(id => {\n    const group = SEMANTIC_DOCUMENT.lookup[id];\n    const canonicalId = group?.id || id;\n    if (CATALOG_BY_ID[canonicalId]) setMenuSinId(canonicalId);\n  }, []);"],["    if (selectedRef.current.includes(menuSinId)) {\n      removeSelected(menuSinId);\n    } else {\n      addSelected(menuSinId);\n    }","    const ids = SEMANTIC_DOCUMENT.lookup[menuSinId]?.memberIds || [menuSinId];\n    const alreadyChosen = ids.filter(id => selectedRef.current.includes(id));\n    if (alreadyChosen.length) {\n      // Remove all selected legacy members only after explicit confirmation.\n      for (const id of alreadyChosen) removeSelected(id);\n    } else {\n      addSelected(menuSinId);\n    }"],["const menuAlreadySelected = !!menuSinId && selectedIds.includes(menuSinId);","const menuAlreadySelected = !!menuSinId &&\n    (SEMANTIC_DOCUMENT.lookup[menuSinId]?.memberIds || [menuSinId])\n      .some(id => selectedIds.includes(id));"],["const selected = selectedIds.includes(segment.id);","const selected = segment.memberIds.some(id => selectedIds.includes(id));"],["Нажмите на конкретное слово или выражение в тексте, чтобы добавить\n            этот грех в свой список.","Нажмите на смысловое выражение в тексте, чтобы добавить\n            этот пункт целиком, вместе с пояснениями, в свой список."]]};
const dependencies = [
  'src/screens/PrayerLearningScreen.js',
  'src/data/prayerLearningContent.js',
  'src/data/confessionSemanticGroups.json',
  'src/services/confessionSemanticGrouping.js',
];
for (const rel of dependencies) {
  if (!fs.existsSync(path.join(root, rel))) {
    throw Error('Missing dependency ' + rel + '; NO FILES MODIFIED.');
  }
}
const updated = [];
for (const [relative, patches] of Object.entries(edits)) {
  const file = path.join(root, relative);
  const original = fs.readFileSync(file, 'utf8');
  let source = original.replace(/\r\n/g, '\n');
  for (const [before, after] of patches) {
    if (source.includes(after)) continue;
    const matches = source.split(before).length - 1;
    if (matches !== 1) {
      throw Error(relative + ': unexpected anchor count ' + matches +
        ' for ' + before.slice(0, 75) + '. NO FILES MODIFIED.');
    }
    source = source.replace(before, after);
  }
  parse(source, {sourceType:'module', plugins:['jsx']});
  const output = original.includes('\r\n') ?
    source.replace(/\n/g, '\r\n') : source;
  if (original !== output) updated.push({file, relative, output});
}
console.log('PASS: lessons, navigation and confession grouping preflight.');
console.log('CHANGED: ' + (updated.map(x => x.relative).join(', ') || 'none'));
if (!updated.length) {
  console.log('ALREADY INSTALLED. NO FILES MODIFIED.');
  process.exit(0);
}
if (dry) {
  console.log('DRY RUN: NO FILES MODIFIED.');
  process.exit(0);
}
const dir = path.resolve(root, '..', 'build-backups',
  'learning-confession-' + new Date().toISOString().replace(/[:.]/g, '-'));
fs.mkdirSync(dir, {recursive:true});
// Back up every original file before making the first write.
for (const change of updated) {
  fs.copyFileSync(change.file,
    path.join(dir, path.basename(change.relative)));
}
for (const change of updated) {
  fs.writeFileSync(change.file, change.output, 'utf8');
  console.log('UPDATED: ' + change.relative);
}
console.log('BACKUP DIR: ' + dir);

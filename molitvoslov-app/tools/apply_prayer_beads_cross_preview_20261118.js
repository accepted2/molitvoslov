'use strict';
// Local safe upgrade for the loader with Orthodox cross and emulator preview.
// Designed to preserve unrelated local edits in PrayerBeadsLoader.js / App.js.
// All changes are validated before any write and originals are backed up.
const fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '..');
const patches = [{"path":"src/components/feedback/PrayerBeadsLoader.js","changes":[{"before":"        {!compact && (\n          <>\n            <View style={[styles.pendantLine, light && styles.pendantLineLight]} />\n            <Text style={[styles.cross, light && styles.crossLight]}>☦</Text>\n          </>\n        )}\n","after":"        {!compact && (\n          <>\n            <View style={[styles.pendantKnot, light && styles.pendantKnotLight]} />\n            <View style={[styles.pendantLine, light && styles.pendantLineLight]} />\n            <View\n              style={styles.cross}\n              accessible\n              accessibilityLabel=\"Православный крестик\"\n            >\n              <View style={[styles.crossStem, light && styles.crossLight]} />\n              <View style={[styles.crossTopBar, light && styles.crossLight]} />\n              <View style={[styles.crossMiddleBar, light && styles.crossLight]} />\n              <View style={[styles.crossFootBar, light && styles.crossLight]} />\n            </View>\n          </>\n        )}\n"},{"before":"    minHeight: 154,","after":"    minHeight: 182,"},{"before":"    height: 139,","after":"    height: 159,"},{"before":"  pendantLine: {\n    position: 'absolute',\n    top: 100,\n    left: 55.5,\n    width: 1,\n    height: 13,\n    backgroundColor: 'rgba(111, 71, 39, 0.48)',\n  },\n  pendantLineLight: {\n    backgroundColor: 'rgba(255, 239, 207, 0.55)',\n  },\n  cross: {\n    position: 'absolute',\n    top: 109,\n    left: 44,\n    width: 24,\n    textAlign: 'center',\n    color: '#8E5D32',\n    fontFamily: 'serif',\n    fontSize: 19,\n    lineHeight: 24,\n  },\n  crossLight: {\n    color: '#F3D89F',\n  },\n","after":"  pendantKnot: {\n    position: 'absolute',\n    top: 104,\n    left: 53.5,\n    width: 5,\n    height: 5,\n    borderRadius: 3,\n    borderWidth: 1,\n    borderColor: '#B98545',\n    backgroundColor: '#6D4223',\n  },\n  pendantKnotLight: {\n    borderColor: '#F0CF92',\n    backgroundColor: '#F7DFB4',\n  },\n  pendantLine: {\n    position: 'absolute',\n    top: 108,\n    left: 55,\n    width: 2,\n    height: 16,\n    backgroundColor: 'rgba(111, 71, 39, 0.72)',\n  },\n  pendantLineLight: {\n    backgroundColor: 'rgba(255, 239, 207, 0.75)',\n  },\n  // Draw the eight-point Orthodox cross with native Views so the symbol\n  // remains legible on Android even without an appropriate symbol font.\n  cross: {\n    position: 'absolute',\n    top: 121,\n    left: 43,\n    width: 26,\n    height: 35,\n  },\n  crossStem: {\n    position: 'absolute',\n    top: 1,\n    left: 12,\n    width: 2,\n    height: 32,\n    borderRadius: 1,\n    backgroundColor: '#B98545',\n  },\n  crossTopBar: {\n    position: 'absolute',\n    top: 6,\n    left: 8,\n    width: 10,\n    height: 2,\n    borderRadius: 1,\n    backgroundColor: '#B98545',\n  },\n  crossMiddleBar: {\n    position: 'absolute',\n    top: 15,\n    left: 3,\n    width: 20,\n    height: 2.5,\n    borderRadius: 1,\n    backgroundColor: '#B98545',\n  },\n  crossFootBar: {\n    position: 'absolute',\n    top: 25,\n    left: 5,\n    width: 16,\n    height: 2,\n    borderRadius: 1,\n    backgroundColor: '#B98545',\n    transform: [{rotate: '-20deg'}],\n  },\n  crossLight: {\n    backgroundColor: '#F3D89F',\n  },\n"}]},{"path":"App.js","changes":[{"before":"import {PrayerBeadsLoader} from './src/components/feedback/PrayerBeadsLoader';","after":"import {PrayerBeadsLoader} from './src/components/feedback/PrayerBeadsLoader';\nimport {PrayerBeadsPreviewScreen} from './src/components/feedback/PrayerBeadsPreviewScreen';"},{"before":"export default function App() {\n  const [databaseReady, setDatabaseReady] = useState(false);","after":"export default function App() {\n  // The endless loader preview is available only in an explicitly requested\n  // development session, never in a release APK.\n  const [previewOpen, setPreviewOpen] = useState(\n    __DEV__ && process.env.EXPO_PUBLIC_PRAYER_BEADS_PREVIEW === '1'\n  );\n  const [databaseReady, setDatabaseReady] = useState(false);"},{"before":"  if (!appReady || !minimumStartupElapsed) {\n    return <StartupLoadingScreen />;\n  }","after":"  if (__DEV__ && previewOpen) {\n    return <PrayerBeadsPreviewScreen onContinue={() => setPreviewOpen(false)} />;\n  }\n\n  if (!appReady || !minimumStartupElapsed) {\n    return <StartupLoadingScreen />;\n  }"}]}];

const previewSource = path.join(root, 'src/components/feedback/PrayerBeadsPreviewScreen.js');
if (!fs.existsSync(previewSource) ||
    !fs.readFileSync(previewSource, 'utf8').includes('PrayerBeadsPreviewScreen')) {
  throw Error('First restore src/components/feedback/PrayerBeadsPreviewScreen.js ' +
    'from the feature branch. No changes were made.');
}
function transform(original, patch) {
  let s = original.replace(/\r\n/g, '\n');
  for (const [i, change] of patch.changes.entries()) {
    const afterHits = s.split(change.after).length - 1;
    const beforeHits = s.split(change.before).length - 1;
    // Some replacement blocks deliberately retain their old import/return
    // as a prefix. Check the complete resulting block FIRST for idempotency.
    if (afterHits === 1) {
      continue;
    } else if (afterHits === 0 && beforeHits === 1) {
      s = s.replace(change.before, change.after);
    } else {
      throw Error(patch.path + ': different local code at change #' + (i + 1) +
        '; source files remain untouched. Send this error for safe merging.');
    }
  }
  return s.replace(/\n/g, original.includes('\r\n') ? '\r\n' : '\n');
}
const work = patches.map(patch => {
  const file = path.join(root, patch.path), original = fs.readFileSync(file, 'utf8');
  return {file,patch,original,updated:transform(original,patch)};
});
const pending = work.filter(item => item.original !== item.updated);
if (!pending.length) {
  console.log('PASS: Orthodox cross and emulator loader preview already installed.');
  process.exit(0);
}
const backupDir = path.resolve(root, '..', 'build-backups',
  'rosary-preview-before-' + new Date().toISOString().replace(/[:.]/g, '-'));
fs.mkdirSync(backupDir, {recursive:true});
for (const item of pending) {
  fs.copyFileSync(item.file,path.join(backupDir,item.patch.path.replace(/[\\/]/g,'__')));
}
const written = [];
try {
  for (const item of pending) {
    fs.writeFileSync(item.file,item.updated,'utf8');
    written.push(item);
  }
} catch (error) {
  for (const item of written) fs.writeFileSync(item.file,item.original,'utf8');
  throw error;
}
console.log('PASS: visible Orthodox cross and endless DEV-only preview installed.');
console.log('Updated:',pending.map(item => item.patch.path).join(', '));
console.log('Backups:',backupDir);

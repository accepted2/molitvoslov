#!/usr/bin/env node
'use strict';
// Safe patch installer for a divergent local Molitvoslov checkout.
// Applies only anchored quote UI/navigation changes; never replaces whole
// MenuScreen/FavoritesScreen files, and backs up every modified original.
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const patches={"src/screens/MenuScreen.js":[["import {getDailyQuote} from '../services/dailyQuote';","import {getDailyQuote} from '../services/dailyQuote';\nimport {resolveDailyQuoteSource, openDailyQuoteSource} from '../services/dailyQuoteNavigation';"],["const [dailyQuote, setDailyQuote] = useState(null);","const [dailyQuote, setDailyQuote] = useState(() => getDailyQuote());"],["        prayerRulesResponse,\n        quoteResponse,\n      ] = await Promise.all([","        prayerRulesResponse,\n      ] = await Promise.all(["],["        api.get('prayer-rules/'),\n        api.get('daily-quotes/today/'),","        api.get('prayer-rules/'),"],["      const quote = quoteResponse.data;","      const quote = getDailyQuote();"],["    useCallback(() => {\n      loadProgress();\n\n      if (dailyQuote?.id) {","    useCallback(() => {\n      loadProgress();\n      // Recalculate on returning to Home, including after midnight.\n      setDailyQuote(getDailyQuote());\n\n      if (dailyQuote?.id) {"],["          quote_date: dailyQuote.quote_date || dailyQuote.date || '',","          quote_date: dailyQuote.quote_date || dailyQuote.date || '',\n          quote_target: dailyQuote.target || null,\n          work: dailyQuote.work || '',"],["  const latestReading = activeReadings[0] || null;","  const latestReading = activeReadings[0] || null;\n  const dailyQuoteBibleTarget = resolveDailyQuoteSource(dailyQuote);"],["                    'rgba(52, 30, 17, 0)',\n                    'rgba(52, 30, 17, 0.48)',\n                    'rgba(52, 30, 17, 0.66)',\n                    'rgba(52, 30, 17, 0.48)',\n                    'rgba(52, 30, 17, 0)',","                    'rgba(27, 18, 12, 0.08)',\n                    'rgba(27, 18, 12, 0.66)',\n                    'rgba(27, 18, 12, 0.78)',\n                    'rgba(27, 18, 12, 0.66)',\n                    'rgba(27, 18, 12, 0.08)',"],["                    'rgba(52, 30, 17, 0)',\n                    'rgba(52, 30, 17, 0.18)',\n                    'rgba(52, 30, 17, 0.28)',\n                    'rgba(52, 30, 17, 0.18)',\n                    'rgba(52, 30, 17, 0)',","                    'rgba(27, 18, 12, 0.08)',\n                    'rgba(27, 18, 12, 0.52)',\n                    'rgba(27, 18, 12, 0.70)',\n                    'rgba(27, 18, 12, 0.55)',\n                    'rgba(27, 18, 12, 0.12)',"],["                    <Text style={styles.heroQuoteText}>","                    <Text style={styles.heroQuoteText} numberOfLines={5}\n                      adjustsFontSizeToFit minimumFontScale={0.84}>"],["                  <Text style={styles.heroQuoteSource}>\n                    {getLocalizedField(dailyQuote, 'reference', calendarLanguage) ||\n                      getLocalizedField(dailyQuote, 'source', calendarLanguage)}\n                  </Text>","                  <Pressable\n                    accessibilityRole={dailyQuoteBibleTarget ? 'link' : undefined}\n                    accessibilityLabel={dailyQuoteBibleTarget ? 'Открыть источник цитаты в Библии' : undefined}\n                    disabled={!dailyQuoteBibleTarget}\n                    hitSlop={6}\n                    onPress={() => openDailyQuoteSource(navigation, dailyQuote)}\n                  >\n                    <Text style={[styles.heroQuoteSource,\n                      dailyQuoteBibleTarget && styles.heroQuoteSourceLink]}>\n                      {getLocalizedField(dailyQuote, 'reference', calendarLanguage) ||\n                        getLocalizedField(dailyQuote, 'source', calendarLanguage)}\n                    </Text>\n                  </Pressable>"],["<SaveHeartIcon active={!!savedDailyQuote} size={20} tintColor=\"#F5DCA5\" />","<SaveHeartIcon active={!!savedDailyQuote} size={16} tintColor=\"#F5DCA5\" />"],["                    onPress={toggleDailyQuoteSaved}\n                    style={({pressed}) => [styles.heroHeartButton, pressed && styles.pressed]}","                    onPress={toggleDailyQuoteSaved}\n                    accessibilityRole=\"button\"\n                    accessibilityLabel={savedDailyQuote ? 'Убрать цитату из избранного' : 'Сохранить цитату'}\n                    hitSlop={8}\n                    style={({pressed}) => [styles.heroHeartButton, pressed && styles.pressed]}"],["    minHeight: 305,\n    justifyContent: 'flex-start',","    minHeight: 330,\n    justifyContent: 'flex-start',"],["    gap: 9,\n    marginTop: 10,\n  },\n\n  heroQuoteActionButton:","    gap: 7,\n    marginTop: 8,\n  },\n\n  heroQuoteActionButton:"],["  heroQuoteActionButton: {\n    minHeight: 38,","  heroQuoteActionButton: {\n    minHeight: 30,"],["    paddingHorizontal: 5,\n    borderRadius: 10,\n    borderWidth: 1,\n    borderColor: '#F7DFB4',","    paddingHorizontal: 8,\n    borderRadius: 8,\n    borderWidth: 1,\n    borderColor: '#F7DFB4',"],["    marginLeft: 0,\n    padding: 5,\n    color: '#F7DFB4',","    marginLeft: 0,\n    paddingHorizontal: 3,\n    paddingVertical: 3,\n    color: '#F7DFB4',"],["    fontFamily: 'serif',\n    fontSize: 13,\n    lineHeight: 17,\n    fontWeight: '800',","    fontFamily: 'serif',\n    fontSize: 11,\n    lineHeight: 15,\n    fontWeight: '700',"],["  heroHeartButton: {\n    width: 42,\n    height: 38,","  heroHeartButton: {\n    width: 32,\n    height: 30,"],["    borderRadius: '50%',\n    borderWidth: 1.5,","    borderRadius: 16,\n    borderWidth: 1,"],["    bottom: 42,\n    paddingHorizontal: 5,","    bottom: 32,\n    paddingHorizontal: 0,"],["    top: -10,\n    bottom: -8,\n    left: -26,\n    right: -54,\n    borderRadius: 28,","    top: -25,\n    bottom: -20,\n    left: -18,\n    right: -18,\n    borderRadius: 18,"],["  heroQuoteText: {\n    color: '#F8E7C5',\n\n    fontFamily: 'Ponomar',\n    fontSize: 19,\n    lineHeight: 24,","  heroQuoteText: {\n    color: '#F8E7C5',\n    fontFamily: 'serif',\n    fontWeight: '500',\n    fontSize: 17,\n    lineHeight: 23,"],["  heroQuoteSource: {\n    marginTop: 5,","  heroQuoteSourceLink: {\n    textDecorationLine: 'underline',\n    textDecorationColor: '#E5C58F',\n  },\n  heroQuoteSource: {\n    marginTop: 6,"]],"src/screens/FavoritesScreen.js":[["import {showShareFeedback} from '../services/shareFeedback';","import {showShareFeedback} from '../services/shareFeedback';\nimport {openDailyQuoteSource} from '../services/dailyQuoteNavigation';"],["    if (item.source_type === 'daily_quote') {\n      navigation.navigate('Menu');\n      return;\n    }","    if (item.source_type === 'daily_quote') {\n      // Return to the actual Bible passage, not to the Home quote card.\n      // Patristic sayings without an in-app book have no fake destination.\n      openDailyQuoteSource(navigation, {...metadata, target: metadata.quote_target});\n      return;\n    }"]]};
const check=(ok,message)=>{if(!ok)throw Error(message+'. NO FILES MODIFIED.')};
check(fs.existsSync(path.join(root,'src/data/curatedDailyQuotes.json')),
  'Restore curatedDailyQuotes.json from GitHub first');
check(fs.existsSync(path.join(root,'src/services/dailyQuoteNavigation.js')),
  'Restore dailyQuoteNavigation.js from GitHub first');
const quotes=JSON.parse(fs.readFileSync(path.join(root,'src/data/curatedDailyQuotes.json'),'utf8'));
check(quotes.count===150&&quotes.quotes.length===150,
  'Expected 150 offline curated quotes');
const files=Object.entries(patches).map(([relative,replacements])=>{
 const file=path.join(root,relative);
 check(fs.existsSync(file),'Missing '+relative);
 const original=fs.readFileSync(file,'utf8');
 let code=original.replace(/\r\n/g,'\n');
 for(const [before,after] of replacements){
   // Pre-existing local modifications are not overwritten. If a specific
   // anchor changed, abort for user review instead of forcing a merge.
   const originalCount=code.split(before).length-1;
   if(originalCount===1)code=code.replace(before,after);
   else if(originalCount===0&&code.includes(after))continue;
   else throw Error('Local quote patch anchor differs in '+relative+
     ': '+before.slice(0,90)+'. NO FILES MODIFIED.');
 }
 return {file,relative,original,content:original.includes('\r\n')?code.replace(/\n/g,'\r\n'):code};
});
const dailyFile=path.join(root,'src/services/dailyQuote.js');
check(fs.existsSync(dailyFile),'Missing dailyQuote.js');
const dailyOriginal=fs.readFileSync(dailyFile,'utf8');
let dailyCode=dailyOriginal.replace(/\r\n/g,'\n');
const expected="import {getCurrentContent} from './contentStore';";
check(dailyCode.includes(expected),'Daily quote service import changed');
if(!dailyCode.includes("import curated from '../data/curatedDailyQuotes.json';")){
 // Preserve the existing date-pinned editorial override, replacing just
 // the fallback rotation of old quotes with our offline catalogue.
 const rotationStart='  const rotation = quotes.filter((item) => !item.quote_date);';
 const start=dailyCode.indexOf(rotationStart);
 check(start>=0,'Daily quote rotation hook changed');
 const end=dailyCode.indexOf('\n};',start);
 check(end>start,'Daily quote function end changed');
 dailyCode=dailyCode.replace(expected,expected+
   "\nimport curated from '../data/curatedDailyQuotes.json';");
 dailyCode=dailyCode.slice(0,dailyCode.indexOf(rotationStart))+
   "  const rotation = curated.quotes || [];\n"+
   dailyCode.slice(end);
 // Existing "if(!rotation.length)" and index/return must be restored
 // following replacement, so use the function tail explicitly.
 const fallbackStart=dailyCode.indexOf('  const rotation = curated.quotes || [];');
 const fallbackEnd=dailyCode.indexOf('\n};',fallbackStart);
 dailyCode=dailyCode.slice(0,fallbackStart)+
   "  const rotation = curated.quotes || [];\n"+
   "  if (!rotation.length) return {id:null,text:'Господи, научи меня молиться.',reference:'',source:'',date:today};\n"+
   "  const index = getDateOrdinal(new Date()) % rotation.length;\n"+
   "  return {...rotation[index],date:today};"+
   dailyCode.slice(fallbackEnd);
}
files.push({file:dailyFile,relative:'src/services/dailyQuote.js',original:dailyOriginal,
 content:dailyOriginal.includes('\r\n')?dailyCode.replace(/\n/g,'\r\n'):dailyCode});
try{
 const {parse}=require('@babel/parser');
 for(const f of files)parse(f.content,{sourceType:'module',plugins:['jsx']});
}catch(error){
 if(error.code!=='MODULE_NOT_FOUND')throw error;
 console.warn('WARN: @babel/parser not installed; syntax check skipped.');
}
const modified=files.filter(f=>f.original!==f.content);
if(process.argv.includes('--dry-run')){
 console.log('DRY RUN PASS: 150 quotes, source links, compact buttons, gradients.');
 console.log('WOULD MODIFY: '+(modified.map(f=>f.relative).join(', ')||'none'));
 console.log('NO FILES MODIFIED.');
 process.exit(0);
}
if(!modified.length){console.log('PASS: Home quote patch already applied.');process.exit(0)}
const backup=path.resolve(root,'..','build-backups',
 'home-daily-quotes-'+new Date().toISOString().replace(/[:.]/g,'-'));
fs.mkdirSync(backup,{recursive:true});
for(const f of modified)fs.copyFileSync(f.file,path.join(backup,path.basename(f.file)));
try{for(const f of modified)fs.writeFileSync(f.file,f.content,'utf8')}
catch(error){for(const f of modified)fs.copyFileSync(path.join(backup,path.basename(f.file)),f.file);throw error}
console.log('PASS: Home quote card uses 150 sourced entries and deep Bible links.');
console.log('FILES: '+modified.map(f=>f.relative).join(', '));
console.log('BACKUP: '+backup);

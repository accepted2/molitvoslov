#!/usr/bin/env node
'use strict';
// Only styles the "Misc Prayers" navigation cards and standalone text titles.
// Does not reformat Psalter, canons, Bible chapters, or other readers.
const fs=require('node:fs'),path=require('node:path'),parser=require('@babel/parser');
const root=path.resolve(__dirname,'..'),specs=[{"path":"src/screens/MiscPrayersScreen.js","steps":[{"old":"                <View style={styles.card}>","now":"                <View style={[styles.card, isCategory && styles.categoryCard]}>"},{"old":"                    <View style={styles.cardIcon}>\n                      <Text style={styles.cardIconText}>{isCategory ? '▤' : '✦'}</Text>\n                    </View>","now":"                    <View style={[styles.cardIcon, isCategory && styles.categoryIcon]}>\n                      <Ionicons\n                        name={isCategory ? 'folder-open-outline' : 'document-text-outline'}\n                        size={21}\n                        color={isCategory ? '#79502D' : colors.accentDark}\n                      />\n                    </View>"},{"old":"                      <Text style={styles.cardTitle}>{title}</Text>","now":"                      <Text style={[styles.cardTitle, isCategory && styles.categoryTitle]}>{title}</Text>"},{"old":"                    <Text style={styles.arrow}>›</Text>","now":"                    <Text style={[styles.arrow, isCategory && styles.categoryArrow]}>›</Text>"},{"old":"  card: {\n    minHeight: 72,","now":"  categoryCard: {\n    backgroundColor: 'rgba(235, 214, 181, 0.96)',\n    borderColor: 'rgba(119, 77, 40, 0.42)',\n    borderLeftWidth: 4,\n  },\n  categoryIcon: {\n    backgroundColor: 'rgba(213, 182, 138, 0.68)',\n  },\n  categoryTitle: {\n    color: '#59371F',\n    fontWeight: '700',\n  },\n  categoryArrow: {\n    color: '#76502F',\n  },\n  card: {\n    minHeight: 72,"},{"old":"  cardText: {\n    flex: 1,\n    marginLeft: spacing.md,\n  },","now":"  cardText: {\n    flex: 1,\n    minWidth: 0,\n    flexShrink: 1,\n    marginLeft: spacing.md,\n    paddingVertical: 2,\n  },"},{"old":"  cardTitle: {\n    color: colors.text,\n    fontFamily: 'serif',\n    fontSize: 17,\n    lineHeight: 22,\n    fontWeight: '700',\n  },","now":"  cardTitle: {\n    color: colors.text,\n    fontFamily: 'serif',\n    fontSize: 17,\n    lineHeight: 23,\n    fontWeight: '700',\n    flexShrink: 1,\n    flexWrap: 'wrap',\n  },"},{"old":"  arrow: {\n    marginLeft: spacing.sm,\n    color: '#9A714C',\n    fontSize: 26,\n  },","now":"  arrow: {\n    marginLeft: 4,\n    marginRight: 12,\n    width: 22,\n    flexShrink: 0,\n    textAlign: 'center',\n    color: '#9A714C',\n    fontSize: 25,\n  },"}]},{"path":"src/components/reader/selectableDocumentReader/runtime.js","steps":[{"old":"    const renderDocument = () => {\n      reader.classList.toggle('psalter-kathisma-reader',","now":"    const renderDocument = () => {\n      reader.classList.toggle('standalone-prayer', DATA.document.presentation === 'standalone-prayer');\n      reader.classList.toggle('psalter-kathisma-reader',"}]},{"path":"src/components/reader/selectableDocumentReader/styles.js","steps":[{"old":"  `;\n","now":"\n    /* Standalone prayers: full available width, left-aligned title.\n       Keep the actions on the right so the first word is not obscured. */\n    body:not(.book-mode) #reader.standalone-prayer .document-header .rule-title,\n    body:not(.book-mode) #reader.standalone-prayer .document-header.has-reader-action-menu .rule-title {\n      display: block;\n      width: 100%;\n      min-width: 0;\n      padding-left: 0 !important;\n      padding-right: 44px !important;\n      text-align: left !important;\n      text-align-last: left !important;\n      white-space: normal;\n      overflow-wrap: break-word;\n      word-break: normal;\n    }\n    body:not(.book-mode) #reader.standalone-prayer .document-header.has-reader-action-menu .reader-action-container {\n      left: auto;\n      right: 0;\n    }\n  `;\n"}]}],pending=[];
for(const spec of specs){
 const file=path.join(root,spec.path),before=fs.readFileSync(file,'utf8');
 const bom=before.startsWith('\uFEFF')?'\uFEFF':'';
 let output=before.slice(bom.length).replace(/\r\n/g,'\n');
 for(let i=0;i<spec.steps.length;i++){
  const p=spec.steps[i],old=output.split(p.old).length-1,done=output.split(p.now).length-1;
  if(old===1&&done===0)output=output.replace(p.old,p.now);
  else if(done===1&&(old===0||p.now.includes(p.old)))continue;
  else throw Error(spec.path+' visual patch '+(i+1)+' conflicts with local edits. NO FILES MODIFIED.');
 }
 parser.parse(output,{sourceType:'module',plugins:['jsx']});
 let after=bom+output;
 if(before.includes('\r\n'))after=after.replace(/\n/g,'\r\n');
 if(before!==after)pending.push({file,path:spec.path,before,after});
}
if(process.argv.includes('--dry-run')){
 console.log('DRY RUN PASS; NO FILES MODIFIED. Changes: '+(pending.map(x=>x.path).join(', ')||'none'));process.exit(0);
}
if(!pending.length){console.log('PASS: prayer category and title styling already installed.');process.exit(0)}
const backupDir=path.resolve(root,'..','build-backups','prayer-visuals-before-'+new Date().toISOString().replace(/[:.]/g,'-'));
fs.mkdirSync(backupDir,{recursive:true});
for(const p of pending)fs.copyFileSync(p.file,path.join(backupDir,p.path.replace(/[\\/]/g,'__')));
const written=[];
try{for(const p of pending){fs.writeFileSync(p.file,p.after,'utf8');written.push(p)}}
catch(e){for(const p of written)fs.writeFileSync(p.file,p.before,'utf8');throw e}
console.log('PASS: category cards, wrapped titles, aligned chevrons, left-aligned prayer headings.');
console.log('Backup: '+backupDir);

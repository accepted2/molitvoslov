#!/usr/bin/env node
'use strict';
// Reversible installer for the LOCAL SaintDetailScreen, preserving unrelated changes.
const fs=require('node:fs'),path=require('node:path');
const parser=require('@babel/parser');
const target=path.resolve(__dirname,'../src/screens/SaintDetailScreen.js');
const old=fs.readFileSync(target,'utf8');
const apply=process.argv.includes('--apply');
const backup=target+'.before-hymn-variants-20261123.bak';
const marker='BLAGOVEST_HYMN_VARIANTS_20261123';
const must=(condition,message)=>{if(!condition)throw Error(message+' — file preserved');};
const parse=s=>parser.parse(s,{sourceType:'module',plugins:['jsx']});
parse(old);
must(!old.includes(marker),'Hymn variants patch already installed');
let next=old;
const langImport="import {useLanguage} from '../context/LanguageContext';";
must(next.includes(langImport),'Language import missing');
next=next.replace(langImport,langImport+"\nimport {isChurchSlavonicHymn} from '../services/calendarHymnDisplay';");
const accordionProp=/(\n  sourceTitle,\n)(\}\)\s*=>\s*\{)/;
must(accordionProp.test(next),'Accordion prop declaration not located');
next=next.replace(accordionProp,'$1  script = \'civil\',\n$2');
const contextFont="    fontFamily: styles.body.fontFamily,";
must(next.includes(contextFont),'Accordion context font line missing');
next=next.replace(contextFont,
    "    fontFamily: script === 'csl' ? 'Ponomar' : styles.body.fontFamily,");
const anchor="  const content = (\n    <View style={styles.readingContent}>";
must(next.includes(anchor),'Accordion content anchor missing');
next=next.replace(anchor,
    "  if (script === 'csl') saveContext.metadata.language = 'traditional';\n" +
    "  if (section === 'troparion_alt') saveContext.anchorId = 6;\n" +
    "  if (section === 'kontakion_alt') saveContext.anchorId = 7;\n" + anchor);
const textStyle="textStyle={styles.body}";
must(next.includes(textStyle),'Selectable body style missing');
next=next.replace(textStyle,"textStyle={[styles.body, script === 'csl' && styles.ponomarBody]}");
const oldData = "  const prayer = (uk && resolvedFeast?.prayer_content_uk) || resolvedFeast?.prayer_content;";
must(next.includes(oldData),'Prayer line not located');
const newData=[
"  // BLAGOVEST_HYMN_VARIANTS_20261123",
"  const hymnLocalized = (base) =>",
"    (uk && resolvedFeast?.[base + '_uk']) || resolvedFeast?.[base] || '';",
"  const troparionAlt = hymnLocalized('troparion_alt_content');",
"  const kontakionAlt = hymnLocalized('kontakion_alt_content');",
"  const troparionAltTitle = hymnLocalized('troparion_alt_title');",
"  const kontakionAltTitle = hymnLocalized('kontakion_alt_title');",
"  const hymnScript = (kind, text, alternative = false) =>",
"    isChurchSlavonicHymn(text,",
"      hymnLocalized(kind + (alternative ? '_alt' : '') + '_script')) ? 'csl' : 'civil';",
""].join('\n');
next=next.replace(oldData,newData+oldData);
for(const [kind,variable] of [['troparion','troparion'],['kontakion','kontakion']]){
  const snippet="          text={"+variable+"}\n";
  must(next.includes(snippet),'Cannot locate '+kind+' Accordion text');
  next=next.replace(snippet,snippet+"          script={hymnScript('"+kind+"', "+variable+")}\n");
}
const extraAccordions=[
"        {!!troparionAlt && <Accordion",
"          title={uk ? 'Інший тропар' : 'Иной тропарь'}",
"          feast={resolvedFeast} date={date} sourceTitle={title}",
"          section=\"troparion_alt\" icon=\"♪\"",
"          text={troparionAlt} subtitle={troparionAltTitle}",
"          script={hymnScript('troparion', troparionAlt, true)}",
"          focusHighlight={focusSection === 'troparion_alt'}",
"        />}",
"        {!!kontakionAlt && <Accordion",
"          title={uk ? 'Інший кондак' : 'Иной кондак'}",
"          feast={resolvedFeast} date={date} sourceTitle={title}",
"          section=\"kontakion_alt\" icon=\"✧\"",
"          text={kontakionAlt} subtitle={kontakionAltTitle}",
"          script={hymnScript('kontakion', kontakionAlt, true)}",
"          focusHighlight={focusSection === 'kontakion_alt'}",
"        />}",
""].join('\n');
const prayerAccord="\n        {!!prayer && <Accordion";
must(next.includes(prayerAccord),'Prayer accordion insertion missing');
const altSplit='        {!!kontakionAlt && <Accordion';
const parts=extraAccordions.split(altSplit);
must(parts.length===2,'Cannot separate the 2 alternative hymn blocks');
const troparionBlock=parts[0].trimEnd();
const kontakionBlock=altSplit+parts[1];
const beforeKontakion='\n        <Accordion\n          title="Кондак"';
must(next.includes(beforeKontakion),'Main kontakion Accordion anchor missing');
next=next.replace(beforeKontakion,'\n'+troparionBlock+beforeKontakion);
next=next.replace(prayerAccord,'\n'+kontakionBlock+prayerAccord);
const subtitleStyle='style={styles.subtitle}';
must(next.includes(subtitleStyle),'Subtitle style anchor missing');
next=next.replace(subtitleStyle,
  "style={[styles.subtitle, script === 'csl' && styles.ponomarSubtitle]}");
const noContent="!life && !troparion && !kontakion && !prayer";
must(next.includes(noContent),'Empty card expression missing');
next=next.replace(noContent,"!life && !troparion && !kontakion && !troparionAlt && !kontakionAlt && !prayer");
const fontStyle="  body: {\n    fontFamily: 'serif',";
must(next.includes(fontStyle),'Body style declaration missing');
next=next.replace(fontStyle,
    "  ponomarBody: {fontFamily: 'Ponomar', fontSize: 19, lineHeight: 32},\n" +
    "  ponomarSubtitle: {fontFamily: 'Ponomar', fontSize: 15, lineHeight: 24},\n" + fontStyle);
parse(next);
console.log('PREVIEW: SaintDetailScreen syntax PASS. '+old.length+' -> '+next.length+' characters.');
if(!apply){console.log('CHECK mode. No changes made.');process.exit(0)}
if(fs.existsSync(backup))throw Error('Backup already exists. Do not overwrite it.');
fs.copyFileSync(target,backup);
fs.writeFileSync(target,next,'utf8');
console.log('INSTALLED: independent alternative hymns and Ponomar presentation.');
console.log('BACKUP: '+backup);

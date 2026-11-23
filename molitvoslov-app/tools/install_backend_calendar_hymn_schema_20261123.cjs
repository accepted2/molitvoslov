#!/usr/bin/env node
'use strict';
/*
 * Non-destructive patch against the user's CURRENT local Django backend.
 * Installs separate editable alternative troparion/kontakion fields (RU/UK)
 * in model, admin, import and serializer. Does not run DB migrations.
 * --check: verifies every anchor and prints plan, no writes.
 * --apply: creates backed-up copies of all 4 files, then applies patch.
 * New helper and table should already have been fetched from the branch.
 */
const fs=require('node:fs'),path=require('node:path');
const repo=path.resolve(__dirname,'../..');
const api=path.join(repo,'molitvoslov-backend/api');
const apply=process.argv.includes('--apply');
const marker='troparion_alt_content';
const map={
  model:path.join(api,'calendar_models.py'),
  admin:path.join(api,'admin.py'),
  importer:path.join(api,'calendar_import.py'),
  serializer:path.join(api,'calendar_serializers.py'),
};
for(const required of ['calendar_hymn_variants.py','calendar_ucs8_table.json']) {
  if(!fs.existsSync(path.join(api,required)))throw Error('Required backend file missing: '+required);
}
const original=Object.fromEntries(Object.entries(map).map(([key,file])=>[key,fs.readFileSync(file,'utf8')]));
if(Object.values(original).some(text=>text.includes(marker)))
  throw Error('Alternative hymn fields already exist in some files. Do not overwrite partial changes; review manually.');

function single(source,needle,replacement,label) {
 const at=source.indexOf(needle);
 if(at<0||source.indexOf(needle,at+needle.length)>=0)
   throw Error('Missing or ambiguous anchor: '+label+'. No files changed.');
 return source.replace(needle,replacement);
}
const fields=["troparion_alt_title","troparion_alt_content","troparion_alt_title_uk","troparion_alt_content_uk",
 "kontakion_alt_title","kontakion_alt_content","kontakion_alt_title_uk","kontakion_alt_content_uk"];
const newModelEntries=(kind)=>[
  "    "+kind+"_alt_title = models.TextField(blank=True, default=\"\")",
  "    "+kind+"_alt_content = models.TextField(blank=True, default=\"\")",
  "    "+kind+"_alt_title_uk = models.TextField(blank=True, default=\"\")",
  "    "+kind+"_alt_content_uk = models.TextField(blank=True, default=\"\")",
].join('\n');
let model=original.model;
for(const kind of ['troparion','kontakion']) {
 const anchor="    "+kind+"_echo = models.PositiveSmallIntegerField(null=True, blank=True)";
 model=single(model,anchor,anchor+"\n"+newModelEntries(kind),'model '+kind);
}
let admin=original.admin;
const protectedFieldNames = [
  'troparion_alt_title', 'troparion_alt_content',
  'troparion_alt_title_uk', 'troparion_alt_content_uk',
  'kontakion_alt_title', 'kontakion_alt_content',
  'kontakion_alt_title_uk', 'kontakion_alt_content_uk',
];
// Patch the CalendarFeastAdmin class only (never another admin's save_model).
const classMatch=/^class CalendarFeastAdmin\s*\([^)\n]*\)\s*:/m.exec(admin);
if(!classMatch)throw Error('CalendarFeastAdmin class not found. No files changed.');
const classStart=classMatch.index;
const classBodyStart=classStart+classMatch[0].length;
const nextClass=/^(?:class |@admin\.register\()/gm;
nextClass.lastIndex=classBodyStart;
const nextMatch=nextClass.exec(admin);
const classEnd=nextMatch?nextMatch.index:admin.length;
let adminClass=admin.slice(classStart,classEnd);
const protection=/^([ \t]+)protected\s*=\s*\{([\s\S]*?)^([ \t]+)\}/m;
const protectionMatch=protection.exec(adminClass);
const markEdited=[
  '        # Hymn variants edited through Django are protected from re-import.',
  '        _hymn_variant_fields = {'+protectedFieldNames.map(x=>JSON.stringify(x)).join(', ')+'}',
  '        _hymn_variant_changes = set(form.changed_data or []) & _hymn_variant_fields',
  '        if _hymn_variant_changes:',
  '            obj.manually_edited_fields = sorted(',
  '                set(obj.manually_edited_fields or []) | _hymn_variant_changes',
  '            )',
].join('\n')+'\n';
let protectionMode='';
if(protectionMatch){
  // Follow existing editor protection rather than injecting competing logic.
  if(!protectionMatch[0].includes('troparion_content') ||
     !protectionMatch[0].includes('kontakion_content')){
    throw Error('CalendarFeastAdmin protection set is unrelated to hymns; no files changed.');
  }
  const indentation=protectionMatch[1]+'    ';
  const additions=protectedFieldNames.map(field=>indentation+JSON.stringify(field)+',').join('\n')+'\n';
  const at=protectionMatch.index+protectionMatch[0].lastIndexOf('}');
  adminClass=adminClass.slice(0,at)+additions+adminClass.slice(at);
  protectionMode='extended protected set';
}else{
  // Some local versions do not have a literal "protected = {" block.
  // In that case, protect edited alt fields immediately before saving.
  const saveMatch=/^([ ]{4})def save_model\s*\(\s*self\s*,\s*request\s*,\s*obj\s*,\s*form\s*,\s*change\s*\)\s*:\s*$/m.exec(adminClass);
  if(saveMatch){
    const begin=saveMatch.index+saveMatch[0].length;
    const rest=adminClass.slice(begin);
    const nextMethod=/^    (?:def |async def |@)/m.exec(rest);
    const methodEnd=nextMethod?begin+nextMethod.index:adminClass.length;
    const method=adminClass.slice(begin,methodEnd);
    if(!method.trim())throw Error('Empty save_model method. No files changed.');
    const parentCall=/^([ ]{8,})super\(\)\.save_model\s*\(/gm;
    let call=null,found;
    while((found=parentCall.exec(method))!==null)call=found;
    const insertAt=call?begin+call.index:begin;
    adminClass=adminClass.slice(0,insertAt)+
      (insertAt===begin?'\n':'')+markEdited+
      adminClass.slice(insertAt);
    protectionMode=call?'save_model edit guard before super()':'save_model edit guard at method entry';
  }else{
    // Fall back to adding a Django ModelAdmin override if none exists.
    const method=[
      '    def save_model(self, request, obj, form, change):',
      markEdited.trimEnd(),
      '        super().save_model(request, obj, form, change)',
      '',
    ].join('\n');
    adminClass=adminClass.slice(0,classMatch[0].length)+
      '\n'+method+adminClass.slice(classMatch[0].length);
    protectionMode='new isolated save_model guard';
  }
}
admin=admin.slice(0,classStart)+adminClass+admin.slice(classEnd);
console.log('CHECK CalendarFeastAdmin manual-edits protection: '+protectionMode);
const adminFieldSet='        (\n            "Житие — русский",';
if(!admin.includes(adminFieldSet))throw Error('Admin fieldsets differ; no writes');
const altSets=[
'        (',
'            "Иной тропарь — русский / украинский",',
'            {',
'                "fields": [',
'                    "troparion_alt_title", "troparion_alt_content",',
'                    "troparion_alt_title_uk", "troparion_alt_content_uk",',
'                ],',
'            },',
'        ),',
'        (',
'            "Иной кондак — русский / украинский",',
'            {',
'                "fields": [',
'                    "kontakion_alt_title", "kontakion_alt_content",',
'                    "kontakion_alt_title_uk", "kontakion_alt_content_uk",',
'                ],',
'            },',
'        ),',
].join('\n')+'\n';
admin=single(admin,adminFieldSet,altSets+adminFieldSet,'admin fields');
let importer=original.importer;
const localizedStart='def _localized_assignments(data, language):\n';
if(!importer.includes(localizedStart))throw Error('Importer assignments start missing');
importer=single(importer,localizedStart,
  localizedStart+'    from .calendar_hymn_variants import prepare_imported_hymn_fields\n',
  'importer helper');
for(const kind of ['troparion','kontakion']){
 const contentAnchor='        f"'+kind+'_content{suffix}": data.get("'+kind+'_content") or "",';
 const lines=[
 '        f"'+kind+'_alt_title{suffix}": data.get("'+kind+'_alt_title") or "",',
 '        f"'+kind+'_alt_content{suffix}": data.get("'+kind+'_alt_content") or "",',
 ].join('\n');
 importer=single(importer,contentAnchor,contentAnchor+'\n'+lines,'importer '+kind);
}
importer=single(importer,
  '        for field, value in assignments.items()\n',
  '        for field, value in prepare_imported_hymn_fields(assignments).items()\n',
  'importer prepare call');
let serializer=original.serializer;
for(const kind of ['troparion','kontakion']){
 const methodField='    '+kind+'_content = serializers.SerializerMethodField()';
 serializer=single(serializer,methodField,methodField+'\n'+[
  '    '+kind+'_alt_title = serializers.SerializerMethodField()',
  '    '+kind+'_alt_content = serializers.SerializerMethodField()',
 ].join('\n'), 'serializer declaration '+kind);
 const listAnchor='            "'+kind+'_content",';
 serializer=single(serializer,listAnchor,listAnchor+'\n'+[
  '            "'+kind+'_alt_title",',
  '            "'+kind+'_alt_content",',
 ].join('\n'),'serializer field list '+kind);
 const getter='    def get_'+kind+'_content(self, obj):\n        return self._get(obj, "'+kind+'_content")\n';
 const altGetters=[
  '',
  '    def get_'+kind+'_alt_title(self, obj):',
  '        return self._get(obj, "'+kind+'_alt_title")',
  '',
  '    def get_'+kind+'_alt_content(self, obj):',
  '        return self._get(obj, "'+kind+'_alt_content")',
  '',
 ].join('\n');
 serializer=single(serializer,getter,getter+altGetters,'serializer getters '+kind);
}
const outputs={model,admin,importer,serializer};
for(const [key,source] of Object.entries(outputs)){
 console.log('CHECK '+map[key]+': '+original[key].length+' -> '+source.length+' chars');
 if(source===original[key])throw Error('No model changes prepared for '+key);
}
console.log('No Django migrations are generated or applied by this installer.');
if(!apply){console.log('CHECK PASS — use --apply to install local backend fields.');process.exit(0)}
for(const file of Object.values(map)){
 if(fs.existsSync(file+'.before-alt-hymns-20261123.bak'))
   throw Error('Prior backup already exists for '+file+'; aborting all changes.');
}
for(const [key,file] of Object.entries(map))
 fs.copyFileSync(file,file+'.before-alt-hymns-20261123.bak');
for(const [key,file] of Object.entries(map))fs.writeFileSync(file,outputs[key],'utf8');
console.log('INSTALLED backend models, admin fields, serializer, and importer. Generate migrations in local backend only after review.');

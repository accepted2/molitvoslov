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
// Use the CalendarFeastAdmin class boundaries; local fieldsets may be
// formatted differently or have a renamed "Life" heading.
const adminStart2=admin.search(/^class CalendarFeastAdmin\s*\([^)\n]*\)\s*:/m);
if(adminStart2<0)throw Error('CalendarFeastAdmin missing during fieldset patch.');
const following=/(?:^class |^@admin\.register\()/gm;
following.lastIndex=adminStart2+1;
const afterClass=following.exec(admin);
const adminEnd2=afterClass?afterClass.index:admin.length;
let currentAdmin=admin.slice(adminStart2,adminEnd2);
const beforeLife=/(^[ ]{8}\(\s*\n[ ]{12}["']Житие\s*[-—]\s*русский["']\s*,)/m.exec(currentAdmin);
let fieldsetAt=-1;
if(beforeLife){
  fieldsetAt=beforeLife.index;
}else{
  const fieldsets=/^[ ]{4}fieldsets\s*=\s*([\[(])/m.exec(currentAdmin);
  if(!fieldsets)throw Error('CalendarFeastAdmin fieldsets not found; source preserved.');
  const tail=currentAdmin.slice(fieldsets.index+fieldsets[0].length);
  const endExp=fieldsets[1]==='[' ? /^    \]\s*,?\s*$/m : /^    \)\s*,?\s*$/m;
  const close=endExp.exec(tail);
  if(!close)throw Error('CalendarFeastAdmin fieldsets closing not found.');
  fieldsetAt=fieldsets.index+fieldsets[0].length+close.index;
}
currentAdmin=currentAdmin.slice(0,fieldsetAt)+altSets+currentAdmin.slice(fieldsetAt);
admin=admin.slice(0,adminStart2)+currentAdmin+admin.slice(adminEnd2);
console.log('CHECK CalendarFeastAdmin alternate hymn fieldsets added.');

let importer=original.importer;
// Do not try to infer the user's importer formatting. The existing
// upsert_feast body may have been customized extensively; leave it intact.
if(importer.includes('BLAGOVEST_HYMN_IMPORT_HOOK_20261123'))
  throw Error('Importer hymn integration already installed. No files changed.');
const candidates=[...importer.matchAll(/^def[ \t]+upsert_feast[ \t]*\(/gm)];
if(candidates.length!==1){
  const functions=[...importer.matchAll(/^def[ \t]+([A-Za-z_][A-Za-z_0-9]*)[ \t]*\(/gm)]
    .map(x=>x[1]).filter(x=>/feast|import|sync|upsert/i.test(x));
  throw Error('Cannot safely hook importer: expected one upsert_feast function, found '+
    candidates.length+'. Candidate functions: '+functions.slice(0,30).join(', ')+
    '. No files changed.');
}
const importHook = "\n# BLAGOVEST_HYMN_IMPORT_HOOK_20261123\n# Additive integration: retain the existing upsert function unchanged.\n# The wrapper passes already-normalized primary hymns into the old importer,\n# then persists independent alternate hymn fields if their source is safe.\nfrom functools import wraps as _blagovest_wraps\nfrom .calendar_hymn_variants import (\n    prepare_imported_hymn_fields as _blagovest_prepare_hymns,\n)\n\n_blagovest_original_upsert_feast = upsert_feast\n\n@_blagovest_wraps(_blagovest_original_upsert_feast)\ndef upsert_feast(*args, **kwargs):\n    source = args[0] if args else kwargs.get(\"data\")\n    if not isinstance(source, dict):\n        return _blagovest_original_upsert_feast(*args, **kwargs)\n\n    normalized = _blagovest_prepare_hymns(source)\n    if args:\n        feast = _blagovest_original_upsert_feast(\n            normalized, *args[1:], **kwargs\n        )\n    else:\n        forwarded = dict(kwargs)\n        forwarded[\"data\"] = normalized\n        feast = _blagovest_original_upsert_feast(**forwarded)\n\n    if feast is None:\n        return feast\n\n    language = kwargs.get(\"language\", args[1] if len(args) > 1 else \"ru\")\n    overwrite_existing = bool(\n        kwargs.get(\"overwrite_existing\", args[2] if len(args) > 2 else False)\n    )\n    suffix = \"_uk\" if language == \"uk\" else \"\"\n    manually_edited = set(getattr(feast, \"manually_edited_fields\", []) or [])\n    changed = []\n\n    for hymn in (\"troparion\", \"kontakion\"):\n        raw_main = source.get(hymn + \"_content\")\n        new_main = normalized.get(hymn + \"_content\")\n        persisted_main = getattr(feast, hymn + \"_content\" + suffix, \"\")\n        # Do not create an alternate stanza if the original importer did\n        # not accept the normalized first stanza (e.g. manual edit, or\n        # overwrite_existing=False against a different old hymn).\n        if raw_main != new_main and persisted_main != new_main:\n            continue\n\n        for fragment in (\"alt_title\", \"alt_content\"):\n            field_name = hymn + \"_\" + fragment + suffix\n            value = normalized.get(hymn + \"_\" + fragment)\n            if not isinstance(value, str) or not value:\n                continue\n            if field_name in manually_edited:\n                continue\n            current = getattr(feast, field_name, None)\n            if current not in (None, \"\") and not overwrite_existing:\n                continue\n            if current == value:\n                continue\n            setattr(feast, field_name, value)\n            changed.append(field_name)\n\n    if changed:\n        feast.save(update_fields=sorted(set(changed)) + [\"updated_at\"])\n    return feast\n";
importer=importer.replace(/\s*$/,'')+'\n\n'+importHook.trimStart();
console.log('CHECK existing importer preserved; only an additive hymn wrapper is appended.');
let serializer=original.serializer;
for(const kind of ['troparion','kontakion']){
 const methodField='    '+kind+'_content = serializers.SerializerMethodField()';
 serializer=single(serializer,methodField,methodField+'\n'+[
  '    '+kind+'_alt_title = serializers.SerializerMethodField()',
  '    '+kind+'_alt_content = serializers.SerializerMethodField()',
 ].join('\n'), 'serializer declaration '+kind);
 // Limit field-list edit to CalendarFeastSerializer.Meta only. The same
 // "kontakion_content" name also occurs in get_missing_uk_fields().
 const metaStart=serializer.indexOf('class CalendarFeastSerializer(');
 if(metaStart<0)throw Error('CalendarFeastSerializer not found. No files changed.');
 const feastEnd=serializer.indexOf('class CalendarReadingSerializer(',metaStart);
 if(feastEnd<0)throw Error('End of CalendarFeastSerializer not found. No files changed.');
 const feastChunk=serializer.slice(metaStart,feastEnd);
 const fieldStart=feastChunk.search(/^\s+fields\s*=\s*\[/m);
 if(fieldStart<0)throw Error('CalendarFeastSerializer Meta.fields not found.');
 const fieldEnd=feastChunk.indexOf(']',fieldStart);
 if(fieldEnd<0)throw Error('CalendarFeastSerializer Meta.fields has no end.');
 const metaFields=feastChunk.slice(fieldStart,fieldEnd+1);
 const listAnchor='            "'+kind+'_content",';
 const fixedFields=single(metaFields,listAnchor,listAnchor+'\n'+[
  '            "'+kind+'_alt_title",',
  '            "'+kind+'_alt_content",',
 ].join('\n'),'serializer Meta.fields '+kind);
 serializer=serializer.slice(0,metaStart+fieldStart)+fixedFields+
  serializer.slice(metaStart+fieldEnd+1);
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
// Validate generated Python syntax without importing Django or executing any
// backend code. Run this in CHECK as well as APPLY, before writing any file.
const {spawnSync}=require('node:child_process');
function checkPython(name,content){
  const check='import ast,sys;ast.parse(sys.stdin.buffer.read().decode("utf-8"),filename=sys.argv[1])';
  const interpreters=[['py',['-3']],['python',[]],['python3',[]]];
  for(const [command,prefix] of interpreters){
    const result=spawnSync(command,[...prefix,'-c',check,name],{
      input:content,encoding:'utf8',timeout:20000,windowsHide:true,maxBuffer:1024*1024,
    });
    if(result.error&&result.error.code==='ENOENT')continue;
    if(result.error)throw Error('Python syntax checker failed: '+result.error.message);
    if(result.status!==0)throw Error(
      'Generated Python syntax invalid for '+name+': '+(result.stderr||result.stdout||'').trim()
    );
    console.log('PYTHON SYNTAX PASS '+name);
    return;
  }
  console.log('WARNING: Python unavailable on PATH; syntax validation skipped for '+name);
}
checkPython('calendar_models.py',model);
checkPython('admin.py',admin);
checkPython('calendar_import.py',importer);
checkPython('calendar_serializers.py',serializer);

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
const installed=[];
const temporary=[];
try {
 for(const [key,file] of Object.entries(map)){
  const tmp=file+'.calendar-hymns-install-20261123.tmp';
  fs.writeFileSync(tmp,outputs[key],'utf8');
  temporary.push(tmp);
  fs.renameSync(tmp,file);
  installed.push(file);
 }
}catch(error){
 for(const file of installed){
  fs.copyFileSync(file+'.before-alt-hymns-20261123.bak',file);
 }
 for(const tmp of temporary){
  if(fs.existsSync(tmp))fs.unlinkSync(tmp);
 }
 throw Error('Backend installation aborted and previously written files restored: '+error.message);
}
console.log('INSTALLED backend models, admin fields, serializer, and importer. Backups preserved.');
console.log('Django migrations were NOT created or run. The database remains untouched.');

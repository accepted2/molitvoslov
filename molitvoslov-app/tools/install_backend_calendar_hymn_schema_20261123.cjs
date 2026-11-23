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
const protectedSet=admin.indexOf('        protected = {');
if(protectedSet<0)throw Error('Admin editor protection block missing');
const protectedEnd=admin.indexOf('        }',protectedSet);
if(protectedEnd<protectedSet)throw Error('Admin protection end missing');
const protectedPart=admin.slice(protectedSet,protectedEnd);
for(const kind of ['troparion','kontakion']){
 const anchor='            "'+kind+'_title_uk", "'+kind+'_content_uk",';
 if(!protectedPart.includes(anchor))throw Error('Admin protected field anchor missing: '+anchor);
}
const newProtected=protectedPart
  .replace('            "troparion_title_uk", "troparion_content_uk",',
    '            "troparion_title_uk", "troparion_content_uk",\n' +
     '            "troparion_alt_title", "troparion_alt_content",\n' +
     '            "troparion_alt_title_uk", "troparion_alt_content_uk",')
  .replace('            "kontakion_title_uk", "kontakion_content_uk",',
    '            "kontakion_title_uk", "kontakion_content_uk",\n' +
     '            "kontakion_alt_title", "kontakion_alt_content",\n' +
     '            "kontakion_alt_title_uk", "kontakion_alt_content_uk",');
admin=admin.slice(0,protectedSet)+newProtected+admin.slice(protectedEnd);
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

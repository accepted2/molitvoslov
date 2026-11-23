#!/usr/bin/env node
'use strict';
/*
 * Full preflight + atomic installer for locally customized Django calendar.
 * Avoid exact formatting and fragile getter/method/fieldsets anchors.
 * --check (default): validate 4 full Python modules, no source writes.
 * --apply: validate, back up all 4, write temporary files, rollback on error.
 * --self-test: additionally test layout mutations without touching source.
 * No migrations, DB updates, calendar JSON changes, or server deploys.
 */
const fs=require('node:fs');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'../..');
const api=path.join(root,'molitvoslov-backend','api');
const argv=new Set(process.argv.slice(2));
const accepted=new Set(['--check','--apply','--self-test']);
for(const flag of argv)if(!accepted.has(flag))throw Error('Unknown option: '+flag);
const apply=argv.has('--apply');
const selfTest=argv.has('--self-test');
const marker='BLAGOVEST_ALT_HYMN_SCHEMA_20261123';
const files={
  model:path.join(api,'calendar_models.py'),
  admin:path.join(api,'admin.py'),
  importer:path.join(api,'calendar_import.py'),
  serializer:path.join(api,'calendar_serializers.py'),
};
for(const name of ['calendar_hymn_variants.py','calendar_ucs8_table.json']){
  if(!fs.existsSync(path.join(api,name)))throw Error('Missing helper dependency: '+name);
}
const original={};
for(const [name,file] of Object.entries(files))
  original[name]=fs.readFileSync(file,'utf8');
const names=['troparion','kontakion'];
const alternateFields=names.flatMap(kind=>[
  kind+'_alt_title',kind+'_alt_content',kind+'_alt_title_uk',kind+'_alt_content_uk',
]);
const hasFields=Object.values(original).some(text=>
  text.includes(marker)||text.includes('troparion_alt_content'));
if(hasFields)throw Error(
  'Existing/partial alternative hymn schema detected. Refusing overwrite; review local files.'
);
const eol=Object.values(original).some(s=>s.includes('\r\n'))?'\r\n':'\n';
const nl=s=>s.replace(/\r\n/g,'\n');
const normalized=Object.fromEntries(Object.entries(original).map(([k,v])=>[k,nl(v)]));
function findClass(source,name){
  const startPattern=new RegExp('^class\\s+'+name+'\\b[^\\n]*:\\s*(?:#.*)?$', 'gm');
  const match=startPattern.exec(source);
  if(!match)throw Error('Missing class '+name+'; source unchanged');
  const classEndHeader=match.index+match[0].length;
  const rest=source.slice(classEndHeader);
  // A top-level declaration closes this class, without assumptions about
  // nested methods, decorators, string quoting, or Python code body.
  const next=/^(?:class |def |async def |@)/m.exec(rest);
  const end=next?classEndHeader+next.index:source.length;
  return {start:match.index,end,body:source.slice(classEndHeader,end)};
}
function appendToClass(source,name,body){
  const block=findClass(source,name);
  return source.slice(0,block.end)+
    '\n'+body.trimEnd()+'\n\n'+source.slice(block.end);
}
function pythonSyntax(name,source){
  const script='import ast,sys;ast.parse(sys.stdin.buffer.read().decode("utf-8"),filename=sys.argv[1])';
  for(const [exe,prefix] of [['py',['-3']],['python',[]],['python3',[]]]){
    const result=spawnSync(exe,[...prefix,'-c',script,name],{
      input:source,encoding:'utf8',windowsHide:true,timeout:20000,
      maxBuffer:1024*1024
    });
    if(result.error&&result.error.code==='ENOENT')continue;
    if(result.error)throw Error('Python checker error: '+result.error.message);
    if(result.status!==0)throw Error(
      'Python syntax failed in '+name+': '+(result.stderr||result.stdout||'').trim()
    );
    return;
  }
  throw Error('Python 3 was not found; refusing to install unvalidated Django source.');
}
const modelBody=[
'    # '+marker,
...alternateFields.map(field=>'    '+field+' = models.TextField(blank=True, default="")')
].join('\n');

// No dependency on existing get_troparion_content implementation/format.
// These declarations will be collected normally by SerializerMetaclass.
const localizedWireFields=alternateFields.filter(field=>!field.endsWith('_uk'));
const serializerBody=[
  '    # '+marker,
  ...localizedWireFields.map(field=>
    '    '+field+' = serializers.SerializerMethodField()'),
  '',
  '    def _blagovest_alt_text(self, obj, key):',
  '        original = getattr(self, "_get", None)',
  '        if callable(original):',
  '            return original(obj, key)',
  '        context = getattr(self, "context", {}) or {}',
  '        request = context.get("request")',
  '        language = (request.query_params.get("lang", "") if request else "").lower()',
  '        if language == "uk":',
  '            return getattr(obj, key + "_uk", "") or getattr(obj, key, "")',
  '        return getattr(obj, key, "")',
  '',
  ...localizedWireFields.flatMap(field=>[
    '    def get_'+field+'(self, obj):',
    '        return self._blagovest_alt_text(obj, "'+
      (field.endsWith('_uk')?field.slice(0,-3):field)+'")',
    '',
  ]),
  '    if isinstance(Meta.fields, (list, tuple)):',
  '        Meta.fields = list(Meta.fields) + [',
  ...alternateFields.map(field=>'            "'+field+'",'),
  '        ]',
].join('\n');
// Serializer explicitly returns localized single-field values to each client.
// Do not create duplicate _uk wire keys when Meta.fields is localized.
const serializerFixed=serializerBody.replace(
  '    if isinstance(Meta.fields, (list, tuple)):\n'+
  '        Meta.fields = list(Meta.fields) + [\n'+
  alternateFields.map(field=>'            "'+field+'",').join('\n')+
  '\n        ]',
  '    if isinstance(Meta.fields, (list, tuple)):\n'+
  '        Meta.fields = list(Meta.fields) + [\n'+
  localizedWireFields.map(field=>'            "'+field+'",').join('\n')+
  '\n        ]'
);
const adminAdditions=[
  '',
  '# '+marker,
  '# Extend the registered admin class without guessing its existing method layout.',
  '_blv_alt_fields = '+JSON.stringify(alternateFields).replace(/^\[/,'(').replace(/\]$/,',)'),
  '_blv_previous_fieldsets = CalendarFeastAdmin.get_fieldsets',
  'def _blv_calendar_fieldsets(self, request, obj=None):',
  '    existing = list(_blv_previous_fieldsets(self, request, obj))',
  '    existing_titles = {str(item[0]) for item in existing}',
  '    groups = (',
  '        ("Иной тропарь — RU/UK", ("troparion_alt_title", "troparion_alt_content",',
  '                                   "troparion_alt_title_uk", "troparion_alt_content_uk")),',
  '        ("Иной кондак — RU/UK", ("kontakion_alt_title", "kontakion_alt_content",',
  '                                  "kontakion_alt_title_uk", "kontakion_alt_content_uk")),',
  '    )',
  '    for label, fields in groups:',
  '        if label not in existing_titles:',
  '            existing.append((label, {"fields": fields, "classes": ("collapse",)}))',
  '    return existing',
  'CalendarFeastAdmin.get_fieldsets = _blv_calendar_fieldsets',
  '',
  '_blv_previous_save = CalendarFeastAdmin.save_model',
  'def _blv_calendar_save(self, request, obj, form, change):',
  '    edited = set(getattr(form, "changed_data", ()) or ()) & set(_blv_alt_fields)',
  '    if edited:',
  '        obj.manually_edited_fields = sorted(',
  '            set(getattr(obj, "manually_edited_fields", ()) or ()) | edited',
  '        )',
  '    return _blv_previous_save(self, request, obj, form, change)',
  'CalendarFeastAdmin.save_model = _blv_calendar_save',
].join('\n');
const importerHook = "\n# BLAGOVEST_HYMN_IMPORT_HOOK_20261123\n# Additive integration: retain the existing upsert function unchanged.\n# The wrapper passes already-normalized primary hymns into the old importer,\n# then persists independent alternate hymn fields if their source is safe.\nfrom functools import wraps as _blagovest_wraps\nfrom .calendar_hymn_variants import (\n    prepare_imported_hymn_fields as _blagovest_prepare_hymns,\n)\n\n_blagovest_original_upsert_feast = upsert_feast\n\n@_blagovest_wraps(_blagovest_original_upsert_feast)\ndef upsert_feast(*args, **kwargs):\n    source = args[0] if args else kwargs.get(\"data\")\n    if not isinstance(source, dict):\n        return _blagovest_original_upsert_feast(*args, **kwargs)\n\n    normalized = _blagovest_prepare_hymns(source)\n    if args:\n        feast = _blagovest_original_upsert_feast(\n            normalized, *args[1:], **kwargs\n        )\n    else:\n        forwarded = dict(kwargs)\n        forwarded[\"data\"] = normalized\n        feast = _blagovest_original_upsert_feast(**forwarded)\n\n    if feast is None:\n        return feast\n\n    language = kwargs.get(\"language\", args[1] if len(args) > 1 else \"ru\")\n    overwrite_existing = bool(\n        kwargs.get(\"overwrite_existing\", args[2] if len(args) > 2 else False)\n    )\n    suffix = \"_uk\" if language == \"uk\" else \"\"\n    manually_edited = set(getattr(feast, \"manually_edited_fields\", []) or [])\n    changed = []\n\n    for hymn in (\"troparion\", \"kontakion\"):\n        raw_main = source.get(hymn + \"_content\")\n        new_main = normalized.get(hymn + \"_content\")\n        persisted_main = getattr(feast, hymn + \"_content\" + suffix, \"\")\n        # Do not create an alternate stanza if the original importer did\n        # not accept the normalized first stanza (e.g. manual edit, or\n        # overwrite_existing=False against a different old hymn).\n        if raw_main != new_main and persisted_main != new_main:\n            continue\n\n        for fragment in (\"alt_title\", \"alt_content\"):\n            field_name = hymn + \"_\" + fragment + suffix\n            value = normalized.get(hymn + \"_\" + fragment)\n            if not isinstance(value, str) or not value:\n                continue\n            if field_name in manually_edited:\n                continue\n            current = getattr(feast, field_name, None)\n            if current not in (None, \"\") and not overwrite_existing:\n                continue\n            if current == value:\n                continue\n            setattr(feast, field_name, value)\n            changed.append(field_name)\n\n    if changed:\n        feast.save(update_fields=sorted(set(changed)) + [\"updated_at\"])\n    return feast\n";
function transform(parts){
  let model=nl(parts.model),admin=nl(parts.admin),
      importer=nl(parts.importer),serializer=nl(parts.serializer);
  if(!findClass(model,'CalendarFeast')||
     !findClass(admin,'CalendarFeastAdmin')||
     !findClass(serializer,'CalendarFeastSerializer')){
    throw Error('Required Django class missing');
  }
  const feastSerializer=findClass(serializer,'CalendarFeastSerializer');
  if(!/^    class Meta:\s*$/m.test(feastSerializer.body))
    throw Error('CalendarFeastSerializer.Meta is missing; source preserved.');
  model=appendToClass(model,'CalendarFeast',modelBody);
  admin=admin.replace(/\s*$/,'')+'\n'+adminAdditions+'\n';
  const upserts=[...importer.matchAll(/^def\s+upsert_feast\s*\(/gm)];
  if(upserts.length!==1)throw Error(
    'Expected exactly one upsert_feast; found '+upserts.length+'. Source preserved.');
  importer=importer.replace(/\s*$/,'')+'\n\n'+importerHook.trimStart()+'\n';
  serializer=appendToClass(serializer,'CalendarFeastSerializer',serializerFixed);
  return {model,admin,importer,serializer};
}
function verify(parts,output){
  if(!output.model.includes('troparion_alt_content = models.TextField'))
    throw Error('Model alternative hymn field missing');
  for(const field of alternateFields){
    if(!output.model.includes('    '+field+' = models.TextField'))
      throw Error('Missing model field '+field);
    if(!output.admin.includes('"'+field+'"'))
      throw Error('Missing admin form field '+field);
  }
  for(const field of localizedWireFields){
    if(!output.serializer.includes('    '+field+' = serializers.SerializerMethodField()'))
      throw Error('Missing serializer wire field '+field);
  }
  for(const wire of localizedWireFields)
    if(!output.serializer.includes('            "'+wire+'",'))
      throw Error('Missing serializer exposed field '+wire);
  for(const kind of names)
    for(const label of ['title','content']){
      const field=kind+'_alt_'+label;
      if(!output.serializer.includes('    def get_'+field+'('))
        throw Error('Missing getter '+field);
    }
  if(!output.importer.includes('# BLAGOVEST_HYMN_IMPORT_HOOK_20261123'))
    throw Error('Importer hook missing');
  for(const name of Object.keys(parts)){
    if(output[name].length<=parts[name].length)
      throw Error('Unexpected source shrinkage: '+name);
    // Patching classes inserts text inside the file. Preserve all original
    // nonempty source lines in their original order, not as one substring.
    const beforeLines=parts[name].split('\n').filter(line=>line.trim());
    const afterLines=output[name].split('\n');
    let matched=0;
    for(const line of afterLines)
      if(line===beforeLines[matched])matched++;
    if(matched!==beforeLines.length)
      throw Error('Original source line lost/reordered in '+name+' at '+matched+
        ' of '+beforeLines.length);
    pythonSyntax(name+'.py',output[name]);
  }
}
if(selfTest){
  const variant={...normalized,
    model:normalized.model.replace(
      /troparion_echo\s*=\s*models\.PositiveSmallIntegerField[^\n]*/,
      'troparion_echo=models.PositiveSmallIntegerField(blank=True, null=True)'),
    serializer:normalized.serializer.replace(
      /^    def get_troparion_content\(self, obj\):[\s\S]*?(?=^    def )/m,
      '    def get_troparion_content( self , obj ):\n'+
      '        return getattr(obj, "troparion_content", "")\n\n'),
    importer:normalized.importer.replace(
      /^def _localized_assignments\(data, language\):[\s\S]*?(?=^def )/m,
      'def custom_assignment_mapping(data, locale):\n    return data\n\n\n'),
    admin:normalized.admin.replace(
      /^        protected = \{[\s\S]*?^        \}\n/m,
      '        # custom local save guard\n')
  };
  const variantOutput=transform(variant);
  verify(variant,variantOutput);
  console.log('SELF-TEST PASS: custom admin, altered importer, reordered serializer getters.');
}
const outputs=transform(normalized);
verify(normalized,outputs);
console.log('FULL PREFLIGHT PASS: model, admin, importer, serializer.');
console.log('Verified Unicode Python syntax, 8 separate editable hymn fields,');
console.log('localized API fields, importer hook, protection of manual edits.');
for(const [name,text] of Object.entries(outputs))
  console.log('CHECK '+path.basename(files[name])+': '+original[name].length+' -> '+text.length);
if(!apply){
  console.log('CHECK ONLY: no Django source files, database or calendar JSON modified.');
  console.log('For installation run this script with --apply.');
  process.exit(0);
}
const backups=Object.entries(files).map(([name,file])=>({
 name,file,backup:file+'.before-alt-hymns-20261123.bak'
}));
for(const item of backups)if(fs.existsSync(item.backup))
  throw Error('A backup already exists: '+item.backup+'; no files modified.');
for(const item of backups)fs.copyFileSync(item.file,item.backup);
const changed=[];
const temp=[];
try{
  for(const item of backups){
    const staging=item.file+'.hymn-schema-20261123.tmp';
    fs.writeFileSync(staging,outputs[item.name].replace(/\n/g,
      original[item.name].includes('\r\n')?'\r\n':'\n'),'utf8');
    temp.push(staging);
    fs.renameSync(staging,item.file);
    changed.push(item);
  }
}catch(error){
  for(const item of changed)fs.copyFileSync(item.backup,item.file);
  for(const item of temp)if(fs.existsSync(item))fs.unlinkSync(item);
  throw Error('Atomic installation failed; all changed source files restored: '+
    error.message);
}
console.log('INSTALLED: four Django source files. Backups preserved.');
console.log('NO database migrations, calendar JSON changes or server deploys performed.');

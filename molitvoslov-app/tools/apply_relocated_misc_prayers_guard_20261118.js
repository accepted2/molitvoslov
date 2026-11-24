#!/usr/bin/env node
'use strict';
// The old APK preflight requires all five recovered prayers in the root.
// Three St John prayers may now be linked under their author category.
// Replace ONLY the exact old validation function, keeping the original
// five-prayer snapshot and every other restoration command unchanged.
const fs=require('node:fs'),path=require('node:path');
const app=path.resolve(__dirname,'..');
const file=path.join(app,'tools','restore_misc_prayers.py');
const helper=path.join(app,'tools','verify_relocated_misc_prayers.py');
const marker='MOLITVOSLOV_RELOCATED_MISC_PRAYERS_GUARD_V1';
if(!fs.existsSync(helper))throw Error('Missing tools/verify_relocated_misc_prayers.py. NO FILES MODIFIED.');
const raw=fs.readFileSync(file,'utf8');
const bom=raw.startsWith('\uFEFF')?'\uFEFF':'';
const old=[
 'def validate_offline_snapshot(payload):',
 '    """Block APK exports if any restored prayer or category link disappears."""',
 '    prayers = load_snapshot()',
 '    catalog = payload.get("texts") or {}',
 '    category_rows = (payload.get("category_texts") or {}).get(CATEGORY_SLUG) or []',
 '    links = {',
 '        ((item.get("text") or {}).get("slug"))',
 '        for item in category_rows',
 '        if isinstance(item, dict) and isinstance(item.get("text"), dict)',
 '    }',
 '    missing_catalog = [p["slug"] for p in prayers if p["slug"] not in catalog]',
 '    missing_links = [p["slug"] for p in prayers if p["slug"] not in links]',
 '    empty = [p["slug"] for p in prayers',
 '             if p["slug"] in catalog and not str(catalog[p["slug"]].get("content") or "").strip()]',
 '    if missing_catalog or missing_links or empty:',
 '        raise RuntimeError(',
 '            "APK MISC PRAYERS INCOMPLETE. Restore five prayers in local Django first. "',
 '            "Missing texts: " + str(missing_catalog) +',
 '            "; missing category links: " + str(missing_links) +',
 '            "; empty content: " + str(empty)',
 '        )',
 '    print("RECOVERED MISC PRAYERS VERIFIED: 5 published texts and 5 category links")',
 '',
 '',
].join('\n');
const replacement=[
 'def validate_offline_snapshot(payload):',
 '    """'+marker+': verify five complete prayers after authorized moves."""',
 '    from verify_relocated_misc_prayers import validate_restored_prayers',
 '    return validate_restored_prayers(payload, load_snapshot(), CATEGORY_SLUG)',
 '',
 '',
].join('\n');
const sourceText=raw.slice(bom.length).replace(/\r\n/g,'\n');
const was=sourceText.split(old).length-1;
const done=sourceText.includes(marker);
if(was!==1&&!done)
 throw Error('Local five-prayer validator differs. NO FILES MODIFIED; share its function for manual merge.');
if(done&&was===0){
 console.log('PASS: relocated prayer release validation already installed. NO FILES MODIFIED.');
 process.exit(0);
}
let updated=bom+sourceText.replace(old,replacement);
if(raw.includes('\r\n'))updated=updated.replace(/\n/g,'\r\n');
if(process.argv.includes('--dry-run')){
 console.log('DRY RUN PASS: the five-prayer guard will support verified nested St John categories.');
 console.log('NO FILES MODIFIED.');
 process.exit(0);
}
const backupDir=path.resolve(app,'..','build-backups','misc-prayer-validator-before-'
 +new Date().toISOString().replace(/[:.]/g,'-'));
fs.mkdirSync(backupDir,{recursive:true});
fs.copyFileSync(file,path.join(backupDir,'restore_misc_prayers.py'));
fs.writeFileSync(file,updated,'utf8');
console.log('PASS: updated exact recovered-prayer preflight, other restoration code preserved.');
console.log('BACKUP:',backupDir);

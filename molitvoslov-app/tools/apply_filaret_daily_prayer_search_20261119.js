#!/usr/bin/env node
'use strict';
// Add the Russian-only St Philaret prayer to the legacy v10 search corpus.
// Existing prayers, Bible, calendar and category search behavior are unchanged.
// The one new entry opens the original standalone Reader via stable slug.
const fs=require('node:fs'),path=require('node:path');
const app=path.resolve(__dirname,'..');
const file=path.join(app,'tools','build_search_seed.py');
const original=fs.readFileSync(file,'utf8');
const bom=original.startsWith('\uFEFF')?'\uFEFF':'';
let code=original.slice(bom.length).replace(/\r\n/g,'\n');
const marker='MOLITVOSLOV_FILARET_DAILY_PRAYER_SEARCH_V1';
if(code.includes(marker)){
 console.log('PASS: Filaret prayer search entry already supported. NO FILES MODIFIED.');
 process.exit(0);
}
const anchor='        for psalter in content.get("psalters", {}).get("list", [])[:1]:';
const added=[
 '        # '+marker,
 '        # Russian-only text cannot enter the Slavonic-only canonical prayer',
 '        # queue above. Index this exact source prayer by its Russian wording.',
 '        for filaret in text_objs:',
 '            if filaret.get("slug") != "ezhednevnaya-molitva-svyatitelya-filareta-drozdova":',
 '                continue',
 '            body = (filaret.get("translation") or "").strip()',
 '            if (not body or len(body) < 450 or filaret.get("content")):',
 '                raise RuntimeError("Unexpected St Philaret text/language in offline corpus")',
 '            category_slugs = {',
 '                c.get("slug") for c in filaret.get("categories") or []',
 '                if isinstance(c, dict)',
 '            }',
 '            if "raznye-molitvy" not in category_slugs:',
 '                raise RuntimeError("St Philaret prayer is no longer in Misc Prayers")',
 '            add(lang, "prayers", "text:" + str(filaret["id"]),',
 '                filaret.get("title") or "Ежедневная молитва святителя Филарета",',
 '                "Молитвы", [body],',
 '                {"name": "Reader", "params": {"slug": filaret["slug"]}},',
 '                kind="prayer", preview=body, text_language="russian")',
 '',
].join('\n');
if(code.split(anchor).length!==2 ||
 !code.includes("for priority, title, identifier, route, variants, source in prayer_candidates.values():")){
 throw Error('Existing prayer search extractor structure changed. NO FILES MODIFIED.');
}
code=code.replace(anchor,added+anchor);
let updated=bom+code;
if(original.includes('\r\n'))updated=updated.replace(/\n/g,'\r\n');
if(process.argv.includes('--dry-run')){
 console.log('DRY RUN PASS: add Russian-only St Philaret prayer to built-in search. NO FILES MODIFIED.');
 process.exit(0);
}
const backupDir=path.resolve(app,'..','build-backups','filaret-search-before-'+
 new Date().toISOString().replace(/[:.]/g,'-'));
fs.mkdirSync(backupDir,{recursive:true});
fs.copyFileSync(file,path.join(backupDir,'build_search_seed.py'));
fs.writeFileSync(file,updated,'utf8');
console.log('PASS: Filaret prayer search indexing enabled, other search sources unchanged.');
console.log('BACKUP:',backupDir);

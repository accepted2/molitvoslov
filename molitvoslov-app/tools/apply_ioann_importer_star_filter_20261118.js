#!/usr/bin/env node
'use strict';
// Optional maintenance: keep subsequent Azbyka reimports free of decorative "***".
// Leaves the user's previously edited Python importer untouched if it differs.
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const file=path.join(root,'tools/import_ioann_kronshtadtsky_collections_20261118.py');
const source=fs.readFileSync(file,'utf8');
const marker='is_separator = bool(re.fullmatch(r"(?:\\*\\s*){3,}", paragraph))';
if(source.includes(marker)){
 console.log('PASS: future imports already discard standalone Azbyka stars.');
 process.exit(0);
}
const old='                if paragraph and not re.fullmatch(r"(?:\\d+:)?\\d{1,2}:\\d{2}|Аудио(?:\\s*\\d+)?:?", paragraph):\n                    events.append(("text", n.tag, paragraph))';
const now='                # Editorial three-star separators are not prayer text.\n' +
 '                is_separator = bool(re.fullmatch(r"(?:\\*\\s*){3,}", paragraph))\n' +
 '                if paragraph and not is_separator and not re.fullmatch(\n' +
 '                        r"(?:\\d+:)?\\d{1,2}:\\d{2}|Аудио(?:\\s*\\d+)?:?", paragraph):\n' +
 '                    events.append(("text", n.tag, paragraph))';
const normalized=source.replace(/\r\n/g,'\n');
if(normalized.split(old).length!==2){
 throw Error('The local importer differs from the expected version. NO FILES MODIFIED.');
}
let updated=normalized.replace(old,now);
if(source.includes('\r\n'))updated=updated.replace(/\n/g,'\r\n');
if(process.argv.includes('--dry-run')){
 console.log('DRY RUN PASS. Future importer patch ready; NO FILES MODIFIED.');
 process.exit(0);
}
const backups=path.resolve(root,'..','build-backups','azbyka-importer-stars-before-'+new Date().toISOString().replace(/[:.]/g,'-'));
fs.mkdirSync(backups,{recursive:true});
fs.copyFileSync(file,path.join(backups,'import_ioann_kronshtadtsky_collections_20261118.py'));
fs.writeFileSync(file,updated,'utf8');
console.log('PASS: future Ioann prayer imports skip decorative three-star separators.');
console.log('Backup: '+backups);

#!/usr/bin/env node
'use strict';
// Identify duplicate PNG imports of the 17 lossless optimized WebP aliases.
// --apply rewrites ONLY literal JS/TS asset imports to existing _opt.webp files,
// backs up each changed source file, and NEVER deletes source artwork or data.
// Typical use after the earlier fix-artwork-resource-names-20261116.ps1 script:
//   node tools/audit-and-dedupe-artwork-imports-20261116.js
//   node tools/audit-and-dedupe-artwork-imports-20261116.js --apply
const fs = require('node:fs');
const path = require('node:path');
const args=process.argv.slice(2);
const apply=args.includes('--apply');
const rootArg=args.find(s=>s.startsWith('--root='));
const root=path.resolve(rootArg?rootArg.slice('--root='.length):path.join(__dirname,'..'));
const home=['akathists','canons','communion','evening','hero','morning','page_bg2','page_bg3','psalter'];
const evangelists=['john-bg','john-icon','luke-bg','luke-icon','mark-bg','mark-icon','matthew-bg','matthew-icon'];
const images=[
  ...home.map(name=>'assets/home/'+name),
  ...evangelists.map(name=>'assets/bible/evangelists/'+name),
];
const mappings=new Map();
for(const base of images){
  const old=path.join(root,base+'.png');
  const alias=path.join(root,base+'_opt.webp');
  mappings.set(path.normalize(old),{old,alias,base});
}
const targets=[path.join(root,'src'),path.join(root,'App.js'),path.join(root,'index.js')];
const sourceFiles=[];
function walk(p){
  if(!fs.existsSync(p))return;
  const st=fs.statSync(p);
  if(st.isFile()){
    if(/\.(?:js|jsx|ts|tsx)$/.test(p))sourceFiles.push(p);
    return;
  }
  for(const file of fs.readdirSync(p))walk(path.join(p,file));
}
for(const p of targets)walk(p);
const used=new Map();
const pattern=/\brequire\(\s*(['"])([^'"\r\n]+)\1\s*\)|\bfrom\s*(['"])([^'"\r\n]+)\3/g;
for(const file of sourceFiles){
  const text=fs.readFileSync(file,'utf8');
  let match;
  while((match=pattern.exec(text))){
    const importPath=match[2]||match[4];
    if(!/\.(?:png|webp)$/i.test(importPath))continue;
    const abs=path.normalize(path.resolve(path.dirname(file),importPath));
    if(!used.has(abs))used.set(abs,[]);
    used.get(abs).push({file,importPath});
  }
}
const rewrites=new Map();
const report=[];
let possibleSavings=0;
for(const entry of mappings.values()){
  const oldRefs=used.get(entry.old)||[];
  const webpRefs=used.get(entry.alias)||[];
  const oldBytes=fs.existsSync(entry.old)?fs.statSync(entry.old).size:0;
  const optBytes=fs.existsSync(entry.alias)?fs.statSync(entry.alias).size:0;
  const replaceable=oldRefs.length>0&&optBytes>0;
  if(replaceable)possibleSavings+=oldBytes;
  report.push({asset:entry.base,originalBytes:oldBytes,optimizedBytes:optBytes,
    pngImports:oldRefs.length,webpImports:webpRefs.length,replaceable});
  if(!replaceable)continue;
  for(const ref of oldRefs){
    if(!rewrites.has(ref.file))rewrites.set(ref.file,[]);
    let next=path.relative(path.dirname(ref.file),entry.alias).replaceAll('\\','/');
    if(!next.startsWith('.'))next='./'+next;
    rewrites.get(ref.file).push({from:ref.importPath,to:next});
  }
}
const targetCount=report.filter(x=>x.replaceable).length;
console.log('Optimized artwork aliases available:',report.filter(x=>x.optimizedBytes>0).length,'/ 17');
console.log('Actively imported large PNGs:',targetCount,'/ 17');
console.log('Literal references to update:',[...rewrites.values()].reduce((n,a)=>n+a.length,0));
console.log('Uncompressed PNG source bytes affected:',(possibleSavings/1048576).toFixed(2),'MiB');
for(const row of report){
  if(row.pngImports || row.webpImports){
    console.log(row.asset,'PNG refs='+row.pngImports,'WebP refs='+row.webpImports,
      row.replaceable?'[replaceable]':'');
  }
}
if(!apply){
  console.log('DRY RUN ONLY. APK savings depend on which source assets Metro bundled.');
  console.log('Run with --apply only after reviewing these exact imports.');
  process.exit(0);
}
if(targetCount===0){
  console.log('No duplicate original PNG imports to replace. Nothing changed.');
  process.exit(0);
}
const backupDir=path.join(root,'reports','artwork-import-backup-'+new Date().toISOString().replace(/[:.]/g,'-'));
const results=[];
for(const [file,replacements] of rewrites){
  let input=fs.readFileSync(file,'utf8');
  let output=input;
  let updatedReferences=0;
  // Reuse the exact parser used during the audit. Unlike a literal string
  // substitution, this preserves whitespace in require( '...' ) and handles
  // both require() and ES-import "from" without silently skipping matches.
  output=input.replace(pattern,(full,reqQuote,reqPath,fromQuote,fromPath)=>{
    const oldPath=reqPath||fromPath;
    const replacement=replacements.find(row=>row.from===oldPath);
    if(!replacement)return full;
    updatedReferences++;
    return full.replace(oldPath,replacement.to);
  });
  if(updatedReferences!==replacements.length){
    throw new Error('Expected '+replacements.length+' literal imports, rewritten '+
      updatedReferences+' in '+file+'. No sources have been written yet.');
  }
  const rel=path.relative(root,file);
  const backup=path.join(backupDir,rel);
  fs.mkdirSync(path.dirname(backup),{recursive:true});
  fs.copyFileSync(file,backup);
  results.push({file,output,backup});
}
for(const result of results)fs.writeFileSync(result.file,result.output,'utf8');
// Metro does not guarantee cleanup of stale output when an import is removed.
// Invalidate ONLY generated Android release resources so the next normal
// assembleRelease does not carry old PNG files or collide with optimized WebP.
const generated=path.join(root,'android','app','build','generated','res','react','release');
if(fs.existsSync(generated)){
  fs.rmSync(generated,{recursive:true,force:true});
  console.log('Invalidated only stale generated Android RELEASE resources.');
}
console.log('PASS:',results.length,'source files updated. No original PNGs or optimized WebPs deleted.');
console.log('Source backups:',backupDir);
console.log('Next: run Expo Android JS export and normal APK builder; compare against saved baseline.');

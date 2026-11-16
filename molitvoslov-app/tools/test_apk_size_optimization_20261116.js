#!/usr/bin/env node
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const cp=require('node:child_process');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'molitvoslov-opt-test-'));
const realRoot=path.resolve(__dirname,'..');
const script=path.join(realRoot,'tools','audit-and-dedupe-artwork-imports-20261116.js');
try{
  fs.mkdirSync(path.join(root,'assets','home'),{recursive:true});
  fs.mkdirSync(path.join(root,'src','screens'),{recursive:true});
  fs.writeFileSync(path.join(root,'assets','home','hero.png'),'large PNG artwork');
  fs.writeFileSync(path.join(root,'assets','home','hero_opt.webp'),'small lossless WebP artwork');
  const generated=path.join(root,'android','app','build','generated','res','react','release');
  fs.mkdirSync(generated,{recursive:true});
  fs.writeFileSync(path.join(generated,'stale.png'),'old output');
  const screen=path.join(root,'src','screens','Example.js');
  const source="const image=require('../../assets/home/hero.png');\n"+
    "const untouched=require('../../assets/home/misc_prayers.jpg');\n";
  fs.writeFileSync(screen,source);
  const spaced=path.join(root,'src','screens','Spaced.js');
  const spacedSource="const a = require( '../../assets/home/hero.png' );\n"+
    "import picture from \"../../assets/home/hero.png\";\n";
  fs.writeFileSync(spaced,spacedSource);
  const run=extra=>cp.spawnSync(process.execPath,[script,'--root='+root,...extra],
    {encoding:'utf8'});
  let result=run([]);
  assert.equal(result.status,0,result.stderr||result.stdout);
  assert.match(result.stdout,/Actively imported large PNGs: 1 \/ 17/);
  assert.match(result.stdout,/DRY RUN ONLY/);
  assert.equal(fs.readFileSync(screen,'utf8'),source,'Dry run touched user source');
  assert.equal(fs.readFileSync(spaced,'utf8'),spacedSource,'Dry run touched spaced import source');
  assert.ok(fs.existsSync(generated),'Dry run deleted generated resources');
  result=run(['--apply']);
  assert.equal(result.status,0,result.stderr||result.stdout);
  assert.match(result.stdout,/PASS: 2 source files updated/);
  const after=fs.readFileSync(screen,'utf8');
  assert.match(after,/hero_opt\.webp/);
  assert.doesNotMatch(after,/hero\.png/);
  assert.match(after,/misc_prayers\.jpg/);
  assert.equal((fs.readFileSync(spaced,'utf8').match(/hero_opt\.webp/g)||[]).length,2,
    'Both spaced require and ES import should be updated');
  assert.ok(!fs.existsSync(generated),'Stale generated release assets should be invalidated');
  assert.ok(fs.existsSync(path.join(root,'assets','home','hero.png')));
  assert.ok(fs.existsSync(path.join(root,'assets','home','hero_opt.webp')));
  const backupDirs=fs.readdirSync(path.join(root,'reports')).filter(x=>x.startsWith('artwork-import-backup-'));
  assert.equal(backupDirs.length,1);
  const backup=path.join(root,'reports',backupDirs[0],'src','screens','Example.js');
  assert.equal(fs.readFileSync(backup,'utf8'),source,'No restorable original backup');
  result=run([]);
  assert.equal(result.status,0,result.stderr||result.stdout);
  assert.match(result.stdout,/Actively imported large PNGs: 0 \/ 17/);
  console.log('PASS: safe 17-asset audit, exact import rewrite, backups, original PNG/WebP preservation and idempotence');
}finally{
  fs.rmSync(root,{recursive:true,force:true});
}

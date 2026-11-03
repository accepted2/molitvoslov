#!/usr/bin/env node
// Confirm local, published akathists are not suppressed by a curated whitelist.
const fs=require('fs');
const path=require('path');
const babel=require('@babel/parser');
const root=path.resolve(__dirname,'..');
const source=fs.readFileSync(path.join(root,'src/services/contentApi.js'),'utf8');
const content=JSON.parse(fs.readFileSync(path.join(root,'src/data/offlineContent.json'),'utf8'));
try{
  babel.parse(source,{sourceType:'module',plugins:['jsx']});
  if(!source.includes('AKATHIST_PUBLISHED_ONLY_V1')||
     source.includes('baselineAkathistSlugs')||
     source.includes('isCuratedAkathist')||
     !source.includes("const isVisibleAkathist = (item) => !!item && item.is_visible === true;")){
    throw new Error('Old curated-only akathist filter still present');
  }
  const items=content.akathists?.list;
  const bySlug=content.akathists?.by_slug;
  if(!Array.isArray(items)||!bySlug||typeof bySlug!=='object'){
    throw new Error('Invalid offlineContent.json akathist shape');
  }
  const published=items.filter(x=>x?.is_visible===true);
  const slugs=new Set();
  for(const item of published){
    if(!item.slug||slugs.has(item.slug))throw new Error('Missing or duplicated akathist slug '+item.slug);
    slugs.add(item.slug);
    if(!bySlug[item.slug])throw new Error('Missing complete akathist detail '+item.slug);
  }
  console.log('Published akathists in current offline JSON:',published.length);
  console.log('Offline content generated:',content.generated_at||'unknown');
  console.log('PASS: every published akathist will be available in the list and detail reader');
  console.log('AKATHIST OFFLINE CONTENT FILTER VERIFIED');
}catch(e){
  console.error('FAIL:',e.message||e);
  process.exit(1);
}

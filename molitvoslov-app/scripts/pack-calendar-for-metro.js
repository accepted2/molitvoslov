'use strict';
// Original JSON remains the authoritative, editable source. Generated modules
// contain only a gzip/base64 payload, not hundreds of MB of JS object literals.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const assert = require('node:assert/strict');
const {decodePackedMonth} = require('../src/services/calendarPackedMonth');

function encodeMonth(month) {
  const counts = new Map();
  function count(value) {
    if (typeof value === 'string' && value.length >= 64)
      counts.set(value, (counts.get(value) || 0) + 1);
    else if (Array.isArray(value)) value.forEach(count);
    else if (value && typeof value === 'object') {
      if (Object.prototype.hasOwnProperty.call(value, '$calendarString'))
        throw new Error('Reserved calendar key already exists');
      Object.values(value).forEach(count);
    }
  }
  count(month);
  const strings = [...counts].filter(([,n]) => n > 1).map(([s]) => s);
  const indices = new Map(strings.map((s,i) => [s,i]));
  const compact = JSON.stringify({version:1, strings, month: JSON.parse(JSON.stringify(month, (_key,v) =>
    typeof v === 'string' && indices.has(v) ? {$calendarString:indices.get(v)} : v))});
  return zlib.gzipSync(Buffer.from(compact,'utf8'), {level:9}).toString('base64');
}
function prepareCalendarModules(root, verify=false) {
  const data = path.join(root,'src','data');
  const dest = path.join(data,'calendar-packed');
  fs.mkdirSync(dest,{recursive:true});
  let rawBytes=0, packedBytes=0, dates=0;
  for (const year of [2025,2026,2027]) for (let m=1;m<=12;m++) {
    const name=year+'-'+String(m).padStart(2,'0')+'.json';
    const raw=fs.readFileSync(path.join(data,'calendar',name));
    const fingerprint=crypto.createHash('sha256').update('calendar-gzip-v1\n').update(raw).digest('hex');
    const out=path.join(dest,name), stamp=out+'.sha256';
    let encoded;
    if (fs.existsSync(out) && fs.existsSync(stamp) && fs.readFileSync(stamp,'utf8')===fingerprint) {
      encoded=JSON.parse(fs.readFileSync(out,'utf8'));
    } else {
      const original=JSON.parse(raw.toString('utf8'));
      encoded=encodeMonth(original);
      assert.equal(JSON.stringify(decodePackedMonth(encoded)),JSON.stringify(original),name+': lossless roundtrip');
      fs.writeFileSync(out+'.tmp',JSON.stringify(encoded));
      fs.renameSync(out+'.tmp',out);
      fs.writeFileSync(stamp,fingerprint);
    }
    if (verify) {
      const original=JSON.parse(raw.toString('utf8'));
      assert.equal(JSON.stringify(decodePackedMonth(encoded)),JSON.stringify(original),name+': lossless verification');
      dates+=Object.keys(original.days).length;
    }
    rawBytes+=raw.length; packedBytes+=encoded.length+2;
  }
  if (verify) assert.equal(dates,1095);
  assert.ok(packedBytes < rawBytes * 0.55,'Calendar compression did not sufficiently reduce bundle');
  console.log('CALENDAR PACKED: 36 months; '+(rawBytes/1048576).toFixed(2)+' MiB -> '+(packedBytes/1048576).toFixed(2)+' MiB; '+(verify?'1095 dates, lossless verified':'all source months retained'));
}
if (require.main===module) prepareCalendarModules(path.resolve(__dirname,'..'),process.argv.includes('--verify'));
module.exports={prepareCalendarModules,encodeMonth};

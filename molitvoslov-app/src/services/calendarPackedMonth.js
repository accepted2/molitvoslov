'use strict';
const {gunzipSync, strFromU8} = require('fflate');
const {toByteArray} = require('base64-js');

function decodePackedMonth(encoded) {
  const packed = JSON.parse(strFromU8(gunzipSync(toByteArray(encoded))));
  if (packed.version !== 1 || !Array.isArray(packed.strings)) {
    throw new Error('Unsupported packed calendar version');
  }
  function restore(value) {
    if (Array.isArray(value)) return value.map(restore);
    if (value && typeof value === 'object') {
      if (Object.keys(value).length === 1 && Object.prototype.hasOwnProperty.call(value, '$calendarString')) {
        const id = value.$calendarString;
        if (!Number.isInteger(id) || id < 0 || id >= packed.strings.length)
          throw new Error('Invalid calendar string index');
        return packed.strings[id];
      }
      for (const key of Object.keys(value)) value[key] = restore(value[key]);
    }
    return value;
  }
  return restore(packed.month);
}

module.exports = {decodePackedMonth};

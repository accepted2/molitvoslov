// Keep the exact source characters (including Church Slavonic accents and
// titla) when preparing Psalter text for favorites and the native share sheet.
// A plain-text receiver controls its own font: the app's font preference is
// persisted separately in the saved item's metadata.
const numberTraditional = value => {
  const units=['','а','в','г','д','є','ѕ','з','и','ѳ'];
  const tens=['','і','к','л','м','н','ѯ','ѻ','п','ч'];
  const hundreds=['','р','с'];
  const number=Number(value);
  if(!Number.isInteger(number)||number<1||number>299)return String(value);
  if(number>=11&&number<=19)return units[number-10]+'і҃';
  const letters=(number>=100?hundreds[Math.floor(number/100)]:'')+
    tens[Math.floor((number%100)/10)]+units[number%10];
  return letters+'҃';
};

export const fontFamilyForPsalterMode = mode =>
  mode==='traditional' ? 'Ponomar' : 'serif';

export const psalmTitleForMode = (psalm,mode) =>
  mode==='traditional' ? 'Ѱало́мъ '+numberTraditional(psalm?.number) :
    'Псалом '+String(psalm?.number||'');

const fieldForMode = mode => ({
  traditional:'church_slavonic_traditional',
  church:'church_slavonic',
  russian:'russian',
  ukrainian:'ukrainian',
})[mode];

const psalmBody = (psalm,mode) => {
  const field=fieldForMode(mode);
  if(!field)return '';
  return (psalm?.verses||[]).map(verse => {
    const text=String(verse?.[field]||'').trim();
    if(!text)return '';
    const number=mode==='traditional'
      ? numberTraditional(verse.number):String(verse.number);
    return number+'. '+text;
  }).filter(Boolean).join('\n');
};

export const psalmTextForMode = (psalm,mode='church') => {
  if(!psalm)return '';
  if(mode==='both'){
    const church=psalmBody(psalm,'church');
    const russian=psalmBody(psalm,'russian');
    return [
      psalmTitleForMode(psalm,'church'),
      church ? 'Церковнославянский:\n'+church : '',
      russian ? 'Русский:\n'+russian : '',
    ].filter(Boolean).join('\n\n');
  }
  const body=psalmBody(psalm,mode);
  return body ? psalmTitleForMode(psalm,mode)+'\n\n'+body : '';
};

export const kathismaTextForMode = (kathisma,mode='church') =>
  (kathisma?.psalms||[]).map(psalm=>psalmTextForMode(psalm,mode))
    .filter(Boolean).join('\n\n');

export const psalterSaveMetadata = mode => ({
  reader_mode:mode,
  language:mode==='both'?'both':mode,
  font_family:fontFamilyForPsalterMode(mode),
});

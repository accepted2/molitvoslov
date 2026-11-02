import React, {useEffect, useMemo, useState} from 'react';
import {ActivityIndicator, Pressable, StyleSheet, Text, View} from 'react-native';
import SelectableSaveText from './SelectableSaveText';
import {deleteSavedItem, getSavedItems, saveItem} from '../../services/savedItems';

/** Stable positive integer key compatible with the existing saved_items schema. */
export const savedSourceId = (value) => {
  const number = Number(value);
  if (Number.isSafeInteger(number) && number > 0 && number <= 2147483647) return number;
  let hash = 2166136261;
  for (const char of String(value || 'calendar')) {
    hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  }
  return (hash >>> 0) % 2147483646 + 1;
};

export const makeCalendarSaveContext = ({feast, date, section, title, sectionTitle}) => {
  const identity = feast?.id || feast?.sync_uid || feast?.title || title || date;
  const sourceId = savedSourceId(identity);
  const kind = {life: 1, troparion: 2, kontakion: 3, prayer: 4}[section] || 5;
  return {
    sourceType: 'calendar',
    sourceId,
    anchorType: 'calendar_section',
    anchorId: kind,
    sourceTitle: String(title || feast?.title || 'Церковный календарь'),
    itemTitle: sectionTitle,
    fullSaveType: section === 'prayer' ? 'prayer' : 'text',
    metadata: {
      date: date || null,
      feast_id: feast?.id ?? null,
      feast_uid: feast?.sync_uid || null,
      feast_title: feast?.title || title || '',
      section,
    },
  };
};

export const CalendarSaveWholeButton = ({text, saveContext}) => {
  const [saved, setSaved] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const {sourceType, sourceId, anchorType, anchorId, sourceTitle, itemTitle, fullSaveType, metadata} = saveContext;
  const normalized = String(text || '').trim();
  useEffect(() => {
    let active = true;
    setSaved(null);
    setError('');
    getSavedItems({source_type: sourceType, source_id: sourceId})
      .then((items) => {
        if (!active) return;
        setSaved(items.find((item) =>
          item.anchor_type === anchorType &&
          Number(item.anchor_id) === anchorId &&
          item.save_type === fullSaveType &&
          item.start_offset === 0 &&
          item.end_offset === normalized.length &&
          item.text === normalized
        ) || null);
      }).catch((reason) => {
        console.warn('[calendar saved] load:', reason?.message || reason);
      });
    return () => {active = false;};
  }, [sourceType, sourceId, anchorType, anchorId, fullSaveType, normalized]);

  const toggle = async () => {
    if (busy || !normalized) return;
    setBusy(true);
    setError('');
    try {
      if (saved) {
        await deleteSavedItem(saved.id);
        setSaved(null);
      } else {
        const row = await saveItem({
          save_type: fullSaveType,
          source_type: sourceType, source_id: sourceId,
          anchor_type: anchorType, anchor_id: anchorId,
          source_title: sourceTitle, item_title: itemTitle, text: normalized,
          start_offset: 0, end_offset: normalized.length, metadata,
        });
        setSaved(row);
      }
    } catch (reason) {
      console.warn('[calendar saved] toggle:', reason?.message || reason);
      setError('Не удалось сохранить');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.saveRow}>
      <Pressable onPress={toggle} disabled={busy} accessibilityRole="button"
        accessibilityLabel={saved ? 'Убрать из избранного' : 'Сохранить текст целиком'}
        style={({pressed}) => [styles.saveButton, saved && styles.saveButtonActive, pressed && styles.pressed]}>
        {busy ? <ActivityIndicator size="small" color="#77502D" /> :
          <Text style={styles.saveLabel}>{saved ? '♥ Сохранено' : '♡ Сохранить целиком'}</Text>}
      </Pressable>
      {!!error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
};

/** Uses the app-wide selection bar, including sentence/paragraph classification. */
export const CalendarSelectableBody = ({text, saveContext, textStyle}) => {
  const normalized = useMemo(() => String(text || '').replace(/\r\n?/g, '\n').trim(), [text]);
  if (!normalized) return null;
  return (
    <SelectableSaveText
      text={normalized}
      textStyle={textStyle}
      sourceType={saveContext.sourceType}
      sourceId={saveContext.sourceId}
      anchorType={saveContext.anchorType}
      anchorId={saveContext.anchorId}
      sourceTitle={saveContext.sourceTitle}
      itemTitle={saveContext.itemTitle}
      metadata={saveContext.metadata}
      fullSaveType={null}
    />
  );
};

const styles=StyleSheet.create({
  saveRow:{flexDirection:'row',alignItems:'center',flexWrap:'wrap',gap:8,marginBottom:9},
  saveButton:{minHeight:32,borderRadius:16,paddingHorizontal:12,paddingVertical:6,borderWidth:1,borderColor:'#D9B98C',backgroundColor:'#F5E6CC',justifyContent:'center'},
  saveButtonActive:{borderColor:'#AC7E43',backgroundColor:'#E8CFAB'},
  saveLabel:{color:'#77502D',fontWeight:'700',fontSize:12},
  pressed:{opacity:0.66},
  error:{color:'#A13C31',fontSize:12},
});

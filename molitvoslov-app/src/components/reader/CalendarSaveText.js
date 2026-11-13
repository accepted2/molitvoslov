import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {ActivityIndicator, Pressable, StyleSheet, Text, View} from 'react-native';
import {FontAwesome,Feather} from '@expo/vector-icons';
import {ContentContextMenu} from '../share/ContentContextMenu';
import SelectableDocumentReader from './SelectableDocumentReader';
import {calendarSectionTitle} from '../../services/personalPrayerPresentation';
import {useTextSelection} from '../../context/TextSelectionContext';
import {deleteSavedItem, getSavedItems, saveItem} from '../../services/savedItems';

/** Same canonical content in the calendar accordion and the saint detail card. */
const normalizeSavedText = (value) =>
  String(value || '').replace(/\r\n?/g, '\n')
    .split('\n').map(line => line.trim()).join('\n')
    .replace(/\n{3,}/g, '\n\n').trim();

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

export const makeCalendarSaveContext = ({feast, date, section, title, sectionTitle, fontFamily = 'serif'}) => {
  const identity = feast?.id || feast?.sync_uid || feast?.title || title || date;
  const sourceId = savedSourceId(identity);
  const kind = {life: 1, troparion: 2, kontakion: 3, prayer: 4}[section] || 5;
  return {
    sourceType: 'calendar',
    sourceId,
    anchorType: 'calendar_section',
    anchorId: kind,
    sourceTitle: String(title || feast?.title || 'Церковный календарь'),
    itemTitle: (section === 'troparion' || section === 'kontakion')
      ? (calendarSectionTitle(section, feast?.title || title) || sectionTitle)
      : sectionTitle,
    fullSaveType: section === 'prayer' ? 'prayer' : 'text',
    metadata: {
      // Persist the actual source font: accented troparia and kontakia are
      // often rendered in ordinary serif, NOT traditional Ponomar.
      font_family: String(fontFamily || 'serif'),
      date: date || null,
      feast_id: feast?.id ?? null,
      feast_uid: feast?.sync_uid || null,
      feast_title: feast?.title || title || '',
      section,
    },
  };
};

export const CalendarSaveWholeButton = React.forwardRef(({
  text,saveContext,onSavedChange,menuVariant=false,onShare,
},ref) => {
  const [saved, setSaved] = useState(null);
  const [busy, setBusy] = useState(false);
  const [actionOpen,setActionOpen] = useState(false);
  React.useImperativeHandle(ref,()=>({openMenu:()=>setActionOpen(true)}),[]);
  const [error, setError] = useState('');
  const {sourceType, sourceId, anchorType, anchorId, sourceTitle, itemTitle, fullSaveType, metadata} = saveContext;
  const normalized = normalizeSavedText(text);
  // Keep the section highlight and the heart state in sync without triggering
  // repeat database queries when an inline callback changes identity.
  const notifySaved = useRef(onSavedChange);
  notifySaved.current = onSavedChange;
  useEffect(() => {
    let active = true;
    setSaved(null);
    notifySaved.current?.(false);
    setError('');
    getSavedItems({source_type: sourceType, source_id: sourceId})
      .then((items) => {
        if (!active) return;
        const match = items.find((item) =>
          item.anchor_type === anchorType &&
          Number(item.anchor_id) === anchorId &&
          item.save_type === fullSaveType &&
          item.start_offset === 0 &&
          item.end_offset === normalized.length &&
          item.text === normalized
        ) || null;
        setSaved(match);
        notifySaved.current?.(!!match);
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
        notifySaved.current?.(false);
      } else {
        const row = await saveItem({
          save_type: fullSaveType,
          source_type: sourceType, source_id: sourceId,
          anchor_type: anchorType, anchor_id: anchorId,
          source_title: sourceTitle, item_title: itemTitle, text: normalized,
          start_offset: 0, end_offset: normalized.length, metadata,
        });
        setSaved(row);
        notifySaved.current?.(true);
      }
    } catch (reason) {
      console.warn('[calendar saved] toggle:', reason?.message || reason);
      setError('Не удалось сохранить');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={[styles.saveRow, menuVariant && styles.saveRowCompact]}>
      <Pressable
        onPress={menuVariant?()=>setActionOpen(true):toggle}
        disabled={busy}
        hitSlop={menuVariant ? 10 : 7}
        accessibilityRole="button"
        accessibilityLabel={menuVariant?'Действия с текстом':saved ? 'Убрать из избранного' : 'Сохранить текст целиком'}
        accessibilityState={{selected: !!saved, disabled: busy}}
        style={({pressed}) => [
          styles.saveButton,
          menuVariant && styles.saveButtonCompact,
          pressed && !busy && styles.pressed,
        ]}
      >
        {busy ? (
          <ActivityIndicator size="small" color="#765238" />
        ) : menuVariant ? (
          <Feather name="more-vertical" size={18} color="#765238"/>
        ) : (
          <FontAwesome
            name={saved ? 'heart' : 'heart-o'}
            size={19}
            color={saved ? '#765238' : '#765238'}
            accessibilityElementsHidden
            importantForAccessibility="no"
          />
        )}
      </Pressable>
      {!!error && <Text style={styles.error}>{error}</Text>}
      {!!menuVariant && <ContentContextMenu
        visible={actionOpen}
        title={itemTitle||sourceTitle||'Молитва'}
        onClose={()=>setActionOpen(false)}
        onShare={onShare}
        onSave={toggle}
        saved={!!saved}
      />}
    </View>
  );
});

let calendarInlineSelectionCounter = 0;

/** Inline read-only calendar content uses the SAME gesture/fragment engine as
 * every other WebView reader. Never mount a TextInput in a saint's life. */
export const CalendarSelectableBody = ({text, saveContext, textStyle}) => {
  const normalized = useMemo(() => normalizeSavedText(text), [text]);
  const [savedItems, setSavedItems] = useState([]);
  const {activateSelection, clearSelection} = useTextSelection();
  const readerRef = useRef(null);
  const selectionIdRef = useRef(null);
  if (selectionIdRef.current === null) {
    calendarInlineSelectionCounter += 1;
    selectionIdRef.current = 'calendar-inline-' + calendarInlineSelectionCounter;
  }
  const numericId = Number(saveContext.sourceId);
  const metadataKey = JSON.stringify(saveContext.metadata || {});
  useEffect(() => () => clearSelection(selectionIdRef.current), [clearSelection]);
  const onEmbeddedSelection = useCallback((info) => {
    if (!info.active) {
      clearSelection(selectionIdRef.current);
      return;
    }
    activateSelection({
      id: selectionIdRef.current,
      count: Number(info.count) || 0,
      tooLong: false,
      canSave: !info.pending && Number(info.count) > 0,
      actionLabel: info.removable ? 'Удалить' : 'Сохранить',
      onSave: () => readerRef.current?.saveEmbeddedSelection() ||
        Promise.resolve({ok: false, message: 'Читатель не готов'}),
      onShare: () => readerRef.current?.shareEmbeddedSelection(),
      onClear: () => readerRef.current?.clearEmbeddedSelection(),
    });
  }, [activateSelection, clearSelection]);
  useEffect(() => {
    let live = true;
    setSavedItems([]);
    getSavedItems({source_type: saveContext.sourceType, source_id: numericId})
      .then(items => {
        if (!live) return;
        // Whole-text heart saves must NOT paint the text background; only
        // independently selected fragments use the saved-range highlight.
        setSavedItems(items.filter(item =>
          item.anchor_type === saveContext.anchorType &&
          Number(item.anchor_id) === Number(saveContext.anchorId) &&
          item.save_type !== saveContext.fullSaveType
        ));
      })
      .catch(error => console.warn('[calendar reader] saved excerpts:', error?.message || error));
    return () => {live = false;};
  }, [saveContext.sourceType, saveContext.anchorType, numericId,
    saveContext.anchorId, saveContext.fullSaveType, normalized]);
  const doc = useMemo(() => ({
    embedded: true,
    title: '',
    progressAnchorType: 'calendar_section',
    savedItems,
    sections: [{
      title: '',
      progressAnchorId: saveContext.anchorId,
      trackProgress: false,
      rows: [{
        layout: 'stack',
        blocks: [{
          id: Number(saveContext.anchorId),
          text: normalized,
          className: 'calendar-inline-text',
          sourceType: saveContext.sourceType,
          sourceId: numericId,
          anchorType: saveContext.anchorType,
          anchorId: saveContext.anchorId,
          sourceTitle: saveContext.sourceTitle,
          itemTitle: saveContext.itemTitle,
          metadata: JSON.parse(metadataKey),
          fullSaveType: null,
        }],
      }],
    }],
  }), [normalized, numericId, saveContext.sourceType, saveContext.anchorType,
    saveContext.anchorId, saveContext.sourceTitle, saveContext.itemTitle,
    metadataKey, savedItems]);
  if (!normalized) return null;
  return (
    <SelectableDocumentReader
      ref={readerRef}
      documentData={doc}
      onEmbeddedSelection={onEmbeddedSelection}
      embedded
      embeddedTextStyle={StyleSheet.flatten(textStyle)}
      backgroundColor="#FFF4DE"
      respectBottomSafeArea={false}
    />
  );
};

const styles = StyleSheet.create({
  saveRow: {flexDirection:'row',alignItems:'center',minHeight:42,paddingVertical:3},
  saveRowCompact: {minHeight:36,paddingVertical:2},
  saveButton: {
    width:36,height:36,borderRadius:18,borderWidth:1,
    borderColor:'rgba(123, 79, 36, 0.20)',
    backgroundColor:'rgba(241, 223, 194, 0.94)',
    justifyContent:'center',alignItems:'center',
  },
  saveButtonCompact:{width:30,height:30,borderRadius:15},
  saveButtonActive: {
    backgroundColor:'#F1DFC2',
    borderColor:'rgba(123, 79, 36, 0.28)',
  },
  pressed: {opacity:0.66},
  error: {color:'#A13C31',fontSize:12,marginLeft:9},
});

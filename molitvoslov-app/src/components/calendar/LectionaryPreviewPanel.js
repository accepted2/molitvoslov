import React, {useMemo, useState} from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import preview2027 from '../../data/lectionaryPreview2027.json';
import {getCurrentBibleContent} from '../../services/bibleStore';

// Preview only. This module never modifies the calendar API, SQLite, or Supabase.
const BOOK_CODES = {
  Matt: 'MAT', Mark: 'MRK', Luke: 'LUK', John: 'JHN', Acts: 'ACT',
  Rom: 'ROM', '1Cor': '1CO', '2Cor': '2CO', Gal: 'GAL', Eph: 'EPH',
  Phil: 'PHP', Col: 'COL', '1Thess': '1TH', '2Thess': '2TH',
  '1Tim': '1TI', '2Tim': '2TI', Titus: 'TIT', Phlm: 'PHM',
  Heb: 'HEB', James: 'JAS', '1Pet': '1PE', '2Pet': '2PE',
  '1John': '1JN', '2John': '2JN', '3John': '3JN', Jude: 'JUD',
  Gen: 'GEN', Exod: 'EXO', Prov: 'PRO', Isa: 'ISA',
};

const KINDS = {gospel: 'Евангелие', apostle: 'Апостол', old_testament: 'Ветхий Завет'};

function findOpening(bible, segment) {
  if (!bible || !segment) return null;
  const code = BOOK_CODES[segment.book];
  const book = (bible.books || []).find((candidate) => candidate.code === code);
  const chapter = book?.chapters?.find((c) => Number(c.number) === Number(segment.start?.chapter));
  const verse = chapter?.verses?.find((v) => Number(v.number) === Number(segment.start?.verse));
  return book && chapter && verse ? {book, chapter, verse} : null;
}

function openSegment(navigation, opening) {
  if (!opening) return;
  navigation.push('BibleChapter', {
    bookId: opening.book.id,
    chapterNumber: Number(opening.chapter.number),
    focusTarget: {
      save_type: 'verse',
      anchor_type: 'bible_verse',
      anchor_id: Number(opening.verse.id),
      start_offset: null,
      end_offset: null,
      metadata: {
        book_id: Number(opening.book.id),
        book_slug: opening.book.slug,
        chapter_number: Number(opening.chapter.number),
        verse_number: Number(opening.verse.number),
      },
    },
  });
}

function segmentName(segment) {
  const start = segment.start || {};
  const end = segment.end || {};
  return `${segment.book} ${start.chapter}:${start.verse}–${end.chapter}:${end.verse}`;
}

function ReadingRow({reading, navigation, bible}) {
  const [expanded, setExpanded] = useState(false);
  const segments = reading.segments || [];
  const complete = reading.confidence === 'verified_rule';
  const openings = useMemo(() => segments.map((part) => findOpening(bible, part)), [bible, segments]);
  return (
    <View style={styles.reading}>
      <Text style={styles.kind}>
        {KINDS[reading.kind] || reading.kind}{reading.label ? ` · ${reading.label}` : ''}
      </Text>
      <Text style={styles.title}>{reading.title}</Text>
      <Text style={styles.status}>{complete ? 'Подтверждённое правило' : 'Непроверенный кандидат'}</Text>
      <Pressable
        accessibilityRole="button"
        onPress={() => openings[0] && openSegment(navigation, openings[0])}
        disabled={!openings[0]}
        style={styles.action}
      >
        <Text style={styles.actionText}>{openings[0] ? 'Открыть в Библии →' : 'Нет привязки к Библии'}</Text>
      </Pressable>
      {segments.length > 1 && (
        <>
          <Pressable accessibilityRole="button" onPress={() => setExpanded((v) => !v)} style={styles.secondaryAction}>
            <Text style={styles.secondaryText}>{expanded ? 'Скрыть' : 'Показать все'} {segments.length} фрагмента(ов)</Text>
          </Pressable>
          {expanded && segments.map((part, index) => (
            <Pressable
              key={`${index}-${segmentName(part)}`}
              disabled={!openings[index]}
              onPress={() => openSegment(navigation, openings[index])}
              style={styles.fragment}
            >
              <Text style={styles.fragmentText}>{segmentName(part)} →</Text>
            </Pressable>
          ))}
        </>
      )}
    </View>
  );
}

export function LectionaryPreviewPanel({selectedDate, navigation}) {
  const day = preview2027.days?.[selectedDate];
  const bible = getCurrentBibleContent('rst');
  if (!day || !selectedDate?.startsWith('2027-')) return null;

  const readings = (day.readings || []).slice().sort((a, b) => (a.order || 0) - (b.order || 0));
  const confirmed = readings.filter((reading) => reading.confidence === 'verified_rule').length;
  const candidate = readings.length - confirmed;
  return (
    <View style={styles.panel}>
      <Text style={styles.header}>Предпросмотр чтений · {selectedDate}</Text>
      <Text style={styles.caution}>
        Тестовый расчёт, НЕ утверждённый церковный календарь. Посты и памяти святых не изменяются.
        Подтверждено: {confirmed}; кандидатов: {candidate}.
      </Text>
      {readings.length ? (
        readings.map((reading, index) => (
          <ReadingRow key={`${reading.reading_id}-${index}`} reading={reading} navigation={navigation} bible={bible} />
        ))
      ) : (
        <Text style={styles.empty}>Для этой даты нет рассчитанных чтений: правила ещё не заполнены.</Text>
      )}
      {!!day.diagnostics?.length && (
        <Text style={styles.diagnostic}>
          Требуется проверка уставных правил ({day.diagnostics.length}). Эти назначения не записаны в базу.
        </Text>
      )}
      {!bible && <Text style={styles.diagnostic}>Локальная Библия пока не загружена.</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {borderRadius: 16, backgroundColor: '#FFF5E1', padding: 14, marginBottom: 14, borderWidth: 1, borderColor: '#C79F60'},
  header: {fontSize: 17, fontWeight: '700', color: '#56351E', marginBottom: 8},
  caution: {fontSize: 12, color: '#79552D', lineHeight: 18, marginBottom: 10},
  reading: {backgroundColor: '#FFFDF8', padding: 10, borderRadius: 10, marginBottom: 9, borderWidth: 1, borderColor: '#EAD8BD'},
  kind: {color: '#7A5531', fontSize: 12, fontWeight: '700', marginBottom: 4},
  title: {color: '#3D281C', fontSize: 15, fontWeight: '600'},
  status: {color: '#936D3C', fontSize: 11, marginTop: 4},
  action: {paddingVertical: 8},
  actionText: {color: '#805023', fontSize: 14, fontWeight: '700'},
  secondaryAction: {paddingVertical: 7},
  secondaryText: {color: '#725030', fontSize: 12},
  fragment: {paddingVertical: 6, borderTopWidth: 1, borderColor: '#EEE0CB'},
  fragmentText: {color: '#71502E', fontSize: 13},
  empty: {color: '#61482C', fontSize: 14, paddingVertical: 10},
  diagnostic: {color: '#8C5A32', fontSize: 11, paddingTop: 6},
});

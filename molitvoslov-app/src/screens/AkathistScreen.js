import React, { useEffect, useRef, useState } from 'react';

import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { api } from '../api';
import { useReadingProgress } from '../hooks/useReadingProgress';


const MODE_CHURCH = 'church';
const MODE_BOTH = 'both';
const MODE_RUSSIAN = 'russian';


/*
 * Обычные логические абзацы.
 *
 * Используются там, где нам важно сохранить группировку,
 * полученную от backend/importer.
 */
const splitParagraphs = text => {
  if (!text) {
    return [];
  }

  return text
    .trim()
    .split(/\n\s*\n/)
    .map(paragraph => paragraph.trim())
    .filter(Boolean);
};


/*
 * Строки внутри абзаца.
 *
 * EPUB может содержать:
 *
 * <br>
 *
 * Мы сохраняем его в БД как одиночный "\n".
 *
 * Поэтому здесь одиночный перенос тоже считается
 * самостоятельной отображаемой строкой.
 */
const splitLines = text => {
  if (!text) {
    return [];
  }

  return text
    .split(/\n+/)
    .map(line => line.trim())
    .filter(Boolean);
};


/*
 * Для Кондаков/Икосов превращаем текст в мелкие
 * отображаемые блоки.
 *
 * Например:
 *
 * вступление
 * Радуйся...
 * Радуйся...
 *
 * станет тремя блоками.
 *
 * У Николая это не ломает уже существующее разбиение,
 * потому что \n\n тоже будет корректно обработан.
 */
const splitReadingBlocks = text => {
  const paragraphs = splitParagraphs(text);
  const result = [];

  paragraphs.forEach(paragraph => {
    const lines = splitLines(paragraph);

    if (lines.length) {
      result.push(...lines);
    }
  });

  return result;
};


/*
 * Убираем ударения и приводим слово к виду,
 * подходящему для сравнения.
 *
 * NFD нужен, чтобы даже составные Unicode-символы
 * разложились на букву + знак ударения.
 */
const removeAccents = text => {
  if (!text) {
    return '';
  }

  return text
    .normalize('NFD')
    .replace(
      /[\u0300\u0301\u0340\u0341\u0483-\u0487]/g,
      ''
    )
    .replace(
      /[\u200B-\u200D\uFEFF]/g,
      ''
    )
    .normalize('NFC');
};


const renderStyledLine = (
  line,
  baseStyle,
  key,
) => {
  if (!line) {
    return null;
  }

  const firstWordMatch = line.match(
    /^([^\s,.;:!?]+)/u
  );

  if (!firstWordMatch) {
    return (
      <Text key={key} style={baseStyle}>
        {line}
      </Text>
    );
  }

  const originalWord =
    firstWordMatch[1];

  const normalizedWord =
    removeAccents(originalWord);

  const rest = line.slice(
    originalWord.length
  );

  let accentStyle = null;

  /*
   * ВАЖНО:
   * сравнение регистрозависимое.
   *
   * "Радуйся" -> выделяем.
   * "радуйся" -> НЕ выделяем.
   */
  if (normalizedWord === 'Радуйся') {
    accentStyle = styles.rejoice;
  }

  if (normalizedWord === 'Иисусе') {
    accentStyle = styles.jesusInvocation;
  }

  if (normalizedWord === 'Аллилуиа') {
    accentStyle = styles.alleluia;
  }

  if (!accentStyle) {
    return (
      <Text key={key} style={baseStyle}>
        {line}
      </Text>
    );
  }

  return (
    <Text key={key} selectable style={baseStyle}>
      <Text style={accentStyle}>
        {originalWord}
      </Text>

      {rest}
    </Text>
  );
};


const renderStyledText = (
  text,
  baseStyle,
) => {
  if (!text) {
    return null;
  }

  const lines = text.split('\n');

  return (
    <Text selectable style={baseStyle}>
      {lines.map((line, index) => (
        <React.Fragment key={index}>
          {renderStyledLine(
            line,
            baseStyle,
            index
          )}

          {index < lines.length - 1
            ? '\n'
            : null}
        </React.Fragment>
      ))}
    </Text>
  );
};


const LanguageButton = ({
                          title,
                          active,
                          onPress,
                          disabled = false,
                        }) => {
  return (
    <TouchableOpacity
      activeOpacity={0.8}
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.languageButton,
        active && styles.languageButtonActive,
        disabled && styles.languageButtonDisabled,
      ]}
    >
      <Text
        style={[
          styles.languageButtonText,
          active && styles.languageButtonTextActive,
          disabled && styles.languageButtonTextDisabled,
        ]}
      >
        {title}
      </Text>
    </TouchableOpacity>
  );
};


export const AkathistScreen = ({ route }) => {
  const {
    akathistId,
    slug,
    title,
  } = route.params;

  const [akathist, setAkathist] = useState(null);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState(MODE_BOTH);

  const scrollRef = useRef(null);
  const sectionPositionsRef = useRef({});
  const savedAnchorIdRef = useRef(null);
  const restoredRef = useRef(false);
  const currentSectionRef = useRef(null);
  const restoringRef = useRef(false);

  const {
    savedProgress,
    scheduleSave,
  } = useReadingProgress({
    sourceType: 'akathist',
    sourceId: akathistId,
  });


  useEffect(() => {
    if (
      savedProgress?.anchor_type !==
      'akathist_section'
    ) {
      return;
    }

    savedAnchorIdRef.current =
      savedProgress.anchor_id;

    tryRestorePosition();
  }, [savedProgress]);


  useEffect(() => {
    sectionPositionsRef.current = {};
    savedAnchorIdRef.current = null;
    restoredRef.current = false;
    currentSectionRef.current = null;
    restoringRef.current = false;

    loadAkathist();
  }, [slug]);


  const loadAkathist = async () => {
    try {
      setLoading(true);

      const response = await api.get(
        `akathists/${slug}/`
      );

      setAkathist(response.data);
    } catch (error) {
      console.error(
        'Ошибка загрузки акафиста:',
        error
      );
    } finally {
      setLoading(false);
    }
  };


  const handleSectionLayout = (
    sectionId,
    event
  ) => {
    sectionPositionsRef.current[sectionId] =
      event.nativeEvent.layout.y;

    tryRestorePosition();
  };


  const tryRestorePosition = () => {
    if (restoredRef.current) {
      return;
    }

    const anchorId =
      savedAnchorIdRef.current;

    if (!anchorId) {
      return;
    }

    const y =
      sectionPositionsRef.current[anchorId];

    if (
      y === undefined ||
      !scrollRef.current
    ) {
      return;
    }

    restoredRef.current = true;
    restoringRef.current = true;

    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({
        y: Math.max(y - 30, 0),
        animated: false,
      });

      setTimeout(() => {
        restoringRef.current = false;
      }, 300);
    });
  };


  const getCurrentSection = scrollY => {
    const positions = Object.entries(
      sectionPositionsRef.current
    )
      .map(([id, y]) => ({
        id: Number(id),
        y,
      }))
      .sort((a, b) => a.y - b.y);

    if (!positions.length) {
      return null;
    }

    const readingLine = scrollY + 70;
    let current = positions[0];

    for (const position of positions) {
      if (position.y <= readingLine) {
        current = position;
      } else {
        break;
      }
    }

    return current;
  };


  const handleScroll = event => {
    if (restoringRef.current) {
      return;
    }

    const scrollY =
      event.nativeEvent.contentOffset.y;

    const current =
      getCurrentSection(scrollY);

    if (
      !current ||
      currentSectionRef.current === current.id
    ) {
      return;
    }

    currentSectionRef.current = current.id;

    scheduleSave({
      anchorType: 'akathist_section',
      anchorId: current.id,
      offset: 0,
    });
  };


  const getSectionTitle = section => {
    if (
      section.section_type === 'kontakion'
    ) {
      return `Кондак ${section.number}`;
    }

    if (
      section.section_type === 'ikos'
    ) {
      return `Икос ${section.number}`;
    }

    if (
      section.section_type === 'prayer'
    ) {
      return section.number
        ? `Молитва ${section.number}`
        : 'Молитва';
    }

    return '';
  };


  const showChurch =
    viewMode === MODE_CHURCH ||
    viewMode === MODE_BOTH;

  const showRussian =
    viewMode === MODE_RUSSIAN ||
    viewMode === MODE_BOTH;


  /*
   * Проверяем, есть ли вообще русский перевод
   * хотя бы где-нибудь в конкретном акафисте.
   *
   * Это пригодится для акафистов вроде
   * Рождества Богородицы, где EPUB содержит
   * только церковнославянский текст.
   */
  const hasRussianTranslation = (() => {
    if (!akathist) {
      return false;
    }

    const specialTexts = [
      akathist.troparion,
      akathist.kontakion_before,
      akathist.common_rule?.opening,
      akathist.common_rule?.ending,
    ];

    const specialHasRussian =
      specialTexts.some(
        item => !!item?.translation?.trim()
      );

    const sectionsHaveRussian =
      akathist.sections?.some(
        section =>
          !!section.text?.translation?.trim()
      );

    return (
      specialHasRussian ||
      sectionsHaveRussian
    );
  })();


  /*
   * Кондаки и Икосы.
   *
   * Здесь уже учитываем как:
   *
   * 1. Николая:
   *    много самостоятельных ЦС/RU блоков;
   *
   * 2. Иисуса:
   *    один большой блок, но внутри много <br>;
   *
   * 3. акафист только на ЦС:
   *    русский массив просто будет пустым.
   */
  const renderParallelSection = text => {
    const churchBlocks =
      splitReadingBlocks(
        text?.content
      );

    const russianBlocks =
      splitReadingBlocks(
        text?.translation
      );

    /*
     * Если количество строк совпадает,
     * показываем их строго попарно.
     */
    if (
      churchBlocks.length > 0 &&
      russianBlocks.length > 0 &&
      churchBlocks.length ===
      russianBlocks.length
    ) {
      return (
        <View>
          {churchBlocks.map(
            (church, index) => {
              const russian =
                russianBlocks[index];

              return (
                <View
                  key={index}
                  style={
                    styles.parallelParagraph
                  }
                >
                  {showChurch && (
                    <View
                      style={
                        styles.churchBlock
                      }
                    >
                      {renderStyledText(
                        church,
                        styles.churchText
                      )}
                    </View>
                  )}

                  {showRussian && (
                    <View
                      style={
                        styles.russianBlock
                      }
                    >
                      {renderStyledText(
                        russian,
                        styles.russianText
                      )}
                    </View>
                  )}
                </View>
              );
            }
          )}
        </View>
      );
    }

    /*
     * Если перевода нет вообще:
     * просто красиво выводим ЦС построчно.
     */
    if (!russianBlocks.length) {
      return (
        <View>
          {churchBlocks.map(
            (church, index) => (
              <View
                key={index}
                style={
                  styles.singleChurchLine
                }
              >
                {showChurch &&
                  renderStyledText(
                    church,
                    styles.churchText
                  )}
              </View>
            )
          )}
        </View>
      );
    }

    /*
     * Если число мелких строк ЦС/RU не совпало,
     * не пытаемся искусственно склеивать
     * неправильные строки.
     *
     * Возвращаемся к более крупным абзацам,
     * сформированным импортёром.
     */
    const churchParagraphs =
      splitParagraphs(
        text?.content
      );

    const russianParagraphs =
      splitParagraphs(
        text?.translation
      );

    const count = Math.max(
      churchParagraphs.length,
      russianParagraphs.length
    );

    return (
      <View>
        {Array.from({
          length: count,
        }).map((_, index) => {
          const church =
            churchParagraphs[index] || '';

          const russian =
            russianParagraphs[index] || '';

          return (
            <View
              key={index}
              style={
                styles.parallelParagraph
              }
            >
              {showChurch && !!church && (
                <View
                  style={
                    styles.churchBlock
                  }
                >
                  {renderStyledText(
                    church,
                    styles.churchText
                  )}
                </View>
              )}

              {showRussian &&
                !!russian && (
                  <View
                    style={
                      styles.russianBlock
                    }
                  >
                    {renderStyledText(
                      russian,
                      styles.russianText
                    )}
                  </View>
                )}
            </View>
          );
        })}
      </View>
    );
  };


  /*
   * Молитвы после акафиста.
   *
   * Здесь специально НЕ чередуем строки.
   *
   * Сначала вся молитва ЦС.
   * Затем весь перевод целиком.
   */
  const renderPrayer = text => {
    const church =
      text?.content?.trim() || '';

    const russian =
      text?.translation?.trim() || '';

    return (
      <View style={styles.prayerContainer}>
        {showChurch && !!church && (
          <View
            style={
              styles.wholePrayerBlock
            }
          >
            {renderStyledText(
              church,
              styles.churchText
            )}
          </View>
        )}

        {showRussian && !!russian && (
          <View
            style={
              styles.wholePrayerTranslation
            }
          >
            {renderStyledText(
              russian,
              styles.russianText
            )}
          </View>
        )}
      </View>
    );
  };


  /*
   * Общее начало/окончание,
   * тропарь и кондак.
   */
  const renderWholeText = (
    text,
    heading
  ) => {
    if (!text) {
      return null;
    }

    const church =
      text.content?.trim() || '';

    const russian =
      text.translation?.trim() || '';

    if (!church && !russian) {
      return null;
    }

    return (
      <View style={styles.specialBlock}>
        {!!heading && (
          <Text
            style={
              styles.specialHeading
            }
          >
            {heading}
          </Text>
        )}

        {showChurch && !!church && (
          <View
            style={styles.churchBlock}
          >
            {renderStyledText(
              church,
              styles.churchText
            )}
          </View>
        )}

        {showRussian && !!russian && (
          <View
            style={styles.russianBlock}
          >
            {renderStyledText(
              russian,
              styles.russianText
            )}
          </View>
        )}
      </View>
    );
  };


  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator
          size="large"
          color="#2c3e50"
        />

        <Text
          style={styles.loadingText}
        >
          Загрузка...
        </Text>
      </View>
    );
  }


  if (!akathist) {
    return (
      <View style={styles.center}>
        <Text>
          Не удалось загрузить акафист
        </Text>
      </View>
    );
  }


  return (
    <ScrollView
      ref={scrollRef}
      style={styles.container}
      contentContainerStyle={
        styles.contentContainer
      }
      onScroll={handleScroll}
      scrollEventThrottle={200}
    >
      <Text style={styles.headerTitle}>
        {akathist.title || title}
      </Text>

      <View
        style={styles.languageSwitcher}
      >
        <LanguageButton
          title="ЦС"
          active={
            viewMode === MODE_CHURCH
          }
          onPress={() =>
            setViewMode(MODE_CHURCH)
          }
        />

        <LanguageButton
          title="ЦС + Русский"
          active={
            viewMode === MODE_BOTH
          }
          disabled={
            !hasRussianTranslation
          }
          onPress={() =>
            setViewMode(MODE_BOTH)
          }
        />

        <LanguageButton
          title="Русский"
          active={
            viewMode === MODE_RUSSIAN
          }
          disabled={
            !hasRussianTranslation
          }
          onPress={() =>
            setViewMode(MODE_RUSSIAN)
          }
        />
      </View>


      {!!akathist.common_rule?.opening && (
        <>
          <Text
            style={
              styles.majorSectionTitle
            }
          >
            Молитвы перед чтением акафиста
          </Text>

          {renderWholeText(
            akathist.common_rule.opening
          )}

          <View
            style={styles.majorDivider}
          />
        </>
      )}


      {!!akathist.troparion &&
        renderWholeText(
          akathist.troparion,
          'Тропарь'
        )}


      {!!akathist.kontakion_before &&
        renderWholeText(
          akathist.kontakion_before,
          'Кондак'
        )}


      {(akathist.troparion ||
        akathist.kontakion_before) && (
        <View
          style={styles.majorDivider}
        />
      )}


      {akathist.sections.map(
        (section, index) => {
          const sectionTitle =
            getSectionTitle(section);

          const isPrayer =
            section.section_type ===
            'prayer';

          return (
            <View
              key={section.id}
              style={styles.section}
              onLayout={event =>
                handleSectionLayout(
                  section.id,
                  event
                )
              }
            >
              {!!sectionTitle && (
                <Text
                  style={[
                    styles.sectionTitle,
                    isPrayer &&
                    styles.prayerTitle,
                  ]}
                >
                  {sectionTitle}
                </Text>
              )}

              {!!section.note && (
                <Text
                  style={styles.note}
                >
                  {section.note}
                </Text>
              )}

              {isPrayer
                ? renderPrayer(
                  section.text
                )
                : renderParallelSection(
                  section.text
                )}

              {index <
                akathist.sections.length -
                1 && (
                  <View
                    style={styles.divider}
                  />
                )}
            </View>
          );
        }
      )}


      {!!akathist.common_rule?.ending && (
        <>
          <View
            style={styles.majorDivider}
          />

          <Text
            style={
              styles.majorSectionTitle
            }
          >
            Окончание чтения акафиста
          </Text>

          {renderWholeText(
            akathist.common_rule.ending
          )}
        </>
      )}
    </ScrollView>
  );
};


const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#faf8f5',
  },

  contentContainer: {
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 60,
  },

  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },

  loadingText: {
    marginTop: 10,
  },

  headerTitle: {
    fontSize: 23,
    lineHeight: 29,
    fontWeight: '700',
    color: '#2c3e50',
    textAlign: 'center',
    marginBottom: 18,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e5dfd8',
    fontFamily: 'serif',
  },

  languageSwitcher: {
    flexDirection: 'row',
    marginBottom: 24,
    padding: 4,
    borderRadius: 10,
    backgroundColor: '#eee9e3',
  },

  languageButton: {
    flex: 1,
    paddingVertical: 9,
    paddingHorizontal: 4,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },

  languageButtonActive: {
    backgroundColor: '#2c3e50',
  },

  languageButtonDisabled: {
    opacity: 0.4,
  },

  languageButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6f6f6f',
    textAlign: 'center',
  },

  languageButtonTextActive: {
    color: '#fff',
  },

  languageButtonTextDisabled: {
    color: '#999',
  },

  majorSectionTitle: {
    fontSize: 20,
    lineHeight: 26,
    fontWeight: '700',
    color: '#80552e',
    textAlign: 'center',
    marginBottom: 16,
    fontFamily: 'serif',
  },

  section: {
    marginBottom: 18,
  },

  sectionTitle: {
    fontSize: 19,
    lineHeight: 24,
    fontWeight: '700',
    color: '#80552e',
    textAlign: 'center',
    marginBottom: 11,
    fontFamily: 'serif',
  },

  prayerTitle: {
    fontSize: 20,
    marginTop: 4,
    marginBottom: 12,
  },

  specialHeading: {
    fontSize: 18,
    lineHeight: 23,
    fontWeight: '700',
    color: '#80552e',
    textAlign: 'center',
    marginBottom: 10,
    fontFamily: 'serif',
  },

  note: {
    fontSize: 13,
    lineHeight: 19,
    color: '#ae1721',
    fontStyle: 'italic',
    textAlign: 'center',
    marginBottom: 10,
    fontFamily: 'serif',
  },

  churchText: {
    fontSize: 17,
    lineHeight: 24,
    color: '#292929',
    fontFamily: 'serif',
  },

  russianText: {
    fontSize: 16,
    lineHeight: 22,
    color: '#777',
    fontFamily: 'serif',
  },

  parallelParagraph: {
    marginBottom: 12,
  },

  singleChurchLine: {
    marginBottom: 4,
  },

  churchBlock: {
    marginBottom: 4,
  },

  russianBlock: {
    marginTop: 2,
  },

  prayerContainer: {
    marginBottom: 5,
  },

  wholePrayerBlock: {
    marginBottom: 15,
  },

  wholePrayerTranslation: {
    marginTop: 4,
  },

  specialBlock: {
    marginBottom: 22,
  },

  alleluia: {
    fontWeight: '700',
    color: '#ae1721',
  },

  rejoice: {
    fontWeight: '600',
    color: '#b34a3e',
  },

  jesusInvocation: {
    fontWeight: '600',
    color: '#b34a3e',
  },

  divider: {
    height: 1,
    backgroundColor: '#e6e1dc',
    marginTop: 20,
    marginBottom: 6,
  },

  majorDivider: {
    height: 1,
    backgroundColor: '#d8cec4',
    marginVertical: 24,
  },
});
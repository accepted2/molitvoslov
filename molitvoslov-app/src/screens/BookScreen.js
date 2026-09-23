import React, { useEffect, useState,useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import {
  useReadingProgress
} from '../hooks/useReadingProgress';
import { api } from '../api';

export const BookScreen = ({ route }) => {
  const {  categoryId, categorySlug, categoryName } = route.params;
  const [texts, setTexts] = useState([]);
  const [loading, setLoading] = useState(true);
  const scrollRef = useRef(null);

  const itemPositionsRef = useRef({});
  const savedAnchorIdRef = useRef(null);
  const restoredRef = useRef(false);
  const currentItemRef = useRef(null);
  const restoringRef = useRef(false);

  const {
    savedProgress,
    scheduleSave,
  } = useReadingProgress({
    sourceType: 'category',
    sourceId: categoryId,
  });

  useEffect(() => {
    if (
      savedProgress?.anchor_type ===
      'category_text'
    ) {
      savedAnchorIdRef.current =
        savedProgress.anchor_id;

      tryRestorePosition();
    }
  }, [savedProgress]);
  useEffect(() => {
    itemPositionsRef.current = {};
    savedAnchorIdRef.current = null;
    restoredRef.current = false;
    currentItemRef.current = null;

    loadTexts();
  }, [categorySlug]);

  const handleItemLayout = (
    itemId,
    event
  ) => {
    itemPositionsRef.current[itemId] =
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
      itemPositionsRef.current[
        anchorId
        ];

    if (y === undefined) {
      return;
    }

    if (!scrollRef.current) {
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

  const getCurrentItem = scrollY => {
    const positions =
      Object.entries(
        itemPositionsRef.current
      )
        .map(([id, y]) => ({
          id: Number(id),
          y,
        }))
        .sort(
          (a, b) => a.y - b.y
        );

    if (!positions.length) {
      return null;
    }

    const readingLine =
      scrollY + 70;

    let current =
      positions[0];

    for (const position of positions) {
      if (
        position.y <= readingLine
      ) {
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
      event.nativeEvent
        .contentOffset.y;

    const current =
      getCurrentItem(scrollY);

    if (!current) {
      return;
    }

    if (
      currentItemRef.current ===
      current.id
    ) {
      return;
    }

    currentItemRef.current =
      current.id;

    scheduleSave({
      anchorType: 'category_text',
      anchorId: current.id,
      offset: 0,
    });
  };

  const loadTexts = async () => {
    try {
      setLoading(true)
      const response = await api.get(`categories/${categorySlug}/texts/`);
      // Сортируем по полю order
      const sorted = response.data.sort((a, b) => a.order - b.order);
      setTexts(sorted);
    } catch (error) {
      console.error('Ошибка загрузки текстов:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#2c3e50" />
        <Text style={{ marginTop: 10 }}>Загрузка...</Text>
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
      <Text style={styles.headerTitle}>{categoryName}</Text>
      {texts.map((item, index) => (
        <View
          key={item.id}
          style={styles.block}
          onLayout={event =>
            handleItemLayout(
              item.id,
              event
            )
          }
        >
          <Text style={styles.title}>
            {item.text.title || 'Молитва'}
          </Text>

          {item.text.description_position === 'before' &&(
            item.text.description && (
                <Text style={styles.description}>
                  {item.text.description}
                </Text>
              )
          )}

          <Text style={styles.content}>
            {item.text.content}
          </Text>

          {item.text.description_position === 'after' &&
            !!item.text.description && (
              <Text style={styles.description}>
                {item.text.description}
              </Text>
            )}

          {index < texts.length - 1 && (
            <View style={styles.divider} />
          )}
        </View>
      ))}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,

    backgroundColor: '#faf8f5',
  },
  contentContainer: {
    paddingBottom: 40,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#2c3e50',
    textAlign: 'center',
    marginBottom: 20,
    paddingBottom: 10,
    borderBottomWidth: 2,
    borderBottomColor: '#eee',
  },
  block: {
    marginBottom: 20,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#717171',
    marginBottom: 8,
    textAlign: 'center',
    fontFamily: 'serif',
  },
  content: {
    fontSize: 16,
    lineHeight: 28,
    color: '#333',
    fontFamily: 'serif',
  },
  divider: {
    height: 1,
    backgroundColor: '#eee',
    marginVertical: 20,
  },
  description: {
    fontSize: 13,                    // размер шрифта
    color: '#ae1721',             // цвет текста
    fontStyle: 'italic',             // курсив
    fontWeight: '400',               // насыщенность (300 - тонкий, 400 - обычный, 700 - жирный)
    marginBottom: 8,                 // отступ снизу
    marginTop: 0,                    // отступ сверху
    textAlign: 'left',               // выравнивание
    fontFamily: 'serif',             // шрифт
    letterSpacing: 0.5,              // расстояние между буквами
    lineHeight: 20,                  // межстрочный интервал
    paddingHorizontal: 4,            // отступы по бокам
    backgroundColor: 'transparent',  // фон
    borderBottomWidth: 0,            // нижняя граница
    borderBottomColor: 'transparent',// цвет нижней границы
  }
});
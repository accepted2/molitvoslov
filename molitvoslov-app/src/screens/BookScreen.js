import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { api } from '../api';

export const BookScreen = ({ route }) => {
  const { categorySlug, categoryName } = route.params;
  const [texts, setTexts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadTexts();
  }, [categorySlug]);

  const loadTexts = async () => {
    try {
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
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      <Text style={styles.headerTitle}>{categoryName}</Text>
      {texts.map((item, index) => (
        <View key={item.id} style={styles.block}>
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
          <Text style={styles.description}>
            {item.text.description}
          </Text>

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
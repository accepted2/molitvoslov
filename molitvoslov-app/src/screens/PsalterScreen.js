import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {api} from '../api';


export default function PsalterScreen({ navigation }) {
  const [psalter, setPsalter] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadPsalter();
  }, []);

  const loadPsalter = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await api.get(
        'psalters/psaltir/'
      );

      setPsalter(response.data);
    } catch (err) {
      console.log(
        'Ошибка загрузки Псалтири:',
        err
      );

      setError(
        'Не удалось загрузить Псалтирь'
      );
    } finally {
      setLoading(false);
    }
  };

  const openKathisma = (kathisma) => {
    navigation.navigate(
      'Kathisma',
      {
        kathismaNumber: kathisma.number,
        kathismaTitle:
          kathisma.title ||
          `Кафизма ${kathisma.number}`,
      }
    );
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>
          {error}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={psalter?.kathismas || []}
        keyExtractor={(item) =>
          String(item.id)
        }
        contentContainerStyle={
          styles.listContent
        }
        renderItem={({ item }) => (
          <Pressable
            style={({ pressed }) => [
              styles.kathisma,
              pressed &&
              styles.kathismaPressed,
            ]}
            onPress={() =>
              openKathisma(item)
            }
          >
            <Text
              style={
                styles.kathismaNumber
              }
            >
              Кафизма {item.number}
              {' '}
              ({item.first_psalm === item.last_psalm
            ? `Псалом ${item.first_psalm}`
              :`Псалмы ${item.first_psalm}-${item.last_psalm}`
            })
            </Text>

            {!!item.title && (
              <Text
                style={
                  styles.kathismaTitle
                }
              >
                {item.title}
              </Text>
            )}
          </Pressable>
        )}
      />
    </View>
  );
}


const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F7F4EE',
  },

  listContent: {
    padding: 16,
    gap: 12,
  },

  kathisma: {
    paddingVertical: 18,
    paddingHorizontal: 18,

    backgroundColor: '#FFFFFF',

    borderRadius: 12,
  },

  kathismaPressed: {
    opacity: 0.7,
  },

  kathismaNumber: {
    fontSize: 19,
    fontWeight: '600',
  },

  kathismaTitle: {
    marginTop: 5,

    fontSize: 14,
    opacity: 0.6,
  },

  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  error: {
    fontSize: 16,
  },
});
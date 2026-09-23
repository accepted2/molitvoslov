import React, {
  useEffect,
  useState,
} from 'react';

import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';

import { api } from '../api';


export const AkathistListScreen = ({
                                     navigation,
                                   }) => {
  const [
    akathists,
    setAkathists,
  ] = useState([]);

  const [
    loading,
    setLoading,
  ] = useState(true);

  useEffect(() => {
    loadAkathists();
  }, []);

  const loadAkathists = async () => {
    try {
      setLoading(true);

      const response = await api.get(
        'akathists/'
      );

      const visibleAkathists =
        response.data.filter(
          item => item.is_visible
        );

      setAkathists(
        visibleAkathists
      );
    } catch (error) {
      console.error(
        'Ошибка загрузки акафистов:',
        error
      );
    } finally {
      setLoading(false);
    }
  };

  const handlePress = akathist => {
    navigation.navigate(
      'Akathist',
      {
        akathistId:
        akathist.id,

        slug:
        akathist.slug,

        title:
        akathist.title,
      }
    );
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator
          size="large"
          color="#2c3e50"
        />

        <Text style={styles.loadingText}>
          Загрузка...
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={akathists}
        keyExtractor={item =>
          item.id.toString()
        }
        contentContainerStyle={
          styles.listContent
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.item}
            activeOpacity={0.7}
            onPress={() =>
              handlePress(item)
            }
          >
            <View
              style={
                styles.iconContainer
              }
            >
              <Text style={styles.icon}>
                ☦
              </Text>
            </View>

            <View
              style={
                styles.textContainer
              }
            >
              <Text
                style={styles.title}
              >
                {item.title}
              </Text>

              {!!item.description &&
                item.description !==
                item.title && (
                  <Text
                    style={
                      styles.description
                    }
                  >
                    {
                      item.description
                    }
                  </Text>
                )}
            </View>

            <Text style={styles.arrow}>
              ›
            </Text>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <View
            style={
              styles.emptyContainer
            }
          >
            <Text
              style={styles.emptyText}
            >
              Акафисты пока не добавлены
            </Text>
          </View>
        }
      />
    </View>
  );
};


const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },

  listContent: {
    paddingVertical: 5,
  },

  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },

  loadingText: {
    marginTop: 10,
  },

  item: {
    flexDirection: 'row',
    alignItems: 'center',

    padding: 12,

    backgroundColor: '#fff',

    borderBottomWidth: 1,
    borderBottomColor: '#eee',

    marginHorizontal: 8,
    marginVertical: 3,

    borderRadius: 10,

    elevation: 2,

    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },

  iconContainer: {
    width: 34,
    alignItems: 'center',
    marginRight: 8,
  },

  icon: {
    fontSize: 23,
    color: '#8b5e3c',
  },

  textContainer: {
    flex: 1,
  },

  title: {
    fontSize: 17,
    fontWeight: 'bold',
    color: '#2c3e50',
    lineHeight: 23,
  },

  description: {
    marginTop: 4,
    fontSize: 13,
    lineHeight: 18,
    color: '#7f8c8d',
  },

  arrow: {
    fontSize: 24,
    color: '#bdc3c7',
    marginLeft: 8,
  },

  emptyContainer: {
    padding: 30,
    alignItems: 'center',
  },

  emptyText: {
    color: '#7f8c8d',
    fontSize: 15,
  },
});
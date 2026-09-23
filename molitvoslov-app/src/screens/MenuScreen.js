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


export const MenuScreen = ({
                               navigation,
                           }) => {
    const [
        categories,
        setCategories,
    ] = useState([]);

    const [
        loading,
        setLoading,
    ] = useState(true);


    const prayerRuleMap = {
        'utrennie-molitvy':
          'molitvy-utrennie',

        'molitvy-na-son-griadushchim':
          'molitvy-na-son-griadushchim',
    };


    useEffect(() => {
        loadCategories();
    }, []);


    const loadCategories = async () => {
        try {
            const response =
              await api.get(
                'categories/'
              );

            const sorted =
              response.data.sort(
                (a, b) =>
                  a.order - b.order
              );

            setCategories(
              sorted
            );
        } catch (error) {
            console.error(
              'Ошибка загрузки категорий:',
              error
            );
        } finally {
            setLoading(false);
        }
    };


    const handlePress = (
      category
    ) => {
        const prayerRuleSlug =
          prayerRuleMap[
            category.slug
            ];


        if (prayerRuleSlug) {
            navigation.navigate(
              'PrayerRule',
              {
                  slug:
                  prayerRuleSlug,
              }
            );

            return;
        }


        if (
          category.slug ===
          'psaltir'
        ) {
            navigation.navigate(
              'Psalter'
            );

            return;
        }


        if (
          category.parent
        ) {
            navigation.navigate(
              'Book',
              {
                  categoryId:
                  category.id,

                  categorySlug:
                  category.slug,

                  categoryName:
                  category.name,
              }
            );

            return;
        }


        const subcategories =
          categories.filter(
            item =>
              item.parent ===
              category.id
          );


        if (
          subcategories.length > 0
        ) {
            navigation.navigate(
              'CategoryMenu',
              {
                  parentCategory:
                  category,

                  subcategories:
                  subcategories,
              }
            );

            return;
        }


        navigation.navigate(
          'Book',
          {
              categoryId:
              category.id,

              categorySlug:
              category.slug,

              categoryName:
              category.name,
          }
        );
    };


    const openAkathists = () => {
        navigation.navigate(
          'AkathistList'
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
                style={{
                    marginTop: 10,
                }}
              >
                  Загрузка...
              </Text>
          </View>
        );
    }


    const rootCategories =
      categories.filter(
        category =>
          !category.parent
      );


    /*
     * Акафисты — отдельная модель,
     * поэтому добавляем их в меню
     * независимо от Category.
     */
    const menuItems = [
        ...rootCategories,

        {
            id: 'akathists',
            name: 'Акафисты',
            icon: '☦',
            type: 'akathists',
        },
    ];


    return (
      <View
        style={
            styles.container
        }
      >
          <FlatList
            data={
                menuItems
            }

            keyExtractor={item =>
              item.id.toString()
            }

            renderItem={({
                             item,
                         }) => {
                if (
                  item.type ===
                  'akathists'
                ) {
                    return (
                      <TouchableOpacity
                        style={
                            styles.menuItem
                        }

                        activeOpacity={0.7}

                        onPress={
                            openAkathists
                        }
                      >
                          <Text
                            style={
                                styles.menuIcon
                            }
                          >
                              {item.icon}
                          </Text>

                          <View
                            style={
                                styles.menuTextContainer
                            }
                          >
                              <Text
                                style={
                                    styles.menuTitle
                                }
                              >
                                  Акафисты
                              </Text>

                              <Text
                                style={
                                    styles.menuSubtitle
                                }
                              >
                                  Акафисты святым,
                                  Господу и Богородице
                              </Text>
                          </View>

                          <Text
                            style={
                                styles.arrow
                            }
                          >
                              ›
                          </Text>
                      </TouchableOpacity>
                    );
                }


                const subcategoriesCount =
                  categories.filter(
                    category =>
                      category.parent ===
                      item.id
                  ).length;


                return (
                  <TouchableOpacity
                    style={
                        styles.menuItem
                    }

                    activeOpacity={0.7}

                    onPress={() =>
                      handlePress(
                        item
                      )
                    }
                  >
                      <Text
                        style={
                            styles.menuIcon
                        }
                      >
                          {
                            item.icon ||
                            '📖'
                          }
                      </Text>

                      <View
                        style={[
                            styles.menuTextContainer,

                            subcategoriesCount ===
                            0 &&
                            styles.menuTextContainerEmpty,
                        ]}
                      >
                          <Text
                            style={
                                styles.menuTitle
                            }
                          >
                              {item.name}
                          </Text>

                          {subcategoriesCount >
                            0 && (
                              <Text
                                style={
                                    styles.menuSubtitle
                                }
                              >
                                  {
                                      subcategoriesCount
                                  }{' '}
                                  подкатегорий
                              </Text>
                            )}
                      </View>

                      <Text
                        style={
                            styles.arrow
                        }
                      >
                          ›
                      </Text>
                  </TouchableOpacity>
                );
            }}
          />
      </View>
    );
};


const styles =
  StyleSheet.create({
      container: {
          flex: 1,

          backgroundColor:
            '#f8f9fa',
      },

      center: {
          flex: 1,

          justifyContent:
            'center',

          alignItems:
            'center',
      },

      menuItem: {
          flexDirection:
            'row',

          alignItems:
            'center',

          padding: 16,

          backgroundColor:
            '#fff',

          borderBottomWidth: 1,

          borderBottomColor:
            '#eee',

          marginHorizontal: 10,

          marginVertical: 4,

          borderRadius: 10,

          elevation: 2,

          shadowColor:
            '#000',

          shadowOffset: {
              width: 0,
              height: 2,
          },

          shadowOpacity: 0.1,

          shadowRadius: 4,
      },

      menuIcon: {
          fontSize: 28,

          marginRight: 15,

          color: '#8b5e3c',
      },

      menuTextContainer: {
          flex: 1,
      },

      menuTextContainerEmpty: {
          justifyContent:
            'center',
      },

      menuTitle: {
          fontSize: 18,

          fontWeight:
            'bold',

          color:
            '#2c3e50',
      },

      menuSubtitle: {
          fontSize: 12,

          color:
            '#7f8c8d',

          marginTop: 2,

          lineHeight: 17,
      },

      arrow: {
          fontSize: 24,

          color:
            '#bdc3c7',
      },
  });
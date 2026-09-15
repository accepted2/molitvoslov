import React, { useEffect, useState } from 'react';
import {
    View,
    Text,
    FlatList,
    StyleSheet,
    TouchableOpacity,
    ActivityIndicator,
} from 'react-native';
import { api } from '../api';

export const MenuScreen = ({ navigation }) => {
    const [categories, setCategories] = useState([]);
    const [loading, setLoading] = useState(true);

    const prayerRuleMap = {
        'utrennie-molitvy': 'molitvy-utrennie',
        'molitvy-na-son-griadushchim': 'molitvy-na-son-griadushchim',
    }

    useEffect(() => {
        loadCategories();
    }, []);

    const loadCategories = async () => {
        try {
            const response = await api.get('categories/');
            // Сортируем по полю order
            const sorted = response.data.sort((a, b) => a.order - b.order);
            setCategories(sorted);
        } catch (error) {
            console.error('Ошибка загрузки категорий:', error);
        } finally {
            setLoading(false);
        }
    };

    const handlePress = (category) => {
        const prayerRuleSlug = prayerRuleMap[category.slug]

        if(prayerRuleSlug){
            navigation.navigate('PrayerRule',{
                slug:prayerRuleSlug
            })

            return
        }
        if (category.slug === 'psaltir') {
            navigation.navigate('Psalter');
            return;
        }

        if(category.parent) {
            navigation.navigate('Book',{
                categorySlug: category.slug,
                categoryName:category.name
            })
        } else {
            const subcategories = categories.filter(
              c=> c.parent === category.id
            )
            if (subcategories.length > 0){
                navigation.navigate('CategoryMenu',{
                    parentCategory:category,
                    subcategories: subcategories
                })
            }else {
                navigation.navigate('Book',{
                    categorySlug:category.slug,
                    categoryName:category.name,
                })
            }
        }
        // if(category.slug === 'utrennie-molitvy') {
        //     navigation.navigate('PrayerRule', {
        //         slug:'molitvy-utrennie'
        //     })
        //     return;
        // }
        //
        // if (category.parent) {
        //     // Если есть родитель - показываем список текстов из этой категории
        //     navigation.navigate('Book', { categorySlug: category.slug, categoryName: category.name });
        // } else {
        //     // Если это родительская категория (например, "Акафисты") - показываем подкатегории
        //     const subcategories = categories.filter(c => c.parent === category.id);
        //     if (subcategories.length > 0) {
        //         navigation.navigate('CategoryMenu', {
        //             parentCategory: category,
        //             subcategories: subcategories
        //         });
        //     } else {
        //         // Если подкатегорий нет - показываем тексты
        //         navigation.navigate('Book', {  categorySlug: category.slug, categoryName: category.name });
        //     }
        // }
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
        <View style={styles.container}>
            <FlatList
                data={categories.filter(c => !c.parent)} // Показываем только корневые категории
                keyExtractor={(item) => item.id.toString()}
                renderItem={({ item }) => {
                    const subcategoriesCount = categories.filter(
                      c=> c.parent === item.id
                    ).length

                    return (
                    <TouchableOpacity
                        style={styles.menuItem}
                        onPress={() => handlePress(item)}
                    >
                        <Text style={styles.menuIcon}>{item.icon || '📖'}</Text>
                        <View style={[
                          styles.menuTextContainer,
                        subcategoriesCount === 0 && styles.menuTextContainerEmpty
                        ]}>
                            <Text style={styles.menuTitle}>{item.name}</Text>
                            {
                                subcategoriesCount > 0 && (
                                <Text style={styles.menuSubtitle}>
                                    {subcategoriesCount } подкатегорий
                                </Text>
                              )
                            }

                        </View>
                        <Text style={styles.arrow}>›</Text>
                    </TouchableOpacity>
                    )
                }}
            />
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#f8f9fa',
    },
    center: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    menuItem: {
        flexDirection: 'row',
        alignItems: 'center',
        // minHeight:80,
        padding: 16,
        backgroundColor: '#fff',
        borderBottomWidth: 1,
        borderBottomColor: '#eee',
        marginHorizontal: 10,
        marginVertical: 4,
        borderRadius: 10,
        elevation: 2,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
    },
    menuIcon: {
        fontSize: 28,
        marginRight: 15,
    },
    menuTextContainer: {
        flex: 1,

    },
    menuTextContainerEmpty:{
        justifyContent:'center',
    },
    menuTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#2c3e50',
    },
    menuSubtitle: {
        fontSize: 12,
        color: '#7f8c8d',
        marginTop: 2,
    },

    arrow: {
        fontSize: 24,
        color: '#bdc3c7',
    },
});
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

export const TextsListScreen = ({ route, navigation }) => {
    const { categorySlug, categoryName } = route.params;
    const [texts, setTexts] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadTexts();
    }, [categorySlug]);

    const loadTexts = async () => {
        try {
            // Загружаем тексты с порядком из категории
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

    const handlePress = (textSlug) => {
        navigation.navigate('Reader', { slug: textSlug });
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
            <Text style={styles.headerTitle}>{categoryName}</Text>
            <FlatList
                data={texts}
                keyExtractor={(item) => item.id.toString()}
                renderItem={({ item, index }) => (
                    <TouchableOpacity
                        style={styles.item}
                        onPress={() => handlePress(item.text.slug)}
                    >
                        {/*<Text style={styles.order}>{index + 1}.</Text>*/}
                        <View style={styles.textContainer}>
                            <Text style={styles.title}>
                                {item.text.title || item.text.description || 'Молитва'}
                            </Text>
                            <Text style={styles.preview}>
                                {item.text.content.slice(0, 60)}...
                            </Text>
                        </View>
                        <Text style={styles.arrow}>›</Text>
                    </TouchableOpacity>
                )}
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
    headerTitle: {
        fontSize: 22,
        fontWeight: 'bold',
        color: '#2c3e50',
        padding: 16,
        textAlign: 'center',
    },
    item: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        backgroundColor: '#fff',
        borderBottomWidth: 1,
        borderBottomColor: '#eee',
        marginHorizontal: 10,
        marginVertical: 4,
        borderRadius: 10,
    },
    order: {
        fontSize: 14,
        fontWeight: 'bold',
        color: '#3498db',
        marginRight: 12,
        minWidth: 30,
    },
    textContainer: {
        flex: 1,
    },
    title: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#2c3e50',
    },
    preview: {
        fontSize: 13,
        color: '#7f8c8d',
        marginTop: 3,
    },
    arrow: {
        fontSize: 20,
        color: '#bdc3c7',
    },
});
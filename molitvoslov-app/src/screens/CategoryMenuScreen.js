import React from 'react';
import {
    View,
    Text,
    FlatList,
    StyleSheet,
    TouchableOpacity,
} from 'react-native';

export const CategoryMenuScreen = ({ route, navigation }) => {
    const { parentCategory, subcategories } = route.params;

    const handlePress = (category) => {
        navigation.navigate('Book', {
            categorySlug: category.slug,
            categoryName: category.name
        });
    };

    return (
        <View style={styles.container}>
            <Text style={styles.headerTitle}>{parentCategory.name}</Text>
            <FlatList
                data={subcategories}
                keyExtractor={(item) => item.id.toString()}
                renderItem={({ item }) => (
                    <TouchableOpacity
                        style={styles.menuItem}
                        onPress={() => handlePress(item)}
                    >
                        <Text style={styles.menuIcon}>{item.icon || '📖'}</Text>
                        <View style={styles.menuTextContainer}>
                            <Text style={styles.menuTitle}>{item.name}</Text>
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
    headerTitle: {
        fontSize: 22,
        fontWeight: 'bold',
        color: '#2c3e50',
        padding: 16,
        textAlign: 'center',
    },
    menuItem: {
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
    menuIcon: {
        fontSize: 24,
        marginRight: 15,
    },
    menuTextContainer: {
        flex: 1,
    },
    menuTitle: {
        fontSize: 16,
        color: '#2c3e50',
    },
    arrow: {
        fontSize: 20,
        color: '#bdc3c7',
    },
});
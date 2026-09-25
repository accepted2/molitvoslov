import React from 'react';
import {
    View,
    Text,
    FlatList,
    StyleSheet,
    TouchableOpacity,
} from 'react-native';
import {AppBackground} from '../components/layout/AppBackground';
import {BottomNav} from "../components/navigation/BottomNav";
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {StatusBar} from 'expo-status-bar';
import {FixedSectionHeader} from '../components/navigation/FixedSectionHeader';


export const CategoryMenuScreen = ({ route, navigation }) => {

    const { parentCategory, subcategories } = route.params;

    const handlePress = (category) => {
        navigation.navigate('Book', {
            categoryId: category.id,
            categorySlug: category.slug,
            categoryName: category.name
        });
    };
    const insets = useSafeAreaInsets();
    const headerHeight = insets.top + 62;

    return (
      <AppBackground imageOpacity={0.72}>
          <StatusBar
            style="light"
            translucent
            backgroundColor="transparent"
          />
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
            <FixedSectionHeader
              title={parentCategory.name}
              navigation={navigation}
              topInset={insets.top}
            />
            <BottomNav
              navigation={navigation}
              active={null}
            />
        </View>
          </AppBackground>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: 'transparent',
    },
    list: {
        paddingHorizontal: 12,
        paddingBottom: 24,
    },
    headerTitle: {
        paddingHorizontal: 16,
        paddingTop: 20,
        paddingBottom: 14,
        color: '#4A2D1A',
        fontFamily: 'serif',
        fontSize: 25,
        lineHeight: 31,
        fontWeight: '700',
        textAlign: 'center',
    },
    menuItem: {
        minHeight: 66,
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 9,
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderRadius: 17,
        borderWidth: 1,
        borderColor: 'rgba(122, 77, 36, 0.24)',
        backgroundColor: 'rgba(255, 244, 222, 0.92)',
        shadowColor: '#4A2817',
        shadowOffset: {width: 0, height: 3},
        shadowOpacity: 0.1,
        shadowRadius: 6,
        elevation: 2,
    },
    menuIcon: {
        width: 38,
        color: '#996332',
        fontFamily: 'serif',
        fontSize: 23,
        textAlign: 'center',
    },
    menuTextContainer: {
        flex: 1,
        marginLeft: 10,
    },
    menuTitle: {
        color: '#382417',
        fontFamily: 'serif',
        fontSize: 17,
        lineHeight: 22,
        fontWeight: '700',
    },
    arrowCircle: {
        width: 32,
        height: 32,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 16,
        backgroundColor: 'rgba(255, 249, 236, 0.92)',
    },
    arrow: {
        marginTop: -2,
        color: '#8B592B',
        fontSize: 27,
        lineHeight: 27,
    },
});
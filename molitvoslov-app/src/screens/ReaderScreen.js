import React, {useEffect, useState} from "react";
import {
    View,
    Text,
    ScrollView,
    StyleSheet,
    ActivityIndicator
} from "react-native";
import {api} from '../api'

export const ReaderScreen = ({route}) => {
    const {slug} = route.params;
    const [text,setText] = useState(null)
    const [loading,setLoading] = useState(true)

    useEffect(() => {
        loadText()
    }, [slug]);

    const loadText = async ()=> {
        try{
            const response = await api.get(`texts/${slug}/`)
            setText(response.data)
        }catch (error){
            console.error('Ошибка загрузки текста:', error)
        } finally {
            setLoading(false)
        }
    }
    if(loading){
        return (
            <View style={styles.center}>
                <ActivityIndicator size="large" color="#2c3e50"/>
                <Text style={{marginTop: 10}}>Загрузка...</Text>
            </View>
        )
    }
    if (!text){
        return (
            <View style={styles.center}>
                <Text>Текст не найден</Text>
            </View>
        )
    }
    return (
        <ScrollView style={styles.container}>
            <Text style={styles.title}>{text.title}</Text>
            <Text style={styles.content}>{text.content}</Text>
        </ScrollView>
    )
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        padding:20,
        backgroundColor:'#fff',
    },
    center: {
        flex: 1,
        justifyContent: 'center',
        alignItems:'center',
    },
    title: {
        fontSize: 24,
        fontWeight: 'bold',
        marginBottom: 20,
        textAlign: 'center',
    },
    content: {
        fontSize: 16,
        lineHeight: 26,
        color: '#333',
    },
})
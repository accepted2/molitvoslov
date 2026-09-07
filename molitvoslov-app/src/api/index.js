import axios from 'axios'

const API_URL = 'http://192.168.1.104:8000/api/'

export const api = axios.create({
    baseURL: API_URL,
    timeout: 10000,
    headers: {
        'Content-Type': 'application/json',
    }
})
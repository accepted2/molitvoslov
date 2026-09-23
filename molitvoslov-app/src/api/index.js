import axios from 'axios'
import { Platform } from 'react-native';


const API_URL = 'http://192.168.1.103:8000/api/';

const DEV_TOKEN = process.env.EXPO_PUBLIC_DEV_TOKEN;

export const api = axios.create({
    baseURL: API_URL,
    timeout: 10000,
    headers: {
        'Content-Type': 'application/json',
        Authorization:`Token ${DEV_TOKEN}`
    }
})

api.interceptors.request.use(
  config => {
      console.log(
        'API REQUEST:',
        config.url,
        config.headers?.Authorization
      )
      return config
  }
)
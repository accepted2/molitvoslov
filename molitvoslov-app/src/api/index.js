import axios from 'axios'

const API_URL = 'http://192.168.1.104:8000/api/'

const DEV_TOKEN = '0289b4dcdc9ecd3658638f4cc1eccd0040134c01';

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
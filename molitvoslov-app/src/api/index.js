import axios from 'axios';

const API_URL = 'http://10.0.2.2:8000/api/';

export const api = axios.create({
  baseURL: API_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

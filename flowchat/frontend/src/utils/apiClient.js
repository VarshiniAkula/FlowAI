import axios from 'axios'

const apiClient = axios.create({
  baseURL: '//',  // Uses Vite proxy in dev; set to http://localhost:8000 for production
  headers: { 'Content-Type': 'application/json' },
  timeout: 30000,
})

export default apiClient

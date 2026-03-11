import axios from 'axios'

const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:8000'

export const api = axios.create({
  baseURL: API_BASE,
})

export function setToken(token: string | null) {
  if (token) api.defaults.headers.common['Authorization'] = `Bearer ${token}`
  else delete api.defaults.headers.common['Authorization']
}

export function getToken() {
  return localStorage.getItem('crcp_token')
}

export function saveSession(token: string, role: string) {
  localStorage.setItem('crcp_token', token)
  localStorage.setItem('crcp_role', role)
  setToken(token)
  window.dispatchEvent(new Event('crcp-auth-changed'))
}

export function clearSession() {
  localStorage.removeItem('crcp_token')
  localStorage.removeItem('crcp_role')
  setToken(null)
  window.dispatchEvent(new Event('crcp-auth-changed'))
}

export function getRole(): 'rider'|'driver'|'admin'|null {
  const r = localStorage.getItem('crcp_role')
  if (r === 'rider' || r === 'driver' || r === 'admin') return r
  return null
}

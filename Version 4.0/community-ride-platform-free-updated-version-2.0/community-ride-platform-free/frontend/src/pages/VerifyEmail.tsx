import React, { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Card, CardContent, CardHeader } from '../components/Card'
import { Button } from '../components/Button'
import { api } from '../api'

function useQuery() {
  const { search } = useLocation()
  return useMemo(() => new URLSearchParams(search), [search])
}

export default function VerifyEmail() {
  const nav = useNavigate()
  const q = useQuery()
  const token = q.get('token') || ''
  const [state, setState] = useState<'loading' | 'success' | 'error'>('loading')
  const [message, setMessage] = useState('Verifying your email...')

  useEffect(() => {
    let active = true
    async function verify() {
      if (!token) {
        setState('error')
        setMessage('Verification link is missing a token.')
        return
      }
      try {
        const res = await api.get('/auth/verify-email', { params: { token } })
        if (!active) return
        setState('success')
        setMessage(res.data?.message ?? 'Your email has been verified.')
      } catch (e: any) {
        if (!active) return
        setState('error')
        setMessage(e?.response?.data?.detail ?? 'Verification failed')
      }
    }
    verify()
    return () => {
      active = false
    }
  }, [token])

  return (
    <Card>
      <CardHeader>
        <div className="text-2xl font-black">Email Verification</div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className={`rounded-xl border p-4 text-sm ${state === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : state === 'error' ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-slate-200 bg-slate-50 text-slate-700'}`}>
          {message}
        </div>
        <div className="flex gap-3">
          <Button type="button" onClick={() => nav('/login')}>Go to Login</Button>
          <Button type="button" variant="ghost" onClick={() => nav('/forgot-password')}>Forgot Password</Button>
        </div>
      </CardContent>
    </Card>
  )
}

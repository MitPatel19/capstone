import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, CardContent, CardHeader } from '../components/Card'
import { Button } from '../components/Button'
import { Input, Label } from '../components/Input'
import { api } from '../api'

export default function ForgotPassword() {
  const nav = useNavigate()
  const [email, setEmail] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setErr(null)
    setLoading(true)
    try {
      const res = await api.post('/auth/forgot_password', { email })
      const params = new URLSearchParams({
        mode: 'reset',
        email,
      })
      if (res.data?.message) params.set('msg', res.data.message)
      if (res.data?.debug_url) params.set('debug_url', res.data.debug_url)
      nav(`/check-email?${params.toString()}`)
    } catch (e: any) {
      setErr(e?.response?.data?.detail ?? 'Unable to request password reset')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="text-2xl font-black">Forgot Password</div>
        <div className="mt-1 text-sm text-slate-600">Enter your email and we’ll send a reset link if the account exists.</div>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={submit}>
          <div>
            <Label>Email</Label>
            <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
          </div>
          {err && <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{err}</div>}
          <div className="flex gap-3">
            <Button disabled={loading}>{loading ? 'Sending...' : 'Send Reset Link'}</Button>
            <Button type="button" variant="ghost" onClick={() => nav('/login')}>Back to Login</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

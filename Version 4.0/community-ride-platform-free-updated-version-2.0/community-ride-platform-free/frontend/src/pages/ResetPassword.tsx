import React, { useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Card, CardContent, CardHeader } from '../components/Card'
import { Button } from '../components/Button'
import { Input, Label } from '../components/Input'
import { api } from '../api'

function useQuery() {
  const { search } = useLocation()
  return useMemo(() => new URLSearchParams(search), [search])
}

export default function ResetPassword() {
  const nav = useNavigate()
  const q = useQuery()
  const token = q.get('token') || ''
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setErr(null)
    setMsg(null)
    if (!token) {
      setErr('Password reset link is missing a token.')
      return
    }
    if (password !== confirmPassword) {
      setErr('Passwords do not match.')
      return
    }
    setLoading(true)
    try {
      const res = await api.post('/auth/reset_password', { token, new_password: password })
      setMsg(res.data?.message ?? 'Your password has been reset.')
    } catch (e: any) {
      setErr(e?.response?.data?.detail ?? 'Password reset failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="text-2xl font-black">Reset Password</div>
        <div className="mt-1 text-sm text-slate-600">Choose a new password for your account.</div>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={submit}>
          <div>
            <Label>New Password</Label>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <div>
            <Label>Confirm Password</Label>
            <Input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
          </div>
          {msg && <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{msg}</div>}
          {err && <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{err}</div>}
          <div className="flex gap-3">
            <Button disabled={loading}>{loading ? 'Updating...' : 'Reset Password'}</Button>
            <Button type="button" variant="ghost" onClick={() => nav('/login')}>Back to Login</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

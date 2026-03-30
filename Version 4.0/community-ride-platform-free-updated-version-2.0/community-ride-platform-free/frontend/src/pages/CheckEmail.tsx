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

export default function CheckEmail() {
  const nav = useNavigate()
  const q = useQuery()
  const role = q.get('role') || 'rider'
  const mode = q.get('mode') || 'verify'
  const debugUrl = q.get('debug_url') || ''
  const initialMessage = q.get('msg') || ''
  const [email, setEmail] = useState(q.get('email') || '')
  const [msg, setMsg] = useState<string | null>(
    initialMessage || (debugUrl ? 'Email delivery is unavailable right now, so a verification link is shown below.' : null)
  )
  const [err, setErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function resend() {
    setErr(null)
    setLoading(true)
    try {
      const res = await api.post('/auth/resend-verification', { email })
      setMsg(res.data?.message ?? 'Verification email sent.')
      if (res.data?.debug_url) {
        const params = new URLSearchParams({
          mode,
          role,
          email,
        })
        params.set('debug_url', res.data.debug_url)
        if (res.data?.message) params.set('msg', res.data.message)
        window.history.replaceState({}, '', `/check-email?${params.toString()}`)
      }
    } catch (e: any) {
      setErr(e?.response?.data?.detail ?? 'Unable to resend verification email')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="text-2xl font-black">{mode === 'reset' ? 'Check Your Email' : 'Verify Your Email'}</div>
        <div className="mt-1 text-sm text-slate-600">
          {mode === 'reset'
            ? 'We sent password reset instructions if the account exists.'
            : 'Your account was created. Open the email we sent before you sign in.'}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
          {mode === 'reset'
            ? 'Reset links expire after 1 hour.'
            : role === 'driver'
              ? 'Driver accounts also need admin approval after email verification.'
              : 'Once verified, you can sign in right away.'}
        </div>

        <div>
          <Label>Email</Label>
          <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
        </div>

        {msg && <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{msg}</div>}
        {err && <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{err}</div>}

        {debugUrl && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 break-all">
            Verification link: <a className="font-semibold underline" href={debugUrl}>{debugUrl}</a>
          </div>
        )}

        {mode !== 'reset' && (
          <Button className="w-full" type="button" disabled={loading || !email.trim()} onClick={resend}>
            {loading ? 'Sending...' : 'Resend Verification Email'}
          </Button>
        )}

        <div className="flex gap-3">
          <Button type="button" variant="ghost" onClick={() => nav(`/login?role=${role}`)}>Back to Login</Button>
          <Button type="button" variant="secondary" onClick={() => nav('/forgot-password')}>Forgot Password</Button>
        </div>
      </CardContent>
    </Card>
  )
}

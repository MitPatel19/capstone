import React, { useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Card, CardContent, CardHeader } from '../components/Card'
import { Input, Label } from '../components/Input'
import { Button } from '../components/Button'
import { api, saveSession } from '../api'

function useQuery() {
  const { search } = useLocation()
  return useMemo(() => new URLSearchParams(search), [search])
}

export default function Login() {
  const nav = useNavigate()
  const q = useQuery()
  const [email, setEmail] = useState(q.get('role') === 'admin' ? 'pmit9114@gmail.com' : '')
  const [password, setPassword] = useState(q.get('role') === 'admin' ? 'Mit@2020' : '')
  const [role, setRole] = useState<'rider'|'driver'|'admin'>((q.get('role') as any) || 'rider')
  const [err, setErr] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [resending, setResending] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErr(null)
    setInfo(null)
    setLoading(true)
    try {
      const res = await api.post('/auth/login', { email, password, role })
      saveSession(res.data.access_token, role)
      nav(`/${role}`)
    } catch (e: any) {
      setErr(e?.response?.data?.detail ?? 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  async function resendVerification() {
    setResending(true)
    setErr(null)
    setInfo(null)
    try {
      const res = await api.post('/auth/resend-verification', { email })
      const debugUrl = res.data?.debug_url
      setInfo(res.data?.message ?? 'Verification email sent.')
      if (debugUrl) {
        nav(`/check-email?mode=verify&role=${role}&email=${encodeURIComponent(email)}&debug_url=${encodeURIComponent(debugUrl)}`)
        return
      }
    } catch (e: any) {
      setErr(e?.response?.data?.detail ?? 'Unable to resend verification email')
    } finally {
      setResending(false)
    }
  }

  return (
    <div className="grid lg:grid-cols-2 gap-8 items-start">
      <Card>
        <CardHeader>
          <div className="text-2xl font-black">Login</div>
          <div className="text-sm text-slate-600 mt-1">Choose your role and continue.</div>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={onSubmit}>
            <div>
              <Label>Email</Label>
              <Input value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com" />
            </div>
            <div>
              <Label>Password</Label>
              <Input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="••••••••" />
            </div>
            <div>
              <Label>Role</Label>
              <div className="grid grid-cols-3 gap-2 mt-1">
                {(['rider','driver','admin'] as const).map(r => (
                  <button type="button" key={r}
                    onClick={()=>setRole(r)}
                    className={(role===r ? 'border-brand-400 bg-brand-50' : 'border-slate-200 bg-white') + ' rounded-xl border px-3 py-2 text-sm font-semibold capitalize'}>
                    {r}
                  </button>
                ))}
              </div>
            </div>
            {info && <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-sm text-emerald-700">{info}</div>}
            {err && <div className="rounded-xl bg-rose-50 border border-rose-200 p-3 text-sm text-rose-700">{err}</div>}
            {err?.toLowerCase().includes('email not verified') && (
              <Button type="button" variant="secondary" className="w-full" disabled={resending || !email.trim()} onClick={resendVerification}>
                {resending ? 'Sending verification...' : 'Resend Verification Email'}
              </Button>
            )}
            <Button className="w-full" disabled={loading}>{loading ? 'Signing in...' : 'Login'}</Button>
            <div className="text-sm text-slate-600">
              No account? <button className="font-semibold text-brand-700 hover:underline" type="button" onClick={()=>nav('/signup')}>Sign up</button>
            </div>
            <div className="text-sm text-slate-600">
              Forgot your password? <button className="font-semibold text-brand-700 hover:underline" type="button" onClick={()=>nav('/forgot-password')}>Reset it</button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card className="bg-gradient-to-br from-brand-600 to-emerald-600 text-white border-0">
        <CardContent className="p-8">
          <div className="text-3xl font-black">Safer coordination</div>
          <div className="mt-2 text-white/90">
            This demo uses <b>free</b> location suggestions (OpenStreetMap) and opens navigation in Google Maps with no API keys.
          </div>
          <div className="mt-6 rounded-2xl bg-white/10 p-5">
            <div className="font-bold">Admin demo</div>
            <div className="text-sm mt-2">Email: <b>pmit9114@gmail.com</b></div>
            <div className="text-sm">Password: <b>Mit@2020</b></div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

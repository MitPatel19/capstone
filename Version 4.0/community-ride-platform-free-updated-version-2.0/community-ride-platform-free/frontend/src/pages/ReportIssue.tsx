import React, { useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { AlertTriangle, Bug, ShieldAlert } from 'lucide-react'
import { Button } from '../components/Button'
import { Card, CardContent, CardHeader } from '../components/Card'
import { Input, Label } from '../components/Input'
import { api } from '../api'

function useQuery() {
  const { search } = useLocation()
  return useMemo(() => new URLSearchParams(search), [search])
}

const CATEGORY_OPTIONS: Record<string, { label: string; options: string[] }> = {
  ride: { label: 'Ride Report', options: ['safety', 'no_show', 'payment', 'route_issue', 'harassment', 'other'] },
  user: { label: 'User Report', options: ['harassment', 'fraud', 'unsafe_behavior', 'spam', 'impersonation', 'other'] },
  system: { label: 'System Report', options: ['bug', 'payment_issue', 'app_crash', 'feature_problem', 'account_issue', 'other'] },
}

export default function ReportIssue() {
  const nav = useNavigate()
  const q = useQuery()
  const targetType = (q.get('target') || 'system') as 'ride' | 'user' | 'system'
  const rideId = q.get('rideId') || ''
  const reportedUserId = q.get('reportedUserId') || ''
  const contextLabel = q.get('label') || (targetType === 'system' ? 'Report a bug or support issue' : 'Submit a report')
  const reportedName = q.get('reportedName') || ''

  const [category, setCategory] = useState(CATEGORY_OPTIONS[targetType]?.options[0] || 'other')
  const [subject, setSubject] = useState('')
  const [description, setDescription] = useState('')
  const [attachment, setAttachment] = useState<File | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setMsg(null)
    setErr(null)
    setLoading(true)
    try {
      const fd = new FormData()
      fd.append('target_type', targetType)
      fd.append('category', category)
      fd.append('subject', subject)
      fd.append('description', description)
      if (rideId) fd.append('ride_id', rideId)
      if (reportedUserId) fd.append('reported_user_id', reportedUserId)
      if (attachment) fd.append('attachment', attachment)
      await api.post('/reports', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      setMsg('Report submitted successfully. Our admin team can review it now.')
      setSubject('')
      setDescription('')
      setAttachment(null)
    } catch (e: any) {
      setErr(e?.response?.data?.detail ?? 'Failed to submit report')
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="mx-auto w-full max-w-3xl space-y-6">
      <div className="rounded-3xl border border-amber-200 bg-gradient-to-r from-amber-50 via-white to-rose-50 p-6">
        <div className="flex items-start gap-4">
          <div className="rounded-2xl bg-white p-3 text-amber-600 shadow-sm">
            {targetType === 'system' ? <Bug className="h-6 w-6" /> : targetType === 'user' ? <ShieldAlert className="h-6 w-6" /> : <AlertTriangle className="h-6 w-6" />}
          </div>
          <div>
            <div className="text-3xl font-black">{CATEGORY_OPTIONS[targetType]?.label || 'Report Issue'}</div>
            <div className="mt-1 text-sm text-slate-600">{contextLabel}</div>
            {reportedName && <div className="mt-2 text-sm text-slate-700">Reported user: <b>{reportedName}</b></div>}
            {rideId && <div className="text-sm text-slate-700">Ride ID: <b>#{rideId}</b></div>}
          </div>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="text-2xl font-black">Tell Us What Happened</div>
          <div className="mt-1 text-sm text-slate-600">You can report a ride, another user, or a platform problem. Screenshots/images are optional.</div>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={submit}>
            <div>
              <Label>Category</Label>
              <select
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-200"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                {CATEGORY_OPTIONS[targetType]?.options.map((option) => (
                  <option key={option} value={option}>{option.split('_').join(' ')}</option>
                ))}
              </select>
            </div>
            <div>
              <Label>Subject</Label>
              <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Short summary of the issue" />
            </div>
            <div>
              <Label>Description</Label>
              <textarea
                rows={6}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-200"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Explain what happened, when it happened, and why it matters."
              />
            </div>
            <div>
              <Label>Screenshot or Image</Label>
              <Input type="file" accept="image/*" onChange={(e) => setAttachment(e.target.files?.[0] ?? null)} />
              <div className="mt-1 text-xs text-slate-500">Optional. Upload a screenshot, photo, or image that helps explain the issue.</div>
            </div>

            {msg && <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{msg}</div>}
            {err && <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{err}</div>}

            <div className="flex gap-3">
              <Button disabled={loading}>{loading ? 'Submitting...' : 'Submit Report'}</Button>
              <Button type="button" variant="ghost" onClick={() => nav(-1)}>Back</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </section>
  )
}

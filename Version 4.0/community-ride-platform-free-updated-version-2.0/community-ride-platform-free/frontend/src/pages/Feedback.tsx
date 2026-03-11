import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Star, Sparkles, CheckCircle2 } from 'lucide-react'
import { Button } from '../components/Button'
import { api, getRole } from '../api'

type Target = { user_id: number; name: string; role: string; already_rated: boolean }
type Draft = { stars: number; comment: string; submitting: boolean; submitted: boolean }

const STAR_CHOICES = [1, 2, 3, 4, 5]

function roleLabel(role: string) {
  if (role === 'driver') return 'Driver'
  if (role === 'rider') return 'Rider'
  return role
}

export default function Feedback() {
  const { rideId } = useParams()
  const nav = useNavigate()
  const role = getRole()
  const [targets, setTargets] = useState<Target[]>([])
  const [drafts, setDrafts] = useState<Record<number, Draft>>({})
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setErr(null)
    try {
      const res = await api.get(`/rides/${rideId}/rate_targets`)
      const rows: Target[] = res.data || []
      setTargets(rows)
      setDrafts((prev) => {
        const next: Record<number, Draft> = { ...prev }
        for (const t of rows) {
          if (!next[t.user_id]) {
            next[t.user_id] = { stars: 5, comment: '', submitting: false, submitted: t.already_rated }
          } else {
            next[t.user_id] = { ...next[t.user_id], submitted: t.already_rated || next[t.user_id].submitted }
          }
        }
        return next
      })
    } catch (e: any) {
      setErr(e?.response?.data?.detail ?? 'Failed to load feedback participants')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [rideId])

  const pendingCount = useMemo(() => targets.filter((t) => !drafts[t.user_id]?.submitted).length, [targets, drafts])

  function patchDraft(userId: number, patch: Partial<Draft>) {
    setDrafts((prev) => ({ ...prev, [userId]: { ...prev[userId], ...patch } }))
  }

  async function submitFor(userId: number) {
    const d = drafts[userId]
    if (!d || d.submitted) return
    patchDraft(userId, { submitting: true })
    try {
      await api.post(`/rides/${rideId}/rate`, { to_user_id: userId, stars: d.stars, comment: d.comment })
      patchDraft(userId, { submitting: false, submitted: true })
    } catch {
      patchDraft(userId, { submitting: false })
    }
  }

  return (
    <section className="mx-auto w-full max-w-5xl space-y-6">
      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-gradient-to-r from-blue-50 via-white to-emerald-50 p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-white/80 px-3 py-1 text-xs font-bold text-slate-700">
              <Sparkles className="h-4 w-4" />
              Ride #{rideId} Feedback
            </div>
            <h1 className="mt-3 text-3xl font-black text-slate-900">Rate Everyone You Rode With</h1>
            <p className="mt-1 text-sm text-slate-600">Every participant should rate each other after completion.</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-center">
            <div className="text-xs text-slate-500">Pending</div>
            <div className="text-3xl font-black text-slate-900">{pendingCount}</div>
          </div>
        </div>
      </div>

      {loading && <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600">Loading participants...</div>}
      {err && <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{err}</div>}

      {!loading && !err && targets.length === 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-600">No feedback targets found for this ride.</div>
      )}

      {!loading && !err && targets.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2">
          {targets.map((t) => {
            const d = drafts[t.user_id] || { stars: 5, comment: '', submitting: false, submitted: t.already_rated }
            return (
              <article key={t.user_id} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-xl font-black text-slate-900">{t.name}</div>
                    <div className="text-sm text-slate-500">{roleLabel(t.role)}</div>
                  </div>
                  {d.submitted ? (
                    <div className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-700">
                      <CheckCircle2 className="h-4 w-4" />
                      Submitted
                    </div>
                  ) : (
                    <div className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-700">Pending</div>
                  )}
                </div>

                <div className="mt-4">
                  <div className="mb-2 text-sm font-semibold text-slate-700">Your Rating</div>
                  <div className="flex items-center gap-2">
                    {STAR_CHOICES.map((n) => (
                      <button
                        key={n}
                        type="button"
                        disabled={d.submitted}
                        onClick={() => patchDraft(t.user_id, { stars: n })}
                        className={`rounded-xl border px-3 py-2 text-sm font-bold ${d.stars === n ? 'border-amber-300 bg-amber-50 text-amber-700' : 'border-slate-200 bg-white text-slate-700'} disabled:opacity-60`}
                      >
                        <span className="inline-flex items-center gap-1">
                          <Star className={`h-4 w-4 ${d.stars >= n ? 'fill-amber-400 text-amber-400' : 'text-slate-300'}`} />
                          {n}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="mt-4">
                  <div className="mb-2 text-sm font-semibold text-slate-700">Comment</div>
                  <textarea
                    rows={3}
                    disabled={d.submitted}
                    value={d.comment}
                    onChange={(e) => patchDraft(t.user_id, { comment: e.target.value })}
                    placeholder="Share your experience"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-200 disabled:opacity-60"
                  />
                </div>

                <div className="mt-4">
                  <Button onClick={() => submitFor(t.user_id)} disabled={d.submitted || d.submitting}>
                    {d.submitting ? 'Submitting...' : d.submitted ? 'Submitted' : 'Submit Feedback'}
                  </Button>
                </div>
              </article>
            )
          })}
        </div>
      )}

      <div className="flex gap-3 pb-2">
        <Button variant="ghost" onClick={() => nav(-1)}>Back</Button>
        <Button onClick={() => nav(role === 'driver' ? '/driver' : '/rider')}>Done</Button>
      </div>
    </section>
  )
}

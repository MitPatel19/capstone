import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CarFront, Clock3, MapPin, Plus, Star } from 'lucide-react'
import { api } from '../api'
import { Button } from '../components/Button'
import { money } from '../utils'

type Ride = {
  id: number
  pickup_text: string
  time_iso: string
  posted_price: number
  status: string
  bargain_price?: number | null
  first_dropoff_text?: string
  driver_name?: string
  driver_rating?: number
  driver_vehicle?: string
}
type Metrics = { active_rides: number; total_rides: number; rating_avg: number }
type Me = { name: string }

function StatCard({ label, value, icon }: { label: string; value: React.ReactNode; icon: React.ReactNode }) {
  return (
    <article className="rounded-3xl border border-slate-300 bg-white p-5">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm text-slate-600">{label}</div>
          <div className="mt-1 text-4xl font-bold">{value}</div>
        </div>
        <div className="text-slate-200">{icon}</div>
      </div>
    </article>
  )
}

function formatTime12h(input: string) {
  if (!input) return '-'
  const dt = new Date(input)
  if (!Number.isNaN(dt.getTime())) {
    return dt.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', hour12: true }) + ' Today'
  }
  return input
}

function statusBadge(status: string) {
  if (status === 'confirmed' || status === 'in_progress') return 'Accepted'
  if (status === 'requested' || status === 'bargaining') return 'Requested'
  return status.split('_').join(' ')
}

export default function RiderDashboard() {
  const nav = useNavigate()
  const [active, setActive] = useState<Ride[]>([])
  const [pending, setPending] = useState<Ride[]>([])
  const [joinable, setJoinable] = useState<Ride[]>([])
  const [metrics, setMetrics] = useState<Metrics | null>(null)
  const [me, setMe] = useState<Me | null>(null)
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    const [my, met, act, meRes] = await Promise.all([api.get('/rides/me'), api.get('/auth/metrics'), api.get('/rides/active'), api.get('/auth/me')])
    const rides: Ride[] = my.data || []
    setActive(rides.filter((r) => r.status === 'confirmed' || r.status === 'in_progress'))
    setPending(rides.filter((r) => r.status === 'requested' || r.status === 'bargaining'))
    setJoinable((act.data || []).filter((r: Ride) => r.status === 'confirmed' || r.status === 'in_progress'))
    setMetrics({ active_rides: met.data.active_rides, total_rides: met.data.total_rides, rating_avg: met.data.rating_avg })
    setMe(meRes.data)
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  return (
    <div className="space-y-8">
      <section>
        <h1 className="text-4xl font-black">Welcome back, {me?.name || 'Rider'}!</h1>
        <p className="mt-1 text-sm text-slate-600">Manage your rides and travel safely</p>
      </section>

      <section className="grid gap-6 md:grid-cols-3">
        <StatCard label="Active Rides" value={metrics?.active_rides ?? (loading ? '-' : 0)} icon={<CarFront className="h-11 w-11 text-blue-200" />} />
        <StatCard
          label="Your Rating"
          value={
            <span className="inline-flex items-center gap-1">
              {(metrics?.rating_avg ?? 0).toFixed(1)}
              <Star className="h-6 w-6 fill-amber-400 text-amber-400" />
            </span>
          }
          icon={<Star className="h-11 w-11 text-amber-200" />}
        />
        <StatCard label="Total Rides" value={metrics?.total_rides ?? (loading ? '-' : 0)} icon={<MapPin className="h-11 w-11 text-emerald-200" />} />
      </section>

      <div>
        <Button onClick={() => nav('/ride/create')}>
          <span className="inline-flex items-center gap-2">
            <Plus className="h-5 w-5" />
            Create Ride Request
          </span>
        </Button>
      </div>

      <section className="space-y-4">
        <h2 className="text-3xl font-black">Active Rides</h2>
        {loading ? (
          <div className="text-sm text-slate-600">Loading...</div>
        ) : active.length === 0 ? (
          <div className="rounded-3xl border border-slate-300 bg-white p-6 text-slate-600">No active rides.</div>
        ) : (
          <div className="space-y-4">
            {active.map((r) => (
              <button key={r.id} onClick={() => nav(`/ride/${r.id}`)} className="w-full rounded-3xl border border-slate-300 bg-white p-6 text-left hover:bg-slate-50">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="inline-flex items-center gap-3">
                      <h3 className="text-4 font-black">{`Ride to ${r.first_dropoff_text?.split(',')[0] || 'Destination'}`}</h3>
                      <span className="rounded-xl bg-slate-900 px-3 py-1 text-sm font-bold text-white">{statusBadge(r.status)}</span>
                    </div>
                    <div className="mt-3 space-y-1 text-slate-600">
                      <div className="inline-flex items-center gap-2">
                        <MapPin className="h-4 w-4 text-emerald-600" />
                        <span className="text-3.5"><b>Pickup:</b> {r.pickup_text}</span>
                      </div>
                      <div className="inline-flex items-center gap-2">
                        <MapPin className="h-4 w-4 text-rose-500" />
                        <span className="text-3.5"><b>Dropoff:</b> {r.first_dropoff_text || 'Destination'}</span>
                      </div>
                    </div>
                  </div>
                  <div className="text-5xl font-bold text-brand-600">{money(r.bargain_price ?? r.posted_price)}</div>
                </div>
                <div className="mt-6 flex items-end justify-between">
                  <div className="inline-flex items-center gap-2 text-slate-600">
                    <Clock3 className="h-5 w-5" />
                    <span>{formatTime12h(r.time_iso)}</span>
                  </div>
                  <div className="text-right">
                    <div className="text-xl font-bold">{r.driver_name || 'Driver'}</div>
                    <div className="text-slate-600">{r.driver_vehicle || 'Vehicle not available'}</div>
                    <div className="inline-flex items-center gap-1 text-amber-500">
                      <Star className="h-4 w-4 fill-amber-500" />
                      <span className="font-semibold">{(r.driver_rating ?? 0).toFixed(1)}</span>
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-4 pb-8">
        <h2 className="text-3xl font-black">Pending Requests</h2>
        {loading ? (
          <div className="text-sm text-slate-600">Loading...</div>
        ) : pending.length === 0 ? (
          <div className="rounded-3xl border border-slate-300 bg-white p-6 text-slate-600">No pending requests.</div>
        ) : (
          <div className="space-y-4">
            {pending.map((r) => (
              <button key={r.id} onClick={() => nav(`/ride/${r.id}`)} className="w-full rounded-3xl border border-slate-300 bg-white p-6 text-left hover:bg-slate-50">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="inline-flex items-center gap-3">
                      <h3 className="text-4 font-black">{`Ride to ${r.first_dropoff_text?.split(',')[0] || 'Destination'}`}</h3>
                      <span className="rounded-xl bg-slate-100 px-3 py-1 text-sm font-bold">{statusBadge(r.status)}</span>
                    </div>
                    <div className="mt-3 space-y-1 text-slate-600">
                      <div className="inline-flex items-center gap-2">
                        <MapPin className="h-4 w-4 text-emerald-600" />
                        <span><b>Pickup:</b> {r.pickup_text}</span>
                      </div>
                      <div className="inline-flex items-center gap-2">
                        <MapPin className="h-4 w-4 text-rose-500" />
                        <span><b>Dropoff:</b> {r.first_dropoff_text || 'Destination'}</span>
                      </div>
                    </div>
                  </div>
                  <div className="text-5xl font-bold text-brand-600">{money(r.bargain_price ?? r.posted_price)}</div>
                </div>
                <div className="mt-6 inline-flex items-center gap-2 text-slate-600">
                  <Clock3 className="h-5 w-5" />
                  <span>{formatTime12h(r.time_iso)}</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-4 pb-8">
        <h2 className="text-3xl font-black">Join Existing Rides</h2>
        {loading ? (
          <div className="text-sm text-slate-600">Loading...</div>
        ) : joinable.length === 0 ? (
          <div className="rounded-3xl border border-slate-300 bg-white p-6 text-slate-600">No joinable rides available right now.</div>
        ) : (
          <div className="space-y-4">
            {joinable.map((r) => (
              <button key={r.id} onClick={() => nav(`/ride/${r.id}`)} className="w-full rounded-3xl border border-slate-300 bg-white p-6 text-left hover:bg-slate-50">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="inline-flex items-center gap-3">
                      <h3 className="text-4 font-black">{`Ride #${r.id}`}</h3>
                      <span className="rounded-xl bg-emerald-600 px-3 py-1 text-sm font-bold text-white">Joinable</span>
                    </div>
                    <div className="mt-3 space-y-1 text-slate-600">
                      <div className="inline-flex items-center gap-2">
                        <MapPin className="h-4 w-4 text-emerald-600" />
                        <span><b>Pickup:</b> {r.pickup_text}</span>
                      </div>
                      <div className="inline-flex items-center gap-2">
                        <MapPin className="h-4 w-4 text-rose-500" />
                        <span><b>Main Dropoff:</b> {r.first_dropoff_text || 'Destination'}</span>
                      </div>
                    </div>
                  </div>
                  <div className="text-lg font-semibold text-slate-600">Open to send join request</div>
                </div>
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CarFront, Clock3, MapPin, Plus, Star, Users } from 'lucide-react'
import { api } from '../api'
import { Button } from '../components/Button'
import { money } from '../utils'
import { wsClient } from '../ws'

type Ride = {
  id: number
  rider_id?: number
  pickup_text: string
  time_iso: string
  posted_price: number
  status: string
  bargain_price?: number | null
  primary_rider_net_price?: number
  first_dropoff_text?: string
  driver_name?: string
  driver_rating?: number
  driver_vehicle?: string
}
type Metrics = { active_rides: number; total_rides: number; rating_avg: number; active_riders: number; active_drivers: number }
type Me = { id: number; name: string }

function StatCard({ label, value, icon }: { label: string; value: React.ReactNode; icon: React.ReactNode }) {
  return (
    <article className="h-full min-h-[8.5rem] rounded-3xl border border-slate-300 bg-white p-5">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="text-sm text-slate-600">{label}</div>
          <div className="mt-1 text-3xl font-bold sm:text-4xl">{value}</div>
        </div>
        <div className="shrink-0 text-slate-200">{icon}</div>
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

function RideCard({ ride, meId, onOpen, joinable = false }: { ride: Ride; meId?: number; onOpen: () => void; joinable?: boolean }) {
  const fare = joinable
    ? null
    : money(ride.rider_id === meId ? (ride.primary_rider_net_price ?? ride.bargain_price ?? ride.posted_price) : (ride.bargain_price ?? ride.posted_price))

  return (
    <button onClick={onOpen} className="w-full rounded-3xl border border-slate-300 bg-white p-5 text-left transition hover:bg-slate-50 sm:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <h3 className="text-lg font-black sm:text-xl">{joinable ? `Ride #${ride.id}` : `Ride to ${ride.first_dropoff_text?.split(',')[0] || 'Destination'}`}</h3>
            <span className={`rounded-xl px-3 py-1 text-xs font-bold sm:text-sm ${joinable ? 'bg-emerald-600 text-white' : ride.status === 'confirmed' || ride.status === 'in_progress' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-900'}`}>
              {joinable ? 'Joinable' : statusBadge(ride.status)}
            </span>
          </div>
          <div className="mt-3 space-y-2 text-sm text-slate-600 sm:text-base">
            <div className="flex items-start gap-2">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
              <span className="min-w-0 break-words"><b>Pickup:</b> {ride.pickup_text}</span>
            </div>
            <div className="flex items-start gap-2">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-rose-500" />
              <span className="min-w-0 break-words"><b>{joinable ? 'Main Dropoff:' : 'Dropoff:'}</b> {ride.first_dropoff_text || 'Destination'}</span>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between lg:flex-col lg:items-end lg:text-right">
          {fare ? (
            <div className="text-3xl font-bold text-brand-600 sm:text-4xl">{fare}</div>
          ) : (
            <div className="text-sm font-semibold text-slate-600 sm:text-base">Open to send join request</div>
          )}

          {!joinable && (
            <div className="text-sm text-slate-600 sm:text-base lg:max-w-[14rem]">
              <div className="text-base font-bold text-slate-900 sm:text-lg">{ride.driver_name || 'Driver'}</div>
              <div>{ride.driver_vehicle || 'Vehicle not available'}</div>
              <div className="mt-1 inline-flex items-center gap-1 text-amber-500 lg:justify-end">
                <Star className="h-4 w-4 fill-amber-500" />
                <span className="font-semibold">{(ride.driver_rating ?? 0).toFixed(1)}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="mt-5 flex items-center gap-2 text-sm text-slate-600 sm:text-base">
        <Clock3 className="h-5 w-5 shrink-0" />
        <span>{formatTime12h(ride.time_iso)}</span>
      </div>
    </button>
  )
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
    setMetrics({
      active_rides: met.data.active_rides,
      total_rides: met.data.total_rides,
      rating_avg: met.data.rating_avg,
      active_riders: met.data.active_riders,
      active_drivers: met.data.active_drivers,
    })
    setMe(meRes.data)
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  useEffect(() => {
    const unsub = wsClient.on((msg) => {
      if (msg?.type === 'presence_update') {
        setMetrics((current) => ({
          active_rides: current?.active_rides ?? 0,
          total_rides: current?.total_rides ?? 0,
          rating_avg: current?.rating_avg ?? 0,
          active_riders: Number(msg.active_riders ?? 0),
          active_drivers: Number(msg.active_drivers ?? 0),
        }))
      }
    })
    return () => {
      void unsub()
    }
  }, [])

  return (
    <div className="space-y-6 sm:space-y-8">
      <section>
        <h1 className="text-3xl font-black sm:text-4xl">Welcome back, {me?.name || 'Rider'}!</h1>
        <p className="mt-1 text-sm text-slate-600 sm:text-base">Manage your rides and travel safely</p>
      </section>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5 md:gap-6">
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
        <StatCard label="Active Riders" value={metrics?.active_riders ?? (loading ? '-' : 0)} icon={<Users className="h-11 w-11 text-sky-200" />} />
        <StatCard label="Active Drivers" value={metrics?.active_drivers ?? (loading ? '-' : 0)} icon={<CarFront className="h-11 w-11 text-emerald-200" />} />
      </section>

      <div>
        <Button className="w-full sm:w-auto" onClick={() => nav('/ride/create')}>
          <span className="inline-flex items-center gap-2">
            <Plus className="h-5 w-5" />
            Create Ride Request
          </span>
        </Button>
      </div>

      <section className="space-y-4">
        <h2 className="text-2xl font-black sm:text-3xl">Active Rides</h2>
        {loading ? (
          <div className="text-sm text-slate-600">Loading...</div>
        ) : active.length === 0 ? (
          <div className="rounded-3xl border border-slate-300 bg-white p-6 text-slate-600">No active rides.</div>
        ) : (
          <div className="space-y-4">
            {active.map((r) => (
              <RideCard key={r.id} ride={r} meId={me?.id} onOpen={() => nav(`/ride/${r.id}`)} />
            ))}
          </div>
        )}
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-black sm:text-3xl">Pending Requests</h2>
        {loading ? (
          <div className="text-sm text-slate-600">Loading...</div>
        ) : pending.length === 0 ? (
          <div className="rounded-3xl border border-slate-300 bg-white p-6 text-slate-600">No pending requests.</div>
        ) : (
          <div className="space-y-4">
            {pending.map((r) => (
              <RideCard key={r.id} ride={r} meId={me?.id} onOpen={() => nav(`/ride/${r.id}`)} />
            ))}
          </div>
        )}
      </section>

      <section className="space-y-4 pb-8">
        <h2 className="text-2xl font-black sm:text-3xl">Join Existing Rides</h2>
        {loading ? (
          <div className="text-sm text-slate-600">Loading...</div>
        ) : joinable.length === 0 ? (
          <div className="rounded-3xl border border-slate-300 bg-white p-6 text-slate-600">No joinable rides available right now.</div>
        ) : (
          <div className="space-y-4">
            {joinable.map((r) => (
              <RideCard key={r.id} ride={r} onOpen={() => nav(`/ride/${r.id}`)} joinable />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

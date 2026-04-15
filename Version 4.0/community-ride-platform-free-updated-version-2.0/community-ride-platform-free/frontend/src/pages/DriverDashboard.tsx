import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowUpRight, Clock3, MapPin, Star, Wallet, CarFront, Users } from 'lucide-react'
import { api } from '../api'
import { DriverTopBar } from '../components/DriverTopBar'
import { money } from '../utils'
import { wsClient } from '../ws'

type Ride = {
  id: number
  pickup_text: string
  time_iso: string
  posted_price: number
  status: string
  bargain_price?: number | null
  driver_total_earnings?: number
  driver_id?: number | null
  first_dropoff_text?: string
  rider_name?: string
  rider_rating?: number
}
type Metrics = {
  accepted_rides: number
  rating_avg: number
  todays_earnings: number
  total_driver_rides: number
  active_riders: number
  active_drivers: number
}
type Me = { name: string }

function statusPill(status: string) {
  const normalized = status.split('_').join(' ')
  if (status === 'bargaining' || status === 'requested') return <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold">New Request</span>
  if (status === 'confirmed' || status === 'in_progress') return <span className="rounded-full bg-emerald-600 px-3 py-1 text-xs font-bold text-white">Accepted</span>
  return <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold capitalize">{normalized}</span>
}

function formatTime12h(input: string) {
  const dt = new Date(input)
  if (Number.isNaN(dt.getTime())) return input || '-'
  return dt.toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })
}

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

function RideCard({ ride, onOpen }: { ride: Ride; onOpen: () => void }) {
  return (
    <button onClick={onOpen} className="w-full rounded-3xl border border-slate-300 bg-white p-5 text-left transition hover:bg-slate-50">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <h3 className="text-lg font-black sm:text-xl">{ride.rider_name || `Ride #${ride.id}`}</h3>
            {statusPill(ride.status)}
          </div>

          <div className="mt-2 inline-flex items-center gap-1 text-amber-500">
            <Star className="h-4 w-4 fill-amber-500" />
            <span className="text-sm font-semibold">{(ride.rider_rating ?? 0).toFixed(1)}</span>
          </div>

          <div className="mt-5 space-y-2 text-slate-700">
            <div className="flex items-start gap-2">
              <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
              <div className="min-w-0">
                <div className="text-sm text-slate-600">Pickup</div>
                <div className="break-words text-base font-semibold">{ride.pickup_text}</div>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-rose-500" />
              <div className="min-w-0">
                <div className="text-sm text-slate-600">Drop-off</div>
                <div className="break-words text-base font-semibold">{ride.first_dropoff_text || 'Destination not set'}</div>
              </div>
            </div>
          </div>
        </div>

        <div className="text-left sm:text-right">
          <div className="text-3xl font-bold text-emerald-600">{money(ride.driver_total_earnings ?? ride.bargain_price ?? ride.posted_price)}</div>
        </div>
      </div>

      <div className="mt-5 flex items-center gap-2 text-sm text-slate-600 sm:text-base">
        <Clock3 className="h-5 w-5 shrink-0" />
        <span>{formatTime12h(ride.time_iso)}</span>
      </div>
    </button>
  )
}

export default function DriverDashboard() {
  const nav = useNavigate()
  const [available, setAvailable] = useState<Ride[]>([])
  const [mine, setMine] = useState<Ride[]>([])
  const [metrics, setMetrics] = useState<Metrics | null>(null)
  const [me, setMe] = useState<Me | null>(null)
  const [loading, setLoading] = useState(true)
  const [gateMsg, setGateMsg] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setGateMsg(null)
    const [met, meRes] = await Promise.all([api.get('/auth/metrics'), api.get('/auth/me')])
    setMetrics(met.data)
    setMe(meRes.data)
    try {
      const [a, m] = await Promise.all([api.get('/rides/available'), api.get('/rides/me')])
      setAvailable(a.data)
      setMine(m.data.filter((r: Ride) => r.driver_id || r.status !== 'requested'))
    } catch (e: any) {
      if (e?.response?.status === 403) {
        setAvailable([])
        setMine([])
        setGateMsg('Your documents are pending admin approval. Active rides will appear after approval.')
      } else {
        throw e
      }
    }
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  useEffect(() => {
    const unsub = wsClient.on((msg) => {
      if (msg?.type === 'ride_market_update' || msg?.type === 'ride_update') {
        void load()
      }
      if (msg?.type === 'presence_update') {
        setMetrics((current) => ({
          accepted_rides: current?.accepted_rides ?? 0,
          rating_avg: current?.rating_avg ?? 0,
          todays_earnings: current?.todays_earnings ?? 0,
          total_driver_rides: current?.total_driver_rides ?? 0,
          active_riders: Number(msg.active_riders ?? 0),
          active_drivers: Number(msg.active_drivers ?? 0),
        }))
      }
    })
    return () => {
      void unsub()
    }
  }, [])

  const stats = useMemo(
    () => [
      { label: 'Accepted Rides', value: metrics?.accepted_rides ?? 0, icon: <CarFront className="h-11 w-11 text-emerald-200" /> },
      {
        label: 'Your Rating',
        value: (
          <span className="inline-flex items-center gap-1">
            {(metrics?.rating_avg ?? 0).toFixed(1)}
            <Star className="h-6 w-6 fill-amber-400 text-amber-400" />
          </span>
        ),
        icon: <Star className="h-11 w-11 text-amber-200" />,
      },
      { label: "Today's Earnings", value: money(metrics?.todays_earnings ?? 0), icon: <Wallet className="h-11 w-11 text-emerald-200" /> },
      { label: 'Total Rides', value: metrics?.total_driver_rides ?? 0, icon: <ArrowUpRight className="h-11 w-11 text-blue-200" /> },
      { label: 'Active Riders', value: metrics?.active_riders ?? 0, icon: <Users className="h-11 w-11 text-sky-200" /> },
      { label: 'Active Drivers', value: metrics?.active_drivers ?? 0, icon: <CarFront className="h-11 w-11 text-emerald-200" /> },
    ],
    [metrics]
  )

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <DriverTopBar />
      <main className="mx-auto w-full max-w-6xl space-y-6 px-4 py-5 pb-safe sm:space-y-8 sm:py-8">
        <section>
          <h1 className="text-3xl font-black sm:text-4xl">Welcome, {me?.name || 'Driver'}!</h1>
          <p className="mt-1 text-sm text-slate-600 sm:text-base">Accept rides and earn money</p>
        </section>

        <section className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-4 md:gap-6">
          {stats.map((s) => (
            <StatCard key={s.label} label={s.label} value={s.value} icon={s.icon} />
          ))}
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-black sm:text-3xl">Available Ride Requests</h2>
          {gateMsg && <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">{gateMsg}</div>}
          {loading ? (
            <div className="text-base text-slate-600">Loading...</div>
          ) : available.length === 0 ? (
            <div className="rounded-2xl border border-slate-300 bg-white p-6 text-base text-slate-600">No available ride requests right now.</div>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2 lg:gap-6">
              {available.map((ride) => (
                <RideCard key={ride.id} ride={ride} onOpen={() => nav(`/driver/ride/${ride.id}`)} />
              ))}
            </div>
          )}
        </section>

        <section className="space-y-4 pb-8">
          <h2 className="text-2xl font-black sm:text-3xl">Your Accepted Rides</h2>
          {loading ? (
            <div className="text-base text-slate-600">Loading...</div>
          ) : mine.length === 0 ? (
            <div className="rounded-2xl border border-slate-300 bg-white p-6 text-base text-slate-600">No accepted rides yet.</div>
          ) : (
            <div className="space-y-4">
              {mine.map((ride) => (
                <RideCard key={ride.id} ride={ride} onOpen={() => nav(`/driver/ride/${ride.id}`)} />
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  )
}

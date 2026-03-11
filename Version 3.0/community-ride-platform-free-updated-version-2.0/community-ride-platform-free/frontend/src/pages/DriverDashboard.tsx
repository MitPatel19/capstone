import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowUpRight, Clock3, MapPin, Star, Wallet, CarFront } from 'lucide-react'
import { api } from '../api'
import { DriverTopBar } from '../components/DriverTopBar'
import { money } from '../utils'

type Ride = {
  id: number
  pickup_text: string
  time_iso: string
  posted_price: number
  status: string
  bargain_price?: number | null
  driver_id?: number | null
  first_dropoff_text?: string
  rider_name?: string
  rider_rating?: number
}
type Metrics = { accepted_rides: number; rating_avg: number; todays_earnings: number; total_driver_rides: number }
type Me = { name: string }

function statusPill(status: string) {
  const normalized = status.split('_').join(' ')
  if (status === 'bargaining' || status === 'requested') return <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold">New Request</span>
  if (status === 'confirmed' || status === 'in_progress') return <span className="rounded-full bg-emerald-600 px-3 py-1 text-xs font-bold text-white">Accepted</span>
  return <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold capitalize">{normalized}</span>
}

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

function RideCard({ ride, onOpen }: { ride: Ride; onOpen: () => void }) {
  return (
    <button onClick={onOpen} className="w-full rounded-3xl border border-slate-300 bg-white p-5 text-left hover:bg-slate-50">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h3 className="text-xl font-black">{ride.rider_name || `Ride #${ride.id}`}</h3>
          {statusPill(ride.status)}
        </div>
        <div className="text-3xl font-bold text-emerald-600">{money(ride.bargain_price ?? ride.posted_price)}</div>
      </div>

      <div className="mt-2 inline-flex items-center gap-1 text-amber-500">
        <Star className="h-4 w-4 fill-amber-500" />
        <span className="text-sm font-semibold">{(ride.rider_rating ?? 0).toFixed(1)}</span>
      </div>

      <div className="mt-6 space-y-2 text-slate-700">
        <div className="flex items-start gap-2">
          <MapPin className="mt-0.5 h-5 w-5 text-emerald-600" />
          <div>
            <div className="text-sm text-slate-600">Pickup</div>
            <div className="text-base font-semibold">{ride.pickup_text}</div>
          </div>
        </div>
        <div className="flex items-start gap-2">
          <MapPin className="mt-0.5 h-5 w-5 text-rose-500" />
          <div>
            <div className="text-sm text-slate-600">Drop-off</div>
            <div className="text-base font-semibold">{ride.first_dropoff_text || 'Destination not set'}</div>
          </div>
        </div>
      </div>

      <div className="mt-6 flex items-center gap-2 text-slate-600">
        <Clock3 className="h-5 w-5" />
        <span className="text-base">{ride.time_iso}</span>
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
    ],
    [metrics]
  )

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <DriverTopBar />
      <main className="mx-auto w-full max-w-6xl space-y-8 px-4 py-8">
        <section>
          <h1 className="text-4xl font-black">Welcome, {me?.name || 'Driver'}!</h1>
          <p className="mt-1 text-sm text-slate-600">Accept rides and earn money</p>
        </section>

        <section className="grid grid-cols-1 gap-6 sm:grid-cols-2 md:grid-cols-4">
          {stats.map((s) => (
            <StatCard key={s.label} label={s.label} value={s.value} icon={s.icon} />
          ))}
        </section>

        <section className="space-y-4">
          <h2 className="text-3xl font-black">Available Ride Requests</h2>
          {gateMsg && <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">{gateMsg}</div>}
          {loading ? (
            <div className="text-base text-slate-600">Loading...</div>
          ) : available.length === 0 ? (
            <div className="rounded-2xl border border-slate-300 bg-white p-6 text-base text-slate-600">No available ride requests right now.</div>
          ) : (
            <div className="grid gap-6 lg:grid-cols-2">
              {available.map((ride) => (
                <RideCard key={ride.id} ride={ride} onOpen={() => nav(`/driver/ride/${ride.id}`)} />
              ))}
            </div>
          )}
        </section>

        <section className="space-y-4 pb-8">
          <h2 className="text-3xl font-black">Your Accepted Rides</h2>
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

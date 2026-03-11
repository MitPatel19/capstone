import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import { Card, CardContent, CardHeader } from '../components/Card'
import { Button } from '../components/Button'
import { money } from '../utils'

type Ride = { id:number; pickup_text:string; time_iso:string; posted_price:number; status:string; bargain_price?:number|null; rider_id:number; driver_id?:number|null }
type Metrics = { active_rides:number; total_rides:number; rating_avg:number }

function StatCard({ label, value, icon }: {label:string; value:React.ReactNode; icon:React.ReactNode}) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 flex items-center justify-between">
      <div>
        <div className="text-sm text-slate-600">{label}</div>
        <div className="text-4xl font-black leading-tight">{value}</div>
      </div>
      <div className="text-slate-200">{icon}</div>
    </div>
  )
}

export default function RiderDashboard() {
  const nav = useNavigate()
  const [activeOthers, setActiveOthers] = useState<Ride[]>([])
  const [myRides, setMyRides] = useState<Ride[]>([])
  const [metrics, setMetrics] = useState<Metrics|null>(null)
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    const [a, m, met] = await Promise.all([
      api.get('/rides/active'),
      api.get('/rides/me'),
      api.get('/auth/metrics'),
    ])
    setActiveOthers(a.data)
    setMyRides(m.data)
    setMetrics({ active_rides: met.data.active_rides, total_rides: met.data.total_rides, rating_avg: met.data.rating_avg })
    setLoading(false)
  }
  useEffect(()=>{ load() }, [])

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-3 items-center justify-between">
        <div>
          <div className="text-4xl font-black">Welcome back!</div>
          <div className="text-sm text-slate-600 mt-1">Manage your rides and travel safely</div>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={()=>nav('/billing')}>Billing</Button>
          <Button variant="ghost" onClick={()=>nav('/profile')}>Profile</Button>
          <Button onClick={()=>nav('/ride/create')}>Create Ride Request</Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid md:grid-cols-3 gap-4">
        <StatCard label="Active Rides" value={metrics?.active_rides ?? (loading ? '—' : 0)} icon={<span className="text-6xl">🚗</span>} />
        <StatCard label="Your Rating" value={<span className="flex items-center gap-2">{(metrics?.rating_avg ?? 0).toFixed(1)} <span className="text-3xl">⭐</span></span>} icon={<span className="text-6xl">☆</span>} />
        <StatCard label="Total Rides" value={metrics?.total_rides ?? (loading ? '—' : 0)} icon={<span className="text-6xl">📍</span>} />
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        {/* Active rides by other riders */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <div className="font-bold">Active Rides</div>
                <div className="text-xs text-slate-500">Rides created by other riders (not completed yet).</div>
              </div>
              <Button variant="ghost" onClick={load}>Refresh</Button>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? <div className="text-sm text-slate-600">Loading…</div> : activeOthers.length===0 ? <div className="text-sm text-slate-600">No active rides right now.</div> : (
              <div className="space-y-3">
                {activeOthers.map(r => (
                  <button key={r.id} className="w-full text-left rounded-2xl border border-slate-200 bg-white p-4 hover:bg-slate-50"
                    onClick={()=>nav(`/ride/${r.id}`)}>
                    <div className="flex items-center justify-between">
                      <div className="font-black">Ride #{r.id}</div>
                      <span className="text-xs px-2 py-1 rounded-full bg-slate-100 border border-slate-200 capitalize">{r.status.replaceAll('_',' ')}</span>
                    </div>
                    <div className="text-sm text-slate-700 mt-2"><b>Pickup:</b> {r.pickup_text}</div>
                    <div className="text-sm text-slate-700 mt-1"><b>Time:</b> {r.time_iso}</div>
                    <div className="text-sm text-slate-700 mt-1"><b>Price:</b> {money(r.bargain_price ?? r.posted_price)}</div>
                    <div className="text-xs text-slate-500 mt-2">Open to send a Join Request.</div>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* My rides */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <div className="font-bold">My Rides</div>
                <div className="text-xs text-slate-500">Rides created by you (including active + completed).</div>
              </div>
              <Button variant="ghost" onClick={load}>Refresh</Button>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? <div className="text-sm text-slate-600">Loading…</div> : myRides.length===0 ? <div className="text-sm text-slate-600">No rides yet. Create one!</div> : (
              <div className="space-y-3">
                {myRides.map(r => (
                  <button key={r.id} className="w-full text-left rounded-2xl border border-slate-200 bg-white p-4 hover:bg-slate-50"
                    onClick={()=>nav(`/ride/${r.id}`)}>
                    <div className="flex items-center justify-between">
                      <div className="font-black">Ride #{r.id}</div>
                      <span className="text-xs px-2 py-1 rounded-full bg-slate-100 border border-slate-200 capitalize">{r.status.replaceAll('_',' ')}</span>
                    </div>
                    <div className="text-sm text-slate-700 mt-2">{r.pickup_text}</div>
                    <div className="text-sm text-slate-700 mt-1"><b>Price:</b> {money(r.bargain_price ?? r.posted_price)}</div>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

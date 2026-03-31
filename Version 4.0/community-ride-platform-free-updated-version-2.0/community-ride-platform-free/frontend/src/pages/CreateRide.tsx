import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Clock3, MapPin, Navigation, Plus } from 'lucide-react'
import { PlaceAutocomplete } from '../components/PlaceAutocomplete'
import { api } from '../api'
import { mapsLink } from '../utils'

type Stop = { id: string; text: string }

export default function CreateRide() {
  const nav = useNavigate()
  const [pickup, setPickup] = useState('')
  const [timeLocal, setTimeLocal] = useState('')
  const [price, setPrice] = useState(20)
  const [stops, setStops] = useState<Stop[]>([{ id: crypto.randomUUID(), text: '' }])
  const [err, setErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        const res = await api.get('/auth/rider_defaults')
        if (!mounted) return
        const pickupDefault = (res.data?.pickup_text || '').trim()
        const dropoffDefault = (res.data?.dropoff_text || '').trim()
        if (pickupDefault) setPickup(pickupDefault)
        if (dropoffDefault) setStops([{ id: crypto.randomUUID(), text: dropoffDefault }])
      } catch {
        // keep form manual when defaults are unavailable
      }
    })()
    return () => {
      mounted = false
    }
  }, [])

  function addStop() {
    setStops((prev) => [...prev, { id: crypto.randomUUID(), text: '' }])
  }

  function updateStop(id: string, text: string) {
    setStops((prev) => prev.map((s) => (s.id === id ? { ...s, text } : s)))
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setErr(null)
    setLoading(true)
    try {
      const payload = {
        pickup_text: pickup,
        time_iso: timeLocal ? new Date(timeLocal).toISOString() : new Date().toISOString(),
        posted_price: price,
        stops: stops
          .map((s, idx) => ({ dropoff_text: s.text.trim(), order_index: idx }))
          .filter((s) => s.dropoff_text.length > 0),
      }
      const res = await api.post('/rides', payload)
      nav(`/ride/${res.data.id}`)
    } catch (e: any) {
      setErr(e?.response?.data?.detail ?? 'Failed to create ride request')
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="mx-auto w-full max-w-4xl rounded-3xl border border-slate-300 bg-white p-4 sm:p-6">
      <h1 className="text-2xl font-black sm:text-3xl">Create Ride Request</h1>
      <p className="mt-2 text-sm text-slate-500 sm:text-base">Enter your ride details and we&apos;ll connect you with available drivers</p>

      <form className="mt-6 space-y-6" onSubmit={submit}>
        <div>
          <label className="text-sm font-bold">Pickup Location</label>
          <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_auto]">
            <div className="relative">
              <MapPin className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-emerald-600" />
              <PlaceAutocomplete value={pickup} onChange={setPickup} placeholder="Enter pickup address" className="pl-10" />
            </div>
            <button
              type="button"
              className="inline-flex items-center justify-center rounded-xl border border-slate-300 px-4 py-2 hover:bg-slate-50"
              onClick={() => window.open(mapsLink(pickup), '_blank')}
            >
              <Navigation className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <label className="text-sm font-bold">Drop-off Location(s)</label>
            <button type="button" className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold hover:bg-slate-50" onClick={addStop}>
              <Plus className="h-5 w-5" />
              Add Stop
            </button>
          </div>
          <div className="mt-2 space-y-2">
            {stops.map((s, idx) => (
              <div key={s.id} className="grid gap-2 sm:grid-cols-[1fr_auto]">
                <div className="relative">
                  <MapPin className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-rose-500" />
                  <PlaceAutocomplete value={s.text} onChange={(v) => updateStop(s.id, v)} placeholder={`Drop-off ${idx + 1}`} className="pl-10" />
                </div>
                <button
                  type="button"
                  className="inline-flex items-center justify-center rounded-xl border border-slate-300 px-4 py-2 hover:bg-slate-50"
                  onClick={() => window.open(mapsLink(s.text), '_blank')}
                >
                  <Navigation className="h-5 w-5" />
                </button>
              </div>
            ))}
          </div>
        </div>

        <div>
          <label className="text-sm font-bold">Pickup Time</label>
          <div className="relative mt-2">
            <Clock3 className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
            <input
              type="datetime-local"
              className="w-full rounded-xl border border-slate-200 bg-slate-100 py-2 pl-10 pr-3 text-sm outline-none focus:ring-2 focus:ring-brand-200"
              value={timeLocal}
              onChange={(e) => setTimeLocal(e.target.value)}
            />
          </div>
        </div>

        <div>
          <label className="text-sm font-bold">Offered Price</label>
          <div className="relative mt-2">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-3xl text-slate-400">$</span>
            <input
              type="number"
              step="0.5"
              min={0}
              className="w-full rounded-xl border border-slate-200 bg-slate-100 py-2 pl-10 pr-3 text-sm outline-none focus:ring-2 focus:ring-brand-200"
              value={price}
              onChange={(e) => setPrice(parseFloat(e.target.value || '0'))}
            />
          </div>
          <p className="mt-2 text-sm text-slate-600">Drivers may counter-offer with a different price</p>
        </div>

        {err && <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{err}</div>}

        <div className="grid gap-3 md:grid-cols-2">
          <button type="button" className="rounded-xl border border-slate-300 px-4 py-3 text-sm font-bold hover:bg-slate-50" onClick={() => nav('/rider')}>
            Cancel
          </button>
          <button type="submit" className="rounded-xl bg-brand-600 px-4 py-3 text-sm font-bold text-white hover:bg-brand-700 disabled:opacity-60" disabled={loading}>
            {loading ? 'Submitting...' : 'Submit Ride Request'}
          </button>
        </div>
      </form>
    </section>
  )
}

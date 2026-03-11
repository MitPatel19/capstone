import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, CardContent, CardHeader } from '../components/Card'
import { Button } from '../components/Button'
import { Input, Label } from '../components/Input'
import { PlaceAutocomplete } from '../components/PlaceAutocomplete'
import { api } from '../api'
import { mapsLink } from '../utils'

type Stop = { id: string; text: string }

export default function CreateRide() {
  const nav = useNavigate()
  const [pickup, setPickup] = useState('')
  const [time, setTime] = useState('')
  const [price, setPrice] = useState(15)
  const [stops, setStops] = useState<Stop[]>([{ id: crypto.randomUUID(), text: '' }])
  const [err, setErr] = useState<string|null>(null)
  const [loading, setLoading] = useState(false)

  function addStop() {
    setStops(prev => [...prev, { id: crypto.randomUUID(), text: '' }])
  }
  function updateStop(id: string, text: string) {
    setStops(prev => prev.map(s => s.id===id ? { ...s, text } : s))
  }
  function removeStop(id: string) {
    setStops(prev => prev.filter(s => s.id!==id))
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setErr(null); setLoading(true)
    try{
      const payload = {
        pickup_text: pickup,
        time_iso: time || new Date().toISOString(),
        posted_price: price,
        stops: stops
          .map((s, idx) => ({ dropoff_text: s.text.trim(), order_index: idx }))
          .filter(s => s.dropoff_text.length > 0)
      }
      const res = await api.post('/rides', payload)
      nav(`/ride/${res.data.id}`)
    }catch(e:any){
      setErr(e?.response?.data?.detail ?? 'Failed to create ride')
    }finally{ setLoading(false) }
  }

  return (
    <Card>
      <CardHeader>
        <div className="text-2xl font-black">Create Ride Request</div>
        <div className="text-sm text-slate-600 mt-1">Add pickup + multiple drop-off stops.</div>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={submit}>
          <div className="grid md:grid-cols-[1fr_auto] gap-2 items-end">
            <div>
              <Label>Pickup location</Label>
              <PlaceAutocomplete value={pickup} onChange={setPickup} placeholder="Start typing an address…" />
            </div>
            <Button type="button" variant="ghost" onClick={()=> window.open(mapsLink(pickup || ''), '_blank')}>Navigate</Button>
          </div>

          <div>
            <Label>Drop-off locations</Label>
            <div className="space-y-2 mt-1">
              {stops.map((s, idx) => (
                <div key={s.id} className="grid md:grid-cols-[1fr_auto_auto] gap-2 items-end">
                  <PlaceAutocomplete value={s.text} onChange={(v)=>updateStop(s.id, v)} placeholder={`Stop ${idx+1}`} />
                  <Button type="button" variant="ghost" onClick={()=> window.open(mapsLink(s.text || ''), '_blank')}>Navigate</Button>
                  <Button type="button" variant="danger" onClick={()=>removeStop(s.id)}>Remove</Button>
                </div>
              ))}
              <Button type="button" variant="ghost" onClick={addStop}>+ Add Stop</Button>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <Label>Time</Label>
              <Input value={time} onChange={e=>setTime(e.target.value)} placeholder="2026-02-10T09:30" />
              <div className="text-xs text-slate-500 mt-1">Use ISO format or leave blank to use now.</div>
            </div>
            <div>
              <Label>Price</Label>
              <Input type="number" step="0.5" value={price} onChange={e=>setPrice(parseFloat(e.target.value||'0'))} />
            </div>
          </div>

          {err && <div className="rounded-xl bg-rose-50 border border-rose-200 p-3 text-sm text-rose-700">{err}</div>}

          <div className="flex gap-3">
            <Button disabled={loading}>{loading?'Submitting…':'Submit Ride Request'}</Button>
            <Button type="button" variant="ghost" onClick={()=>nav('/rider')}>Back</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

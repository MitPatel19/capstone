import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api, getRole } from '../api'
import { Card, CardContent, CardHeader } from '../components/Card'
import { Button } from '../components/Button'
import { Input, Label } from '../components/Input'
import { money, mapsLink } from '../utils'
import { wsClient } from '../ws'

type Ride = {
  id:number; rider_id:number; driver_id:number|null;
  pickup_text:string; time_iso:string; posted_price:number;
  status:string; bargain_price:number|null;
  rider_confirmed_price:boolean; driver_confirmed_price:boolean;
  otp_verified:boolean;
  stops: { dropoff_text:string; order_index:number }[];
}

type Msg = { id:number; sender_id:number; content:string; created_at:string }
type JoinReq = { id:number; ride_id:number; joiner_id:number; from_text:string; to_text:string; price:number; created_at:string }

const CANCEL_REASONS_RIDER = ['Found another ride','Schedule change','Emergency','Other']
const CANCEL_REASONS_DRIVER = ['Road closed','Vehicle issue','Emergency','Other']

export default function RideDetail() {
  const { id } = useParams()
  const rideId = Number(id)
  const nav = useNavigate()
  const role = getRole()

  const [ride, setRide] = useState<Ride|null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string|null>(null)

  const [messages, setMessages] = useState<Msg[]>([])
  const [chat, setChat] = useState('')
  const [joinForm, setJoinForm] = useState({ from_text:'', to_text:'', price: 8 })
  const [joinRequests, setJoinRequests] = useState<JoinReq[]>([])
  const [bargainPrice, setBargainPrice] = useState<number>(0)
  const [cancelReason, setCancelReason] = useState<string>('')

  const [otp, setOtp] = useState<string>(localStorage.getItem(`otp_${rideId}`) ?? '')
  const [otpInput, setOtpInput] = useState('')

  async function load() {
    setLoading(true); setErr(null)
    try {
      const r = await api.get(`/rides/${rideId}`)
      setRide(r.data)
      setBargainPrice(r.data.bargain_price ?? r.data.posted_price)

      // Recent join requests (primary rider + driver only)
      try {
        const jr = await api.get(`/rides/${rideId}/join_requests_recent`)
        setJoinRequests(jr.data)
      } catch {}

      // Chat is only for primary rider + assigned driver
      try {
        const m = await api.get(`/rides/${rideId}/messages`)
        setMessages(m.data)
      } catch {
        setMessages([])
      }
    } catch (e:any) {
      setErr(e?.response?.data?.detail ?? 'Failed to load ride')
    } finally {
      setLoading(false)
    }
  }

  useEffect(()=>{ if (rideId) load() }, [rideId])

  useEffect(() => {
    const off = wsClient.on((msg) => {
      if (msg?.type === 'chat_message' && msg.ride_id === rideId) {
        setMessages(prev => [...prev, { id: Date.now(), sender_id: msg.sender_id, content: msg.content, created_at: msg.created_at }])
      }
      if (msg?.type === 'ride_update' && msg.ride_id === rideId) {
        load()
      }
      if (msg?.type === 'join_request' && msg.join_request?.ride_id === rideId) {
        setJoinRequests(prev => [msg.join_request, ...prev].slice(0, 5))
      }
      if (msg?.type === 'otp_generated' && msg.ride_id === rideId) {
        setOtp(msg.otp)
        localStorage.setItem(`otp_${rideId}`, msg.otp)
      }
      if (msg?.type === 'ride_completed' && msg.ride_id === rideId) {
        // show feedback CTA
      }
    })
    return () => off()
  }, [rideId])

  async function sendChat() {
    if (!chat.trim()) return
    await api.post(`/rides/${rideId}/message`, { content: chat })
    setChat('')
  }

  async function doBargain(newPrice: number) {
    await api.post(`/rides/${rideId}/bargain`, { new_price: newPrice })
    await load()
  }

  async function confirmPrice() {
    await api.post(`/rides/${rideId}/confirm_price`)
    await load()
  }

  async function cancelRide() {
    if (!cancelReason) { alert('Select a reason'); return }
    await api.post(`/rides/${rideId}/cancel`, { reason: cancelReason })
    await load()
  }

  async function requestJoin() {
    await api.post(`/rides/${rideId}/join`, joinForm)
    alert('Join request sent (popup to driver & primary rider).')
    setJoinForm({ from_text:'', to_text:'', price: 8 })
  }

  async function decideJoin(jrId: number, accept: boolean) {
    if (role === 'driver') await api.post(`/rides/join_requests/${jrId}/driver_decide?accept=${accept}`)
    if (role === 'rider') await api.post(`/rides/join_requests/${jrId}/rider_decide?accept=${accept}`)
    alert('Decision sent.')
  }

  async function generateOtp() {
    const res = await api.post(`/rides/${rideId}/otp/generate`)
    setOtp(res.data.otp)
    localStorage.setItem(`otp_${rideId}`, res.data.otp)
  }

  async function verifyOtp() {
    await api.post(`/rides/${rideId}/otp/verify`, { otp: otpInput })
    setOtpInput('')
    await load()
  }

  async function completeRide() {
    await api.post(`/rides/${rideId}/complete`)
    await load()
    nav(`/feedback/${rideId}`)
  }

  if (loading) return <div className="text-sm text-slate-600">Loading…</div>
  if (err) return <div className="rounded-xl bg-rose-50 border border-rose-200 p-3 text-sm text-rose-700">{err}</div>
  if (!ride) return null

  const canJoin = role === 'rider' && ride.rider_id !== Number(localStorage.getItem('crcp_uid') ?? -1) && ride.status !== 'cancelled'
  const reasons = role === 'driver' ? CANCEL_REASONS_DRIVER : CANCEL_REASONS_RIDER

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-3xl font-black">Ride #{ride.id}</div>
          <div className="text-sm text-slate-600 capitalize">Status: {ride.status.replaceAll('_',' ')}</div>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={()=>nav('/billing')}>Billing</Button>
          <Button variant="ghost" onClick={()=>nav(role ? `/${role}` : '/')}>Back</Button>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader><div className="font-bold">Ride Details</div></CardHeader>
          <CardContent className="space-y-3">
              {!canJoin && <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">Join request is available only on <b>Active Rides</b> (rides created by other riders). On <b>My Rides</b>, you can only review join requests.</div>}

            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex flex-wrap gap-2 items-start justify-between">
                <div>
                  <div className="text-sm text-slate-600">Pickup</div>
                  <div className="font-semibold">{ride.pickup_text}</div>
                </div>
                <Button variant="ghost" onClick={()=>window.open(mapsLink(ride.pickup_text), '_blank')}>Navigate</Button>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="text-sm text-slate-600 mb-2">Drop-off Stops</div>
              {ride.stops.length===0 ? <div className="text-sm text-slate-600">No stops added.</div> : (
                <div className="space-y-2">
                  {ride.stops.map(s => (
                    <div key={s.order_index} className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                      <div className="text-sm"><b>Stop {s.order_index+1}:</b> {s.dropoff_text}</div>
                      <Button variant="ghost" onClick={()=>window.open(mapsLink(s.dropoff_text), '_blank')}>Navigate</Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="grid md:grid-cols-3 gap-3">
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="text-xs text-slate-500">Time</div>
                <div className="font-semibold">{ride.time_iso}</div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="text-xs text-slate-500">Posted Price</div>
                <div className="font-semibold">{money(ride.posted_price)}</div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="text-xs text-slate-500">Bargain Price</div>
                <div className="font-semibold">{money(ride.bargain_price ?? ride.posted_price)}</div>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="font-bold">Bargaining</div>
              <div className="text-sm text-slate-600 mt-1">Ride confirms only when both sides confirm the final price.</div>
              <div className="flex flex-wrap items-end gap-3 mt-3">
                <div className="flex-1 min-w-[200px]">
                  <Label>New price</Label>
                  <Input type="number" step="0.5" value={bargainPrice} onChange={e=>setBargainPrice(parseFloat(e.target.value||'0'))} />
                </div>
                <Button variant="ghost" onClick={()=>setBargainPrice(p => Math.max(0, p-0.5))}>-</Button>
                <Button variant="ghost" onClick={()=>setBargainPrice(p => p+0.5)}>+</Button>
                <Button onClick={()=>doBargain(bargainPrice)}>Propose</Button>
                <Button variant="secondary" onClick={confirmPrice}>Confirm Price</Button>
              </div>
              <div className="text-xs text-slate-500 mt-2">
                Confirmed? Rider: {String(ride.rider_confirmed_price)} · Driver: {String(ride.driver_confirmed_price)}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="font-bold">Cancellation</div>
              <div className="grid md:grid-cols-[1fr_auto] gap-2 items-end mt-2">
                <div>
                  <Label>Reason (required)</Label>
                  <select className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                    value={cancelReason} onChange={e=>setCancelReason(e.target.value)}>
                    <option value="">Select reason…</option>
                    {reasons.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
                <Button variant="danger" onClick={cancelRide}>Cancel Ride</Button>
              </div>
            </div>

            {role === 'driver' && (
              <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
                <div className="font-bold">OTP Pickup</div>
                <div className="text-sm text-slate-600">Demo: Driver generates OTP and rider receives it. Driver must enter it to start ride.</div>
                <div className="flex flex-wrap gap-2 items-center">
                  <Button variant="ghost" onClick={generateOtp}>Generate OTP</Button>
                  <div className="text-sm">OTP: <b>{otp || '—'}</b></div>
                </div>
                <div className="grid md:grid-cols-[1fr_auto] gap-2 items-end">
                  <div>
                    <Label>Enter OTP</Label>
                    <Input value={otpInput} onChange={e=>setOtpInput(e.target.value)} placeholder="4 digits" />
                  </div>
                  <Button variant="secondary" onClick={verifyOtp}>Verify & Start</Button>
                </div>
                <div className="flex gap-2">
                  <Button onClick={completeRide} disabled={ride.status !== 'in_progress'}>Complete Ride</Button>
                  <div className="text-xs text-slate-500 self-center">Current: {ride.status}</div>
                </div>
              </div>
            )}

            {canJoin && (
              <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-2">
                <div className="font-bold">OTP (Rider)</div>
                <div className="text-sm text-slate-600">If driver generates OTP, you will see it here. Share it at pickup.</div>
                <div className="text-sm">OTP: <b>{otp || '—'}</b></div>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader><div className="font-bold">Chat</div></CardHeader>
            <CardContent className="space-y-3">
              <div className="max-h-[280px] overflow-auto space-y-2">
                {messages.length===0 ? <div className="text-sm text-slate-600">No messages yet.</div> : messages.map((m, idx) => (
                  <div key={idx} className="rounded-xl border border-slate-200 bg-slate-50 p-2 text-sm">
                    <div className="text-xs text-slate-500">{m.created_at}</div>
                    <div>{m.content}</div>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <Input value={chat} onChange={e=>setChat(e.target.value)} placeholder="Type a message…" />
                <Button onClick={sendChat}>Send</Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><div className="font-bold">Join Ride</div></CardHeader>
            <CardContent className="space-y-3">
              <div className="text-sm text-slate-600">Join requests show as pop-ups only. Driver sees join price; primary rider does not.</div>

              {canJoin && (
                <div className="space-y-2">
                  <Label>From</Label>
                  <Input value={joinForm.from_text} onChange={e=>setJoinForm(v=>({...v, from_text:e.target.value}))} />
                  <Label>To</Label>
                  <Input value={joinForm.to_text} onChange={e=>setJoinForm(v=>({...v, to_text:e.target.value}))} />
                  <Label>Price (min $8)</Label>
                  <Input type="number" step="0.5" value={joinForm.price} onChange={e=>setJoinForm(v=>({...v, price: parseFloat(e.target.value||'8')}))} />
                  <Button variant="secondary" onClick={requestJoin}>Request to Join</Button>
                </div>
              )}

              {(role === 'driver' || role === 'rider') && (
                <div className="rounded-2xl border border-slate-200 bg-white p-3">
                  <div className="font-semibold">Recent Join Requests (this ride)</div>
                  <div className="text-xs text-slate-500">Arrives via real-time popup.</div>
                  {joinRequests.length===0 ? <div className="text-sm text-slate-600 mt-2">No join requests yet.</div> : (
                    <div className="space-y-2 mt-2">
                      {joinRequests.map(j => (
                        <div key={j.id} className="rounded-xl border border-slate-200 bg-slate-50 p-2 text-sm">
                          <div className="text-xs text-slate-500">JoinReq #{j.id} · {j.created_at}</div>
                          <div><b>From:</b> {j.from_text}</div>
                          <div><b>To:</b> {j.to_text}</div>
                          <div><b>Price:</b> {role === 'driver' ? money(j.price) : <i>Hidden from primary rider</i>}</div>
                          <div className="flex gap-2 mt-2">
                            <Button variant="secondary" onClick={()=>decideJoin(j.id, true)}>Accept</Button>
                            <Button variant="danger" onClick={()=>decideJoin(j.id, false)}>Reject</Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
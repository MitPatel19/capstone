import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Check, Clock3, MapPin, MessageSquare, Navigation, Star, Users, X } from 'lucide-react'
import { api } from '../api'
import { DriverTopBar } from '../components/DriverTopBar'
import { mapsLink, money } from '../utils'
import { wsClient } from '../ws'

type Ride = {
  id: number
  pickup_text: string
  time_iso: string
  posted_price: number
  status: string
  bargain_price: number | null
  rider_name?: string
  rider_phone?: string
  rider_rating?: number
  first_dropoff_text?: string
  stops?: { dropoff_text: string; order_index: number }[]
}

type Offer = {
  id: number
  driver_id: number
  latest_price: number
  rider_confirmed_price: boolean
  driver_confirmed_price: boolean
  status: string
}

type JoinReq = {
  id: number
  from_text: string
  to_text: string
  price: number
  joiner_name?: string
  joiner_rating?: number
  status?: string
  driver_decision?: boolean | null
  rider_decision?: boolean | null
}

type Msg = { id: number; sender_id: number; content: string; created_at: string }

type RoutePoint = {
  sequence: number
  user_id: number
  user_name: string
  role: string
  point_type: 'pickup' | 'dropoff'
  location_text: string
}

function statusClass(status: string) {
  if (status === 'requested' || status === 'bargaining') return 'bg-amber-600 text-white'
  if (status === 'confirmed' || status === 'in_progress') return 'bg-emerald-600 text-white'
  if (status === 'completed') return 'bg-slate-900 text-white'
  return 'bg-slate-100 text-slate-900'
}

function formatTime12h(input: string) {
  const dt = new Date(input)
  if (Number.isNaN(dt.getTime())) return input || '-'
  return dt.toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })
}

function formatMsgTime(input: string) {
  const dt = new Date(input)
  if (Number.isNaN(dt.getTime())) return input || '-'
  return dt.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', hour12: true })
}

export default function DriverRideDetail() {
  const nav = useNavigate()
  const { id } = useParams()
  const rideId = Number(id)
  const [uid, setUid] = useState(-1)
  const [ride, setRide] = useState<Ride | null>(null)
  const [offers, setOffers] = useState<Offer[]>([])
  const [joinRequests, setJoinRequests] = useState<JoinReq[]>([])
  const [messages, setMessages] = useState<Msg[]>([])
  const [message, setMessage] = useState('')
  const [routePlan, setRoutePlan] = useState<RoutePoint[]>([])
  const [loading, setLoading] = useState(true)
  const [showJoinModal, setShowJoinModal] = useState(false)
  const [counterOffer, setCounterOffer] = useState(20)

  async function load() {
    setLoading(true)
    try {
      try {
        const me = await api.get('/auth/me')
        setUid(Number(me.data?.id ?? -1))
      } catch {
        setUid(-1)
      }
      const r = await api.get(`/rides/${rideId}`)
      setRide(r.data)
      const of = await api.get(`/rides/${rideId}/offers`)
      setOffers(of.data || [])
      const mine = (of.data || [])[0]
      setCounterOffer(mine?.latest_price ?? r.data.bargain_price ?? r.data.posted_price)
      try {
        const j = await api.get(`/rides/${rideId}/join_requests_recent`)
        setJoinRequests(j.data)
      } catch {
        setJoinRequests([])
      }
      try {
        const rp = await api.get(`/rides/${rideId}/route_plan`)
        setRoutePlan(rp.data || [])
      } catch {
        setRoutePlan([])
      }
      try {
        const m = await api.get(`/rides/${rideId}/messages`)
        setMessages(m.data || [])
      } catch {
        setMessages([])
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (rideId) load()
  }, [rideId])

  useEffect(() => {
    const unsub = wsClient.on((msg) => {
      if (msg?.type === 'chat_message' && msg.ride_id === rideId) {
        setMessages((prev) => [...prev, { id: Date.now(), sender_id: msg.sender_id, content: msg.content, created_at: msg.created_at }])
      }
      if (msg?.type === 'ride_update' && msg.ride_id === rideId) load()
      if (msg?.type === 'join_request' && msg?.join_request?.ride_id === rideId) load()
      if (msg?.type === 'join_decision_update') load()
    })
    return () => {
      void unsub()
    }
  }, [rideId])

  const isPending = useMemo(() => ride?.status === 'requested' || ride?.status === 'bargaining', [ride?.status])
  const canStartRide = useMemo(() => ride?.status === 'confirmed', [ride?.status])
  const myOffer = offers[0]
  const routeRows = useMemo(() => {
    if (!ride) return [] as RoutePoint[]
    if (routePlan.length > 0) return routePlan
    return [
      {
        sequence: 1,
        user_id: 0,
        user_name: ride.rider_name || 'Primary Rider',
        role: 'primary_rider',
        point_type: 'pickup' as const,
        location_text: ride.pickup_text,
      },
      {
        sequence: 2,
        user_id: 0,
        user_name: ride.rider_name || 'Primary Rider',
        role: 'primary_rider',
        point_type: 'dropoff' as const,
        location_text: ride.first_dropoff_text || 'Destination not set',
      },
    ]
  }, [ride, routePlan])

  async function acceptRide() {
    await api.post(`/rides/${rideId}/driver/accept`)
    await load()
  }

  async function rejectRide() {
    nav('/driver')
  }

  async function bargain() {
    await api.post(`/rides/${rideId}/bargain`, { new_price: counterOffer })
    await load()
  }

  async function confirmMyOffer() {
    await api.post(`/rides/${rideId}/confirm_price`, {})
    await load()
  }

  async function startRide() {
    const hasOtp = ride?.status === 'confirmed'
    if (!hasOtp) return
    await api.post(`/rides/${rideId}/otp/generate`)
    window.alert('OTP generated and sent to rider. Ask rider for the OTP and then verify.')
    await load()
  }

  async function verifyAndStartRide() {
    const otpInput = window.prompt('Enter OTP to start ride')
    if (!otpInput) return
    await api.post(`/rides/${rideId}/otp/verify`, { otp: otpInput })
    await load()
  }

  async function completeRide() {
    await api.post(`/rides/${rideId}/complete`)
    await load()
  }

  async function decideJoin(jrId: number, accept: boolean) {
    await api.post(`/rides/join_requests/${jrId}/driver_decide?accept=${accept}`)
    await load()
  }

  async function cancelRideAsDriver() {
    if (!ride) return
    if (ride.status === 'completed' || ride.status === 'cancelled') return
    const reason = window.prompt('Reason for cancellation?')
    if (!reason || !reason.trim()) return
    await api.post(`/rides/${rideId}/cancel`, { reason: reason.trim() })
    await load()
    nav('/driver')
  }

  async function handleSendMessage() {
    if (!message.trim()) return
    await api.post(`/rides/${rideId}/message`, { content: message.trim() })
    setMessage('')
  }

  if (loading || !ride) {
    return (
      <div className="min-h-screen bg-slate-100">
        <DriverTopBar />
        <main className="mx-auto w-full max-w-6xl px-4 py-8 text-base text-slate-600">Loading...</main>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <DriverTopBar />
      <main className="mx-auto w-full max-w-6xl space-y-6 px-4 py-8">
        <button className="inline-flex items-center gap-2 text-sm font-semibold hover:underline" onClick={() => nav('/driver')}>
          <ArrowLeft className="h-4 w-4" />
          Back to Dashboard
        </button>

        <section className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <article className="rounded-3xl border border-slate-300 bg-white p-5">
            <div className="flex items-start justify-between">
              <div>
                <h1 className="text-2xl font-black">Ride Request Details</h1>
                <p className="text-base text-slate-500">Ride ID: #{ride.id}</p>
              </div>
              <span className={`rounded-full px-3 py-1 text-sm font-bold capitalize ${statusClass(ride.status)}`}>{ride.status.split('_').join(' ')}</span>
            </div>

            <div className="mt-6 space-y-3">
              {routeRows.map((p) => (
                <div key={`${p.sequence}-${p.user_id}-${p.point_type}`} className="flex items-center justify-between">
                  <div className="flex items-start gap-3">
                    <MapPin className={`mt-0.5 h-5 w-5 ${p.point_type === 'pickup' ? 'text-emerald-600' : 'text-rose-500'}`} />
                    <div>
                      <div className="text-sm text-slate-600">
                        {p.user_name} - {p.point_type === 'pickup' ? 'Pickup' : 'Drop-off'}
                      </div>
                      <div className="text-xl font-semibold">{p.location_text}</div>
                    </div>
                  </div>
                  <button className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold hover:bg-slate-50" onClick={() => window.open(mapsLink(p.location_text), '_blank')}>
                    <Navigation className="h-4 w-4" />
                    Navigate
                  </button>
                </div>
              ))}
            </div>

            <div className="mt-6 grid gap-4 border-t border-slate-200 pt-6 sm:grid-cols-2">
              <div>
                <div className="text-sm text-slate-600">Time</div>
                <div className="mt-1 inline-flex items-center gap-2 text-xl font-semibold">
                  <Clock3 className="h-5 w-5 text-slate-500" />
                  {formatTime12h(ride.time_iso)}
                </div>
              </div>
              <div>
                <div className="text-sm text-slate-600">Offered Price</div>
                <div className="mt-1 text-3xl font-bold text-emerald-600">{money(ride.bargain_price ?? ride.posted_price)}</div>
              </div>
            </div>

            {isPending && (
              <div className="mt-6 border-t border-slate-200 pt-6">
                <div className="text-lg font-bold">Adjust Price (Bargain)</div>
                <div className="mt-3 flex items-center gap-4">
                  <button className="rounded-xl border border-slate-300 px-4 py-2 text-xl font-bold" onClick={() => setCounterOffer((v) => Math.max(0, v - 1))}>
                    -
                  </button>
                  <div>
                    <div className="text-3xl font-bold text-emerald-600">{money(counterOffer)}</div>
                    <div className="text-sm text-slate-500">Counter Offer</div>
                  </div>
                  <button className="rounded-xl border border-slate-300 px-4 py-2 text-xl font-bold" onClick={() => setCounterOffer((v) => v + 1)}>
                    +
                  </button>
                  <button className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white" onClick={bargain}>
                    Update
                  </button>
                  {myOffer && (
                    <button className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white" onClick={confirmMyOffer}>
                      Confirm Price
                    </button>
                  )}
                </div>
                {myOffer && (
                  <div className="mt-3 text-sm text-slate-600">
                    You: {myOffer.driver_confirmed_price ? 'confirmed' : 'not confirmed'} | Rider: {myOffer.rider_confirmed_price ? 'confirmed' : 'not confirmed'}
                  </div>
                )}
              </div>
            )}

            <button className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-300 px-4 py-3 text-sm font-semibold hover:bg-slate-50" onClick={() => setShowJoinModal(true)}>
              <Users className="h-5 w-5" />
              View Join Requests ({joinRequests.length})
            </button>

            <div className="mt-6 border-t border-slate-200 pt-6">
              {canStartRide && (
                <div className="grid gap-3">
                  <button className="w-full rounded-xl bg-slate-900 px-4 py-3 text-sm font-bold text-white hover:bg-slate-800" onClick={startRide}>
                    Generate OTP for Rider
                  </button>
                  <button className="w-full rounded-xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white hover:bg-emerald-700" onClick={verifyAndStartRide}>
                    Verify OTP & Start Ride
                  </button>
                </div>
              )}
              {ride.status === 'in_progress' && (
                <button className="w-full rounded-xl bg-brand-600 px-4 py-3 text-sm font-bold text-white hover:bg-brand-700" onClick={completeRide}>
                  Complete Ride
                </button>
              )}
            </div>
            </article>

            <article className="rounded-3xl border border-slate-300 bg-white p-5">
              <div className="flex items-center gap-2 text-2xl font-black">
                <MessageSquare className="h-5 w-5" />
                Chat with Rider
              </div>
              <div className="mt-4 space-y-4">
                <div className="h-64 space-y-3 overflow-y-auto rounded-lg border bg-slate-50 p-4">
                  {messages.length === 0 ? (
                    <div className="text-sm text-slate-500">No messages yet.</div>
                  ) : (
                    messages.map((m) => {
                      const mine = m.sender_id === uid
                      return (
                        <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                          <div className={`max-w-xs rounded-lg p-3 ${mine ? 'bg-brand-600 text-white' : 'border bg-white'}`}>
                            <p className="text-sm">{m.content}</p>
                            <p className={`mt-1 text-xs ${mine ? 'text-blue-100' : 'text-slate-500'}`}>{formatMsgTime(m.created_at)}</p>
                          </div>
                        </div>
                      )
                    })
                  )}
                </div>
                <div className="flex gap-2">
                  <textarea
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-200"
                    placeholder="Type your message..."
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    rows={2}
                  />
                  <button className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800" onClick={handleSendMessage}>
                    Send
                  </button>
                </div>
              </div>
            </article>
          </div>

          <div className="space-y-6">
            <article className="rounded-3xl border border-slate-300 bg-white p-5">
              <h2 className="text-2xl font-black">Rider Information</h2>
              <div className="mt-6 mx-auto flex h-28 w-28 items-center justify-center rounded-full bg-gradient-to-b from-blue-400 to-blue-600 text-4xl font-bold text-white">
                {(ride.rider_name || 'R')[0].toUpperCase()}
              </div>
              <div className="mt-4 text-center">
                <div className="text-xl font-black">{ride.rider_name || 'Rider'}</div>
                <div className="mt-1 inline-flex items-center gap-1 text-amber-500">
                  <Star className="h-5 w-5 fill-amber-500" />
                  <span className="text-xl font-semibold">{(ride.rider_rating ?? 0).toFixed(1)}</span>
                </div>
              </div>
              <div className="mt-6">
                <div className="text-sm text-slate-600">Phone</div>
                <div className="text-xl font-semibold">{ride.rider_phone || 'Not available'}</div>
              </div>
              <a href={`tel:${ride.rider_phone || ''}`} className="mt-6 inline-flex w-full items-center justify-center rounded-xl border border-slate-300 px-4 py-3 text-sm font-semibold hover:bg-slate-50">
                Call Rider
              </a>
            </article>

            {isPending && (
              <article className="rounded-3xl border border-slate-300 bg-white p-5">
                <h2 className="text-2xl font-black">Actions</h2>
                <div className="mt-6 space-y-3">
                  <button className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white hover:bg-emerald-700" onClick={acceptRide}>
                    <Check className="h-5 w-5" />
                    Accept Immediately
                  </button>
                  <button className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-rose-600 px-4 py-3 text-sm font-bold text-white hover:bg-rose-700" onClick={rejectRide}>
                    <X className="h-5 w-5" />
                    Reject Ride
                  </button>
                </div>
              </article>
            )}
            {ride.status !== 'completed' && ride.status !== 'cancelled' && (
              <article className="rounded-3xl border border-slate-300 bg-white p-5">
                <h2 className="text-2xl font-black">Actions</h2>
                <div className="mt-6 space-y-3">
                  <button className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-rose-600 px-4 py-3 text-sm font-bold text-white hover:bg-rose-700" onClick={cancelRideAsDriver}>
                    <X className="h-5 w-5" />
                    Cancel Ride
                  </button>
                </div>
              </article>
            )}
            {ride.status === 'completed' && (
              <article className="rounded-3xl border border-slate-300 bg-white p-5">
                <h2 className="text-2xl font-black">Actions</h2>
                <div className="mt-6 space-y-3">
                  <button className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-3 text-sm font-bold text-white hover:bg-brand-700" onClick={() => nav(`/feedback/${ride.id}`)}>
                    Give Feedback
                  </button>
                </div>
              </article>
            )}
          </div>
        </section>
      </main>

      {showJoinModal && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-2xl rounded-3xl bg-white p-5">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-2xl font-black">Join Requests</h3>
                <p className="text-base text-slate-500">Other riders wanting to join this ride</p>
              </div>
              <button className="text-3xl leading-none text-slate-500 hover:text-slate-900" onClick={() => setShowJoinModal(false)}>
                x
              </button>
            </div>

            <div className="mt-6 space-y-4">
              {joinRequests.length === 0 ? (
                <div className="rounded-2xl border border-slate-300 p-4 text-sm text-slate-600">No join requests yet.</div>
              ) : (
                joinRequests.map((jr) => (
                  <div key={jr.id} className="rounded-2xl border border-slate-300 p-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="text-xl font-bold">{jr.joiner_name || 'Rider'}</div>
                        <div className="text-sm text-slate-500">{jr.from_text}</div>
                        <div className="mt-1 inline-flex items-center gap-1 text-amber-500">
                          <Star className="h-4 w-4 fill-amber-500" />
                          <span className="text-sm font-semibold">{(jr.joiner_rating ?? 0).toFixed(1)}</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-3xl font-bold text-emerald-600">+{money(jr.price)}</div>
                        <div className="text-sm text-slate-500">Additional</div>
                      </div>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-3">
                      <button
                        className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-60"
                        onClick={() => decideJoin(jr.id, true)}
                        disabled={jr.driver_decision !== null || jr.status === 'accepted' || jr.status === 'rejected'}
                      >
                        Accept
                      </button>
                      <button
                        className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-bold hover:bg-slate-50 disabled:opacity-60"
                        onClick={() => decideJoin(jr.id, false)}
                        disabled={jr.driver_decision !== null || jr.status === 'accepted' || jr.status === 'rejected'}
                      >
                        Reject
                      </button>
                    </div>
                    <div className="mt-2 text-xs text-slate-600">
                      Driver: {jr.driver_decision === true ? 'accepted' : jr.driver_decision === false ? 'rejected' : 'pending'} | Rider: {jr.rider_decision === true ? 'accepted' : jr.rider_decision === false ? 'rejected' : 'pending'}
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="mt-6 flex justify-end">
              <button className="rounded-xl bg-slate-950 px-5 py-2 text-sm font-bold text-white" onClick={() => setShowJoinModal(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

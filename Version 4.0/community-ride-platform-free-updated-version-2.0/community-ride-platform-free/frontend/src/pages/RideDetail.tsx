import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Clock3, MapPin, MessageSquare, Navigation, Star, Users, X } from 'lucide-react'
import { api, getRole } from '../api'
import { mapsLink, money } from '../utils'
import { wsClient } from '../ws'
import { Button } from '../components/Button'
import { Card, CardContent, CardHeader } from '../components/Card'

type Ride = {
  id: number
  rider_id: number
  driver_id: number | null
  rider_name?: string
  pickup_text: string
  time_iso: string
  posted_price: number
  status: string
  bargain_price: number | null
  otp_verified: boolean
  otp_code?: string
  first_dropoff_text?: string
  driver_name?: string
  driver_phone?: string
  driver_rating?: number
  driver_vehicle?: string
  accepted_joiner_count?: number
  primary_rider_discount_total?: number
  primary_rider_net_price?: number
  driver_join_bonus_total?: number
  stops?: { dropoff_text: string; order_index: number }[]
}

type Msg = { id: number; sender_id: number; content: string; created_at: string }
type JoinReq = {
  id: number
  ride_id: number
  from_text: string
  to_text?: string
  joiner_name?: string
  joiner_rating?: number
  price?: number
  primary_rider_credit?: number
  driver_bonus?: number
  status?: string
  driver_decision?: boolean | null
  rider_decision?: boolean | null
}

type Offer = {
  id: number
  driver_id: number
  driver_name?: string
  driver_rating?: number
  latest_price: number
  rider_confirmed_price: boolean
  driver_confirmed_price: boolean
  status: string
}

type RoutePoint = {
  sequence: number
  user_id: number
  user_name: string
  role: string
  point_type: 'pickup' | 'dropoff'
  location_text: string
}

function statusClass(status: string) {
  if (status === 'confirmed') return 'bg-emerald-600 text-white'
  if (status === 'in_progress') return 'bg-brand-600 text-white'
  if (status === 'requested' || status === 'bargaining') return 'bg-amber-600 text-white'
  if (status === 'cancelled') return 'bg-rose-600 text-white'
  if (status === 'completed') return 'bg-slate-900 text-white'
  return 'bg-slate-100 text-slate-900'
}

function statusLabel(status: string) {
  if (status === 'confirmed') return 'Accepted'
  if (status === 'in_progress') return 'In Progress'
  return status.split('_').join(' ')
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

export default function RideDetail() {
  const { id } = useParams()
  const rideId = Number(id)
  const nav = useNavigate()
  const role = getRole()
  const [uid, setUid] = useState(-1)

  const [ride, setRide] = useState<Ride | null>(null)
  const [messages, setMessages] = useState<Msg[]>([])
  const [joinRequests, setJoinRequests] = useState<JoinReq[]>([])
  const [offers, setOffers] = useState<Offer[]>([])
  const [routePlan, setRoutePlan] = useState<RoutePoint[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  const [showCancelDialog, setShowCancelDialog] = useState(false)
  const [showJoinRequests, setShowJoinRequests] = useState(false)
  const [cancelReason, setCancelReason] = useState('')
  const [message, setMessage] = useState('')
  const [counterOffer, setCounterOffer] = useState(0)
  const [selectedDriverId, setSelectedDriverId] = useState<number | null>(null)
  const [joinFrom, setJoinFrom] = useState('')
  const [joinTo, setJoinTo] = useState('')
  const [joinPrice, setJoinPrice] = useState(8)
  const [alreadyJoined, setAlreadyJoined] = useState(false)

  const isPrimaryRider = useMemo(() => !!ride && role === 'rider' && ride.rider_id === uid, [ride, role, uid])
  const isJoinedRider = useMemo(() => !!ride && role === 'rider' && ride.rider_id !== uid && alreadyJoined, [ride, role, uid, alreadyJoined])
  const isOtherRiderView = useMemo(() => !!ride && role === 'rider' && ride.rider_id !== uid, [ride, role, uid])
  const currentOffer = useMemo(() => {
    if (!isPrimaryRider || offers.length === 0) return null
    return offers.find((of) => of.driver_id === selectedDriverId) ?? offers[0]
  }, [isPrimaryRider, offers, selectedDriverId])
  const currentPrice = useMemo(() => {
    if (!ride) return 0
    if (isPrimaryRider && ride.status !== 'requested' && ride.status !== 'bargaining') {
      return ride.primary_rider_net_price ?? (ride.bargain_price ?? ride.posted_price)
    }
    if (currentOffer) return currentOffer.latest_price
    return ride.bargain_price ?? ride.posted_price
  }, [ride, currentOffer, isPrimaryRider])
  const canChat = useMemo(() => isPrimaryRider || alreadyJoined, [isPrimaryRider, alreadyJoined])
  const routeRows = useMemo(() => {
    if (!ride) return [] as RoutePoint[]
    if (routePlan.length > 0) return routePlan
    return [
      {
        sequence: 1,
        user_id: ride.rider_id,
        user_name: ride.rider_name || 'Primary Rider',
        role: 'primary_rider',
        point_type: 'pickup' as const,
        location_text: ride.pickup_text,
      },
      {
        sequence: 2,
        user_id: ride.rider_id,
        user_name: ride.rider_name || 'Primary Rider',
        role: 'primary_rider',
        point_type: 'dropoff' as const,
        location_text: ride.first_dropoff_text || 'Destination not set',
      },
    ]
  }, [ride, routePlan])

  async function load() {
    setLoading(true)
    setErr(null)
    try {
      let meId = -1
      try {
        const me = await api.get('/auth/me')
        meId = Number(me.data?.id ?? -1)
        setUid(meId)
      } catch {
        setUid(-1)
      }
      const r = await api.get(`/rides/${rideId}`)
      setRide(r.data)
      const isPrimary = role === 'rider' && Number(r.data?.rider_id) === meId
      if (isPrimary) {
        const of = await api.get(`/rides/${rideId}/offers`)
        setOffers(of.data || [])
        const firstOffer = (of.data || [])[0]
        setSelectedDriverId(firstOffer?.driver_id ?? null)
        setCounterOffer(Number(firstOffer?.latest_price ?? r.data.bargain_price ?? r.data.posted_price ?? 0))
      } else {
        setOffers([])
        setSelectedDriverId(null)
        setCounterOffer(Number(r.data.bargain_price ?? r.data.posted_price ?? 0))
      }
      try {
        const m = await api.get(`/rides/${rideId}/messages`)
        setMessages(m.data)
      } catch {
        setMessages([])
      }
      try {
        const jr = await api.get(`/rides/${rideId}/join_requests_recent`)
        setJoinRequests(jr.data)
      } catch {
        setJoinRequests([])
      }
      if (role === 'rider' && Number(r.data?.rider_id) !== meId) {
        try {
          const mine = await api.get(`/rides/${rideId}/my_join_request`)
          setAlreadyJoined(!!mine.data)
        } catch {
          setAlreadyJoined(false)
        }
      } else {
        setAlreadyJoined(false)
      }
      try {
        const rp = await api.get(`/rides/${rideId}/route_plan`)
        setRoutePlan(rp.data || [])
      } catch {
        setRoutePlan([])
      }
    } catch (e: any) {
      setErr(e?.response?.data?.detail ?? 'Failed to load ride details')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (role === 'driver') {
      nav(`/driver/ride/${rideId}`, { replace: true })
      return
    }
    if (rideId) load()
  }, [rideId, role, nav])

  useEffect(() => {
    const unsub = wsClient.on((msg) => {
      if (msg?.type === 'chat_message' && msg.ride_id === rideId) {
        setMessages((prev) => [...prev, { id: Date.now(), sender_id: msg.sender_id, content: msg.content, created_at: msg.created_at }])
      }
      if (msg?.type === 'ride_update' && msg.ride_id === rideId) load()
      if (msg?.type === 'join_request' && msg.join_request?.ride_id === rideId) load()
      if (msg?.type === 'otp_generated' && msg.ride_id === rideId) load()
      if (msg?.type === 'join_decision_update') load()
    })
    return () => {
      void unsub()
    }
  }, [rideId])

  async function handleCancelRide() {
    if (!cancelReason.trim()) return
    await api.post(`/rides/${rideId}/cancel`, { reason: cancelReason.trim() })
    setShowCancelDialog(false)
    nav('/rider')
  }

  async function handleSendMessage() {
    if (!message.trim()) return
    if (!canChat) return
    await api.post(`/rides/${rideId}/message`, { content: message.trim() })
    setMessage('')
  }

  async function handleUpdateBargain() {
    if (!selectedDriverId) return
    await api.post(`/rides/${rideId}/bargain`, { new_price: counterOffer, driver_id: selectedDriverId })
    await load()
  }

  async function handleConfirmPrice() {
    if (!selectedDriverId) return
    await api.post(`/rides/${rideId}/confirm_price`, { driver_id: selectedDriverId })
    await load()
  }

  async function handleJoinRide() {
    await api.post(`/rides/${rideId}/join`, { from_text: joinFrom, to_text: joinTo, price: joinPrice })
    setJoinFrom('')
    setJoinTo('')
    setJoinPrice(8)
    await load()
  }

  async function handleRiderJoinDecision(jrId: number, accept: boolean) {
    await api.post(`/rides/join_requests/${jrId}/rider_decide?accept=${accept}`)
    await load()
  }

  async function handleLeaveJoinedRide() {
    const ok = window.confirm('Cancel this joined ride for yourself?')
    if (!ok) return
    await api.post(`/rides/${rideId}/leave`)
    nav('/rider')
  }

  if (loading) return <div className="text-base text-slate-600">Loading...</div>
  if (err) return <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{err}</div>
  if (!ride) return null

  return (
    <div className="space-y-6">
      <div className="mb-2">
        <Button variant="ghost" onClick={() => nav('/rider')}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Dashboard
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-2xl font-black">Ride Details</div>
                  <div className="text-base text-slate-500">Ride ID: #{ride.id}</div>
                </div>
                <span className={`rounded-full px-3 py-1 text-sm font-bold capitalize ${statusClass(ride.status)}`}>{statusLabel(ride.status)}</span>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                {routeRows.map((p) => (
                  <div key={`${p.sequence}-${p.user_id}-${p.point_type}`} className="flex items-start gap-3">
                    <MapPin className={`mt-1 h-5 w-5 ${p.point_type === 'pickup' ? 'text-emerald-600' : 'text-rose-600'}`} />
                    <div>
                      <p className="text-sm text-slate-600">
                        {p.user_name} - {p.point_type === 'pickup' ? 'Pickup' : 'Drop-off'}
                      </p>
                      <p className="text-xl font-semibold">{p.location_text}</p>
                    </div>
                    <Button variant="ghost" className="ml-auto" onClick={() => window.open(mapsLink(p.location_text), '_blank')}>
                      <Navigation className="mr-2 h-4 w-4" />
                      Navigate
                    </Button>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-4 border-t pt-4">
                <div>
                  <p className="flex items-center gap-2 text-sm text-slate-600">
                    <Clock3 className="h-4 w-4" />
                    Time
                  </p>
                  <p className="text-xl font-semibold">{formatTime12h(ride.time_iso)}</p>
                </div>
                <div>
                  <p className="text-sm text-slate-600">{isPrimaryRider ? 'Your Fare' : 'Price'}</p>
                  <p className="text-3xl font-bold text-brand-600">{money(currentPrice)}</p>
                </div>
              </div>

              {isPrimaryRider && (ride.primary_rider_discount_total ?? 0) > 0 && (
                <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
                  <div className="text-sm font-semibold text-blue-900">Shared ride reward active</div>
                  <div className="mt-1 text-sm text-blue-800">
                    Your fare dropped by {money(ride.primary_rider_discount_total ?? 0)} because {ride.accepted_joiner_count ?? 0} rider{(ride.accepted_joiner_count ?? 0) === 1 ? '' : 's'} joined this trip.
                  </div>
                </div>
              )}

              {isPrimaryRider && ride.status === 'confirmed' && !ride.otp_verified && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                  <div className="text-sm text-emerald-800">Give this OTP to driver to start ride</div>
                  <div className="mt-1 text-3xl font-black tracking-widest text-emerald-700">{ride.otp_code || 'Waiting for driver to generate OTP...'}</div>
                </div>
              )}

              {isPrimaryRider && offers.length > 0 && (ride.status === 'requested' || ride.status === 'bargaining') && (
                <div className="border-t pt-4">
                  <div className="mb-3 text-2xl font-black">Driver Offers</div>
                  <div className="space-y-2">
                    {offers.map((of) => (
                      <button
                        type="button"
                        key={of.id}
                        className={`w-full rounded-xl border p-3 text-left ${selectedDriverId === of.driver_id ? 'border-slate-900 bg-slate-50' : 'border-slate-200 bg-white'}`}
                        onClick={() => {
                          setSelectedDriverId(of.driver_id)
                          setCounterOffer(of.latest_price)
                        }}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="font-semibold">{of.driver_name || `Driver #${of.driver_id}`}</div>
                            <div className="text-sm text-slate-600">
                              Driver: {of.driver_confirmed_price ? 'confirmed' : 'pending'} | You: {of.rider_confirmed_price ? 'confirmed' : 'pending'}
                            </div>
                          </div>
                          <div className="text-xl font-bold text-emerald-600">{money(of.latest_price)}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {isPrimaryRider && (ride.status === 'requested' || ride.status === 'bargaining') && (
                <div className="border-t pt-4">
                  <div className="text-2xl font-black">Adjust Price (Bargain)</div>
                  <div className="mt-4 flex flex-wrap items-center gap-4">
                    <button type="button" className="h-12 w-12 rounded-xl border border-slate-300 text-2xl font-bold" onClick={() => setCounterOffer((v) => Math.max(0, v - 1))}>
                      -
                    </button>
                    <div>
                      <div className="text-3xl font-black text-emerald-600">{money(counterOffer)}</div>
                      <div className="text-sm text-slate-500">Counter Offer</div>
                    </div>
                    <button type="button" className="h-12 w-12 rounded-xl border border-slate-300 text-2xl font-bold" onClick={() => setCounterOffer((v) => v + 1)}>
                      +
                    </button>
                    <button type="button" className="rounded-xl bg-slate-900 px-5 py-3 text-sm font-bold text-white hover:bg-slate-800" onClick={handleUpdateBargain}>
                      Update
                    </button>
                    <button type="button" className="rounded-xl bg-emerald-600 px-5 py-3 text-sm font-bold text-white hover:bg-emerald-700" onClick={handleConfirmPrice}>
                      Confirm Price
                    </button>
                  </div>
                </div>
              )}

              {isOtherRiderView && (ride.status === 'confirmed' || ride.status === 'in_progress') && !alreadyJoined && (
                <div className="border-t pt-4">
                <div className="text-2xl font-black">Join This Ride</div>
                  <div className="mt-2 text-sm text-slate-600">Minimum join price is $8. Your amount is split automatically between the driver bonus and the main rider's fare credit.</div>
                  <div className="mt-3 grid gap-3">
                    <input
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-200"
                      placeholder="Your pickup location"
                      value={joinFrom}
                      onChange={(e) => setJoinFrom(e.target.value)}
                    />
                    <input
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-200"
                      placeholder="Your dropoff location"
                      value={joinTo}
                      onChange={(e) => setJoinTo(e.target.value)}
                    />
                    <input
                      type="number"
                      min={8}
                      step={0.5}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-200"
                      value={joinPrice}
                      onChange={(e) => setJoinPrice(Number(e.target.value || 8))}
                    />
                    <Button onClick={handleJoinRide}>Send Join Request</Button>
                  </div>
                </div>
              )}
              {isOtherRiderView && (ride.status === 'confirmed' || ride.status === 'in_progress') && alreadyJoined && (
                <div className="border-t pt-4">
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
                    You already joined this ride.
                  </div>
                </div>
              )}

              {isPrimaryRider && (
                <div className="border-t pt-4">
                  <Button variant="ghost" className="w-full" onClick={() => setShowJoinRequests(true)}>
                    <Users className="mr-2 h-4 w-4" />
                    View Join Requests ({joinRequests.length})
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2 text-2xl font-black">
                <MessageSquare className="h-5 w-5" />
                Chat with Driver
              </div>
            </CardHeader>
            <CardContent>
              {!canChat ? (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">Chat is available after your join request is accepted.</div>
              ) : (
                <div className="space-y-4">
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
                  <Button onClick={handleSendMessage}>Send</Button>
                </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <div className="text-2xl font-black">Driver Information</div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="text-center">
                <div className="mx-auto mb-3 flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-b from-blue-400 to-blue-600 text-4xl font-black text-white">
                  {(ride.driver_name || 'D')[0].toUpperCase()}
                </div>
                <h3 className="text-xl font-black">{ride.driver_name || 'Waiting for driver'}</h3>
                <div className="mt-1 flex items-center justify-center gap-1 text-amber-500">
                  <Star className="h-4 w-4 fill-amber-500" />
                  <span className="font-medium">{(ride.driver_rating ?? 0).toFixed(1)}</span>
                </div>
              </div>
              <div className="space-y-2 text-sm">
                <div>
                  <p className="text-slate-600">Vehicle</p>
                  <p className="font-medium">{ride.driver_vehicle || 'Not available'}</p>
                </div>
                <div>
                  <p className="text-slate-600">Phone</p>
                  <p className="font-medium">{ride.driver_phone || 'Not available'}</p>
                </div>
              </div>
              <Button className="w-full" variant="ghost" onClick={() => (ride.driver_phone ? (window.location.href = `tel:${ride.driver_phone}`) : null)}>
                Call Driver
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="text-2xl font-black">Actions</div>
            </CardHeader>
            <CardContent className="space-y-3">
              {ride.status === 'completed' && (
                <Button className="w-full" onClick={() => nav(`/feedback/${ride.id}`)}>
                  Give Feedback
                </Button>
              )}
              {isPrimaryRider && (
                <Button variant="danger" className="w-full" onClick={() => setShowCancelDialog(true)}>
                  <X className="mr-2 h-4 w-4" />
                  Cancel Ride
                </Button>
              )}
              {isJoinedRider && ride.status !== 'completed' && ride.status !== 'cancelled' && (
                <Button variant="danger" className="w-full" onClick={handleLeaveJoinedRide}>
                  <X className="mr-2 h-4 w-4" />
                  Cancel Ride
                </Button>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {showCancelDialog && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-5">
            <div className="text-xl font-black">Cancel Ride</div>
            <div className="mt-1 text-sm text-slate-600">Please provide a reason for cancelling this ride</div>
            <textarea
              className="mt-4 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-200"
              placeholder="Reason for cancellation..."
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              rows={4}
            />
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setShowCancelDialog(false)}>
                Keep Ride
              </Button>
              <Button variant="danger" onClick={handleCancelRide}>
                Cancel Ride
              </Button>
            </div>
          </div>
        </div>
      )}

      {showJoinRequests && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-5">
            <div className="flex items-start justify-between">
              <div>
                <div className="text-2xl font-black">Join Requests</div>
                <div className="text-base text-slate-500">Other riders wanting to join your ride</div>
              </div>
              <button className="text-3xl leading-none text-slate-500 hover:text-slate-900" onClick={() => setShowJoinRequests(false)}>
                x
              </button>
            </div>

            <div className="mt-4 space-y-3">
              {joinRequests.map((jr) => (
                <Card key={jr.id}>
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">{jr.joiner_name || 'Rider'}</p>
                        <p className="text-sm text-slate-600">{jr.from_text}</p>
                        <div className="mt-1 flex items-center gap-1 text-amber-500">
                          <Star className="h-3 w-3 fill-amber-500" />
                          <span className="text-xs">{(jr.joiner_rating ?? 0).toFixed(1)}</span>
                        </div>
                      </div>
                    </div>
                    <p className="mt-2 text-xs italic text-slate-500">(Price hidden from rider)</p>
                    <p className="mt-2 text-sm text-blue-700">If accepted, this rider saves {money(jr.primary_rider_credit ?? 0)} on their fare.</p>
                    {isPrimaryRider && (
                      <div className="mt-3 grid grid-cols-2 gap-3">
                        <Button onClick={() => handleRiderJoinDecision(jr.id, true)} disabled={jr.rider_decision !== null || jr.status === 'accepted' || jr.status === 'rejected'}>
                          Accept
                        </Button>
                        <Button variant="ghost" onClick={() => handleRiderJoinDecision(jr.id, false)} disabled={jr.rider_decision !== null || jr.status === 'accepted' || jr.status === 'rejected'}>
                          Reject
                        </Button>
                      </div>
                    )}
                    {isPrimaryRider && (
                      <div className="mt-2 text-xs text-slate-600">
                        Driver: {jr.driver_decision === true ? 'accepted' : jr.driver_decision === false ? 'rejected' : 'pending'} | You: {jr.rider_decision === true ? 'accepted' : jr.rider_decision === false ? 'rejected' : 'pending'}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
              {joinRequests.length === 0 && <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">No join requests yet.</div>}
            </div>
            <div className="mt-4 flex justify-end">
              <Button onClick={() => setShowJoinRequests(false)}>Close</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

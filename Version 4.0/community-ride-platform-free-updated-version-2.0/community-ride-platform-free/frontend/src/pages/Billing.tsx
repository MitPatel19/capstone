import React, { useEffect, useMemo, useState } from 'react'
import { CalendarDays } from 'lucide-react'
import { api, getRole } from '../api'
import { DriverTopBar } from '../components/DriverTopBar'
import { money } from '../utils'

type Bill = { id: number; month: string; total_due: number; is_paid: boolean; items: { ride_id: number; description: string; amount: number }[] }
type Summary = { month: string; fee_per_ride: number; completed_as_rider: number; completed_as_driver: number; total_due: number }
type Ride = {
  id: number
  rider_id: number
  time_iso: string
  pickup_text: string
  first_dropoff_text?: string
  posted_price: number
  bargain_price?: number | null
  status: string
  display_pickup_text?: string
  display_dropoff_text?: string
}
type Me = { id: number }

function formatDate(iso: string) {
  if (!iso) return '-'
  const dt = new Date(iso)
  if (Number.isNaN(dt.getTime())) return iso
  return dt.toISOString().slice(0, 10)
}

export default function Billing() {
  const role = getRole()
  const [bill, setBill] = useState<Bill | null>(null)
  const [history, setHistory] = useState<Bill[]>([])
  const [summary, setSummary] = useState<Summary | null>(null)
  const [completedRides, setCompletedRides] = useState<Ride[]>([])

  async function load() {
    const [b, h, s, rides, me] = await Promise.all([api.get('/billing/me'), api.get('/billing/history'), api.get('/billing/summary'), api.get('/rides/me'), api.get('/auth/me')])
    setBill(b.data)
    setHistory(h.data)
    setSummary(s.data)
    const completed = (rides.data as Ride[]).filter((r) => r.status === 'completed')
    const uid = Number((me.data as Me).id ?? -1)
    if (role === 'rider' && uid > 0) {
      const joinedRows = await Promise.all(completed.filter((r) => r.rider_id !== uid).map(async (r) => {
        try {
          const jr = await api.get(`/rides/${r.id}/my_join_request`)
          if (!jr.data) return null
          return { rideId: r.id, from: jr.data?.from_text || '', to: jr.data?.to_text || '' }
        } catch {
          return null
        }
      }))
      const byRideId = new Map(joinedRows.filter((x): x is { rideId: number; from: string; to: string } => !!x).map((x) => [x.rideId, x]))
      setCompletedRides(
        completed.flatMap((r) => {
          if (r.rider_id === uid) {
            return [{ ...r, display_pickup_text: r.pickup_text, display_dropoff_text: r.first_dropoff_text || 'Destination' }]
          }
          const jr = byRideId.get(r.id)
          if (!jr || !jr.from || !jr.to) {
            return []
          }
          return [{ ...r, display_pickup_text: jr.from, display_dropoff_text: jr.to }]
        })
      )
      return
    }
    setCompletedRides(completed.map((r) => ({ ...r, display_pickup_text: r.pickup_text, display_dropoff_text: r.first_dropoff_text || 'Destination' })))
  }

  useEffect(() => {
    load()
  }, [])

  async function pay(id: number) {
    await api.post(`/billing/${id}/pay`)
    await load()
    window.location.href = '/payment-confirmation'
  }

  const gross = useMemo(() => completedRides.reduce((sum, r) => sum + (r.bargain_price ?? r.posted_price), 0), [completedRides])
  const platformFees = useMemo(() => (summary?.fee_per_ride ?? 0) * completedRides.length, [completedRides.length, summary?.fee_per_ride])
  const net = useMemo(() => gross - platformFees, [gross, platformFees])

  if (role === 'driver') {
    return (
      <div className="min-h-screen bg-slate-100 text-slate-900">
        <DriverTopBar />
        <main className="mx-auto w-full max-w-6xl space-y-6 px-4 py-8">
          <section className="grid gap-6 lg:grid-cols-3">
            <article className="rounded-3xl border border-slate-300 bg-white p-5 lg:col-span-2">
              <h1 className="text-2xl font-black">Billing & Payments</h1>
              <p className="mt-2 text-base text-slate-500">Monthly usage summary for {summary?.month || 'current month'}</p>

              <div className="mt-6 overflow-x-auto">
                <table className="min-w-full text-left">
                  <thead>
                    <tr className="border-b border-slate-200 text-sm font-bold">
                      <th className="px-3 py-3">Date</th>
                      <th className="px-3 py-3">Ride</th>
                      <th className="px-3 py-3">Amount</th>
                      <th className="px-3 py-3">Platform Fee</th>
                    </tr>
                  </thead>
                  <tbody>
                    {completedRides.map((r) => (
                      <tr key={r.id} className="border-b border-slate-200 text-sm">
                        <td className="px-3 py-3">
                          <div className="inline-flex items-center gap-2">
                            <CalendarDays className="h-4 w-4 text-slate-500" />
                            {r.time_iso}
                          </div>
                        </td>
                        <td className="px-3 py-3">{`${r.display_pickup_text || r.pickup_text} to ${r.display_dropoff_text || r.first_dropoff_text || 'Destination'}`}</td>
                        <td className="px-3 py-3">{money(r.bargain_price ?? r.posted_price)}</td>
                        <td className="px-3 py-3">{money(summary?.fee_per_ride ?? 0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-6 border-t border-slate-200 pt-4 text-sm">
                <div className="flex items-center justify-between py-1">
                  <span className="text-slate-600">Subtotal (Rides)</span>
                  <span className="font-semibold">{money(gross)}</span>
                </div>
                <div className="flex items-center justify-between py-1">
                  <span className="text-slate-600">Platform Fees</span>
                  <span className="font-semibold">-{money(platformFees)}</span>
                </div>
                <div className="mt-2 flex items-center justify-between border-t border-slate-200 pt-3 text-2xl font-black">
                  <span>Total Earnings</span>
                  <span className="text-emerald-600">{money(net)}</span>
                </div>
              </div>
            </article>

            <div className="space-y-6">
              <article className="rounded-3xl border border-slate-300 bg-white p-5">
                <h2 className="text-2xl font-black">Payment Summary</h2>
                <div className="mt-4 rounded-2xl bg-gradient-to-b from-brand-500 to-brand-700 p-6 text-white">
                  <div className="text-base">Total Earnings</div>
                  <div className="mt-2 text-3xl font-black">{money(net)}</div>
                  <div className="mt-2 text-sm opacity-90">{summary?.month || ''}</div>
                </div>
                <button className="mt-4 w-full rounded-xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white hover:bg-emerald-700">Request Payout</button>
                <p className="mt-3 text-xs text-slate-500">Payouts processed within 2-3 business days</p>
              </article>

              <article className="rounded-3xl border border-slate-300 bg-white p-5">
                <h2 className="text-2xl font-black">Payment History</h2>
                <div className="mt-4 space-y-3">
                  {history.map((h) => (
                    <div key={h.id} className="flex items-center justify-between text-sm">
                      <span>{h.month}</span>
                      <span className="rounded-full border border-slate-300 px-3 py-1 font-semibold">{h.is_paid ? 'Paid' : 'Unpaid'}</span>
                    </div>
                  ))}
                </div>
              </article>
            </div>
          </section>
        </main>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <section className="grid gap-6 lg:grid-cols-3">
        <article className="rounded-3xl border border-slate-300 bg-white p-5 lg:col-span-2">
          <h1 className="text-2xl font-black">Billing & Payments</h1>
          <p className="mt-2 text-base text-slate-500">Monthly usage summary for {summary?.month || 'current month'}</p>

          <div className="mt-6 overflow-x-auto">
            <table className="min-w-full text-left">
              <thead>
                <tr className="border-b border-slate-200 text-sm font-bold">
                  <th className="px-3 py-3">Date</th>
                  <th className="px-3 py-3">Ride</th>
                  <th className="px-3 py-3">Amount</th>
                  <th className="px-3 py-3">Platform Fee</th>
                </tr>
              </thead>
              <tbody>
                {completedRides.map((r) => (
                  <tr key={r.id} className="border-b border-slate-200 text-sm">
                    <td className="px-3 py-3">
                      <div className="inline-flex items-center gap-2">
                        <CalendarDays className="h-4 w-4 text-slate-500" />
                        {formatDate(r.time_iso)}
                      </div>
                    </td>
                    <td className="px-3 py-3">{`${r.display_pickup_text || r.pickup_text} to ${r.display_dropoff_text || r.first_dropoff_text || 'Destination'}`}</td>
                    <td className="px-3 py-3">{money(r.bargain_price ?? r.posted_price)}</td>
                    <td className="px-3 py-3">{money(summary?.fee_per_ride ?? 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-6 border-t border-slate-200 pt-4 text-sm">
            <div className="flex items-center justify-between py-1">
              <span className="text-slate-600">Subtotal (Rides)</span>
              <span className="font-semibold">{money(gross)}</span>
            </div>
            <div className="flex items-center justify-between py-1">
              <span className="text-slate-600">Platform Fees</span>
              <span className="font-semibold">+{money(platformFees)}</span>
            </div>
            <div className="mt-2 flex items-center justify-between border-t border-slate-200 pt-3 text-2xl font-black">
              <span>Total Due</span>
              <span className="text-emerald-600">{money(gross + platformFees)}</span>
            </div>
          </div>
        </article>

        <div className="space-y-6">
          <article className="rounded-3xl border border-slate-300 bg-white p-5">
            <h2 className="text-2xl font-black">Payment Summary</h2>
            <div className="mt-4 rounded-2xl bg-gradient-to-b from-brand-500 to-brand-700 p-6 text-white">
              <div className="text-base">Total Due</div>
              <div className="mt-2 text-5xl font-black">{money(gross + platformFees)}</div>
              <div className="mt-2 text-sm opacity-90">{summary?.month || ''}</div>
            </div>
            <button
              className="mt-4 w-full rounded-xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-60"
              onClick={() => bill && pay(bill.id)}
              disabled={!bill || bill.is_paid || bill.total_due <= 0}
            >
              {bill?.is_paid ? 'Paid' : 'Pay Now'}
            </button>
            <p className="mt-3 text-xs text-slate-500">Secure payment powered by Stripe</p>
          </article>

          <article className="rounded-3xl border border-slate-300 bg-white p-5">
            <h2 className="text-2xl font-black">Payment History</h2>
            <div className="mt-4 space-y-3">
              {history.map((h) => (
                <div key={h.id} className="flex items-center justify-between text-sm">
                  <span>{h.month}</span>
                  <span className="rounded-full border border-slate-300 px-3 py-1 font-semibold">{h.is_paid ? 'Paid' : 'Unpaid'}</span>
                </div>
              ))}
            </div>
          </article>
        </div>
      </section>
    </div>
  )
}

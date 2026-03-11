import React, { useEffect, useState } from 'react'
import { api } from '../api'
import { Card, CardContent, CardHeader } from '../components/Card'
import { Button } from '../components/Button'
import { money } from '../utils'

type Bill = { id:number; month:string; total_due:number; is_paid:boolean; items:{ride_id:number; description:string; amount:number}[] }
type Summary = { month:string; fee_per_ride:number; completed_as_rider:number; completed_as_driver:number; total_due:number }

function MiniStat({ label, value }: {label:string; value:React.ReactNode}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="text-2xl font-black mt-1">{value}</div>
    </div>
  )
}

export default function Billing() {
  const [bill, setBill] = useState<Bill|null>(null)
  const [history, setHistory] = useState<Bill[]>([])
  const [summary, setSummary] = useState<Summary|null>(null)
  const [loading, setLoading] = useState(true)

  async function load(){
    setLoading(true)
    const [b, h, s] = await Promise.all([
      api.get('/billing/me'),
      api.get('/billing/history'),
      api.get('/billing/summary'),
    ])
    setBill(b.data)
    setHistory(h.data)
    setSummary(s.data)
    setLoading(false)
  }
  useEffect(()=>{ load() }, [])

  async function pay(id: number){
    await api.post(`/billing/${id}/pay`)
    await load()
    window.location.href = '/payment-confirmation'
  }

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <div className="text-3xl font-black">Billing</div>
          <div className="text-sm text-slate-600">Monthly in-app bill (free demo) — no automatic Stripe charge yet.</div>
        </div>
        <Button variant="ghost" onClick={load}>Refresh</Button>
      </div>

      <div className="grid md:grid-cols-4 gap-3">
        <MiniStat label="Month" value={summary?.month ?? '—'} />
        <MiniStat label="Platform fee (per ride)" value={money(summary?.fee_per_ride ?? 0)} />
        <MiniStat label="Completed rides (this month)" value={(summary?.completed_as_rider ?? 0) + (summary?.completed_as_driver ?? 0)} />
        <MiniStat label="Estimated total due" value={money(summary?.total_due ?? 0)} />
      </div>

      <Card>
        <CardHeader><div className="font-bold">Current Month Breakdown</div></CardHeader>
        <CardContent>
          {loading || !bill ? <div className="text-sm text-slate-600">Loading…</div> : (
            <div className="space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                  <div className="text-sm text-slate-600">Month</div>
                  <div className="font-black">{bill.month}</div>
                </div>
                <div className="text-right">
                  <div className="text-sm text-slate-600">Total due</div>
                  <div className="text-2xl font-black">{money(bill.total_due)}</div>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="font-semibold">Line items</div>
                {bill.items.length===0 ? (
                  <div className="text-sm text-slate-600 mt-2">No charges yet. Complete a ride to see usage-based fees here.</div>
                ) : (
                  <div className="mt-2 space-y-2">
                    {bill.items.map((it, idx) => (
                      <div key={idx} className="flex items-center justify-between text-sm border-b border-slate-100 pb-2">
                        <div>{it.description}</div>
                        <div className="font-semibold">{money(it.amount)}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-3 flex-wrap">
                <Button onClick={()=>pay(bill.id)} disabled={bill.is_paid || bill.total_due<=0}>
                  {bill.is_paid ? 'Paid ✅' : 'Pay Now (Stripe Placeholder)'}
                </Button>
                <div className="text-xs text-slate-500">
                  For the capstone demo: clicking Pay Now marks the bill as paid and shows a confirmation page.
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><div className="font-bold">Billing History</div></CardHeader>
        <CardContent>
          {loading ? <div className="text-sm text-slate-600">Loading…</div> : history.length===0 ? (
            <div className="text-sm text-slate-600">No history yet.</div>
          ) : (
            <div className="space-y-2">
              {history.map(h => (
                <div key={h.id} className="rounded-2xl border border-slate-200 bg-white p-4 flex items-center justify-between">
                  <div>
                    <div className="font-semibold">{h.month}</div>
                    <div className="text-xs text-slate-500">{h.is_paid ? 'Paid' : 'Unpaid'}</div>
                  </div>
                  <div className="font-black">{money(h.total_due)}</div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

import React, { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { api } from '../api'
import { Card, CardContent, CardHeader } from '../components/Card'
import { Button } from '../components/Button'
import { money } from '../utils'

type Bill = {
  id: number
  label?: string
  month: string
  total_due: number
  status: string
  paid_at?: string | null
}

function formatDate(iso?: string | null) {
  if (!iso) return '-'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toISOString().slice(0, 10)
}

export default function PaymentConfirmation() {
  const nav = useNavigate()
  const [params] = useSearchParams()
  const [bill, setBill] = useState<Bill | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    async function confirm() {
      const sessionId = params.get('session_id')
      if (!sessionId) {
        setErr('Stripe session details were not found in the URL.')
        setLoading(false)
        return
      }
      try {
        const res = await api.get('/billing/checkout/confirm', { params: { session_id: sessionId } })
        setBill(res.data as Bill)
      } catch (error: any) {
        setErr(error?.response?.data?.detail ?? 'Unable to confirm the Stripe payment yet.')
      } finally {
        setLoading(false)
      }
    }
    confirm()
  }, [params])

  return (
    <Card>
      <CardHeader>
        <div className="text-2xl font-black">Stripe Payment Confirmation</div>
        <div className="mt-1 text-sm text-slate-600">Your platform bill is being verified against Stripe.</div>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading && <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-600">Checking Stripe payment status...</div>}

        {!loading && bill && (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
            <div className="font-bold text-emerald-800">Payment recorded</div>
            <div className="mt-2 text-sm text-emerald-800">
              Bill <b>{bill.label || bill.month}</b> is now <b>{bill.status}</b>.
            </div>
            <div className="mt-1 text-sm text-emerald-800">
              Total paid: <b>{money(bill.total_due)}</b> on <b>{formatDate(bill.paid_at)}</b>.
            </div>
          </div>
        )}

        {!loading && err && (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-800">
            {err}
          </div>
        )}

        <div className="flex gap-3">
          <Button onClick={() => nav('/billing')}>Back to Billing</Button>
          <Button variant="ghost" onClick={() => window.location.reload()}>
            Check Again
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

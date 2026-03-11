import React from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, CardContent, CardHeader } from '../components/Card'
import { Button } from '../components/Button'

export default function PaymentConfirmation() {
  const nav = useNavigate()
  return (
    <Card>
      <CardHeader>
        <div className="text-2xl font-black">Payment Confirmation</div>
        <div className="text-sm text-slate-600 mt-1">This is a demo “in-app bill” payment (no Stripe yet).</div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
          <div className="font-bold text-emerald-800">Payment recorded ✅</div>
          <div className="text-sm text-emerald-800 mt-1">Thank you! Your bill status is updated as paid.</div>
        </div>
        <Button onClick={()=>nav('/billing')}>Back to Billing</Button>
      </CardContent>
    </Card>
  )
}

import React from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, CardContent, CardHeader } from '../components/Card'
import { Button } from '../components/Button'

export default function PendingApproval() {
  const nav = useNavigate()
  return (
    <Card>
      <CardHeader>
        <div className="text-2xl font-black">Pending Approval</div>
        <div className="text-sm text-slate-600 mt-1">Your driver account is pending admin approval.</div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
          <div className="font-bold">What happens next?</div>
          <ul className="list-disc ml-5 mt-2 text-sm text-slate-700 space-y-1">
            <li>An admin reviews your documents.</li>
            <li>Once approved, you can login as Driver.</li>
            <li>If rejected, you may re-apply with correct documents.</li>
          </ul>
        </div>
        <Button onClick={()=>nav('/login?role=driver')}>Go to Driver Login</Button>
      </CardContent>
    </Card>
  )
}

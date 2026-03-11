import React from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, CardContent, CardHeader } from '../components/Card'
import { Button } from '../components/Button'

export default function SignupRole() {
  const nav = useNavigate()
  return (
    <Card>
      <CardHeader>
        <div className="text-2xl font-black">Sign Up</div>
        <div className="text-sm text-slate-600 mt-1">Choose your account type.</div>
      </CardHeader>
      <CardContent className="grid md:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-6">
          <div className="font-black text-xl">Rider</div>
          <div className="text-sm text-slate-600 mt-2">Request rides, bargain, join rides, and view monthly bills.</div>
          <Button className="mt-5" onClick={()=>nav('/signup/rider')}>Sign up as Rider</Button>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-6">
          <div className="font-black text-xl">Driver</div>
          <div className="text-sm text-slate-600 mt-2">Upload documents, get admin approval, accept rides, and manage earnings.</div>
          <Button variant="secondary" className="mt-5" onClick={()=>nav('/signup/driver')}>Sign up as Driver</Button>
          <div className="text-xs text-slate-500 mt-3">Drivers must be 23+ and not a student.</div>
        </div>
      </CardContent>
    </Card>
  )
}

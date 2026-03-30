import React from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '../components/Button'
import { Card, CardContent } from '../components/Card'
import { ShieldCheck, Users, Zap } from 'lucide-react'

export default function Landing() {
  const nav = useNavigate()
  return (
    <div className="space-y-10">
      <div className="grid lg:grid-cols-2 gap-10 items-center">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            Trusted community ride coordination
          </div>
          <h1 className="mt-4 text-4xl sm:text-5xl font-black tracking-tight">
            Safe, organized rides — without messy WhatsApp threads.
          </h1>
          <p className="mt-4 text-slate-600 text-lg">
            Verified drivers, structured bargaining, join-ride requests, OTP pickup verification,
            and bi-weekly postpaid platform billing — all in one responsive web app.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button onClick={() => nav('/login?role=rider')}>Login as Rider</Button>
            <Button variant="secondary" onClick={() => nav('/login?role=driver')}>Login as Driver</Button>
            <Button variant="ghost" onClick={() => nav('/login?role=admin')}>Admin</Button>
          </div>
          <div className="mt-6 text-sm text-slate-500">
            New here? <button className="font-semibold text-brand-700 hover:underline" onClick={() => nav('/signup')}>Create an account</button>
          </div>
        </div>

        <div className="relative">
          <div className="absolute -inset-4 bg-gradient-to-br from-brand-200/60 to-emerald-200/60 blur-2xl rounded-3xl" />
          <Card className="relative">
            <CardContent className="p-6">
              <div className="grid sm:grid-cols-3 gap-4">
                <Feature icon={<Zap className="h-5 w-5" />} title="Real-time updates" desc="No refresh. New rides, messages, and popups appear instantly." />
                <Feature icon={<ShieldCheck className="h-5 w-5" />} title="Safety-first" desc="OTP pickup verification + driver approvals build trust." />
                <Feature icon={<Users className="h-5 w-5" />} title="Community friendly" desc="Clear rules for bargaining, joining, and cancellations." />
              </div>
              <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="font-bold">Bi-weekly platform billing</div>
                <div className="text-sm text-slate-600 mt-1">
                  Per-ride platform fees are tracked, taxed by city, and billed every 14 days through Stripe checkout.
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <Card><CardContent className="p-6"><div className="font-bold">Bargaining with confirmation</div><div className="text-sm text-slate-600 mt-2">Ride confirms only when both Rider and Driver accept the final price.</div></CardContent></Card>
        <Card><CardContent className="p-6"><div className="font-bold">Join ride rewards</div><div className="text-sm text-slate-600 mt-2">Each accepted join request gives the main rider a fare credit and the driver a detour bonus.</div></CardContent></Card>
        <Card><CardContent className="p-6"><div className="font-bold">Multi-stop drop-offs</div><div className="text-sm text-slate-600 mt-2">Add multiple stops and open Google Maps navigation for each location.</div></CardContent></Card>
      </div>
    </div>
  )
}

function Feature({ icon, title, desc }: { icon: React.ReactNode, title: string, desc: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="h-9 w-9 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center">
        {icon}
      </div>
      <div className="mt-3 font-bold">{title}</div>
      <div className="text-sm text-slate-600 mt-1">{desc}</div>
    </div>
  )
}

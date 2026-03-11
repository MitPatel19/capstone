import React, { useEffect, useMemo, useState } from 'react'
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { getRole, getToken, setToken } from './api'
import { wsClient } from './ws'
import { Layout } from './components/Layout'
import Landing from './pages/Landing'
import Login from './pages/Login'
import SignupRole from './pages/SignupRole'
import RiderSignup from './pages/RiderSignup'
import DriverSignup from './pages/DriverSignup'
import PendingApproval from './pages/PendingApproval'
import RiderDashboard from './pages/RiderDashboard'
import DriverDashboard from './pages/DriverDashboard'
import AdminDashboard from './pages/AdminDashboard'
import CreateRide from './pages/CreateRide'
import RideDetail from './pages/RideDetail'
import Billing from './pages/Billing'
import PaymentConfirmation from './pages/PaymentConfirmation'
import Feedback from './pages/Feedback'
import Profile from './pages/Profile'

type Toast = { id: string; title: string; body: string; action?: { label: string; to: string } }

function Protected({ role, children }: { role: 'rider'|'driver'|'admin', children: React.ReactNode }) {
  const r = getRole()
  if (!r) return <Navigate to="/login" replace />
  if (r !== role) return <Navigate to={`/${r}`} replace />
  return <>{children}</>
}

export default function App() {
  const [toasts, setToasts] = useState<Toast[]>([])
  const nav = useNavigate()

  useEffect(() => {
    const t = getToken()
    setToken(t)
  }, [])

  useEffect(() => {
    wsClient.connect()
    const off = wsClient.on((msg) => {
      if (msg?.type === 'join_request') {
        setToasts((prev) => [{
          id: crypto.randomUUID(),
          title: 'New Join Request',
          body: 'A rider requested to join a ride. Open ride details to respond.',
          action: { label: 'Open', to: `/ride/${msg.join_request.ride_id}` }
        }, ...prev].slice(0,3))
      }
      if (msg?.type === 'otp_generated') {
        setToasts((prev) => [{
          id: crypto.randomUUID(),
          title: 'OTP Generated',
          body: `Your pickup OTP is ${msg.otp}. Share it with the driver to start the ride.`,
          action: { label: 'Open Ride', to: `/ride/${msg.ride_id}` }
        }, ...prev].slice(0,3))
      }
      if (msg?.type === 'ride_completed') {
        setToasts((prev) => [{
          id: crypto.randomUUID(),
          title: 'Ride Completed',
          body: 'Please leave feedback to keep the community trustworthy.',
          action: { label: 'Rate Now', to: `/feedback/${msg.ride_id}` }
        }, ...prev].slice(0,3))
      }
    })
    return () => { off(); wsClient.close() }
  }, [])

  return (
    <Layout>
      <div className="fixed right-4 top-20 z-50 space-y-2 w-[320px] max-w-[90vw]">
        {toasts.map(t => (
          <div key={t.id} className="rounded-2xl border border-slate-200 bg-white shadow-sm p-4">
            <div className="font-bold">{t.title}</div>
            <div className="text-sm text-slate-600 mt-1">{t.body}</div>
            <div className="flex gap-2 mt-3">
              {t.action && (
                <button className="text-sm font-semibold text-brand-700 hover:underline" onClick={() => { nav(t.action!.to); setToasts(prev=>prev.filter(x=>x.id!==t.id)) }}>
                  {t.action.label}
                </button>
              )}
              <button className="text-sm text-slate-500 hover:underline" onClick={() => setToasts(prev=>prev.filter(x=>x.id!==t.id))}>Dismiss</button>
            </div>
          </div>
        ))}
      </div>

      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<SignupRole />} />
        <Route path="/signup/rider" element={<RiderSignup />} />
        <Route path="/signup/driver" element={<DriverSignup />} />
        <Route path="/pending" element={<PendingApproval />} />

        <Route path="/rider" element={<Protected role="rider"><RiderDashboard /></Protected>} />
        <Route path="/driver" element={<Protected role="driver"><DriverDashboard /></Protected>} />
        <Route path="/admin" element={<Protected role="admin"><AdminDashboard /></Protected>} />

        <Route path="/ride/create" element={<Protected role="rider"><CreateRide /></Protected>} />
        <Route path="/ride/:id" element={<RideDetail />} />
        <Route path="/billing" element={<Billing />} />
        <Route path="/payment-confirmation" element={<PaymentConfirmation />} />
        <Route path="/feedback/:rideId" element={<Feedback />} />
        <Route path="/profile" element={<Profile />} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  )
}

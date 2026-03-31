import React, { useEffect, useState } from 'react'
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { api, getRole, getToken, setToken } from './api'
import { wsClient } from './ws'
import { Layout } from './components/Layout'
import Landing from './pages/Landing'
import Login from './pages/Login'
import SignupRole from './pages/SignupRole'
import RiderSignup from './pages/RiderSignup'
import DriverSignup from './pages/DriverSignup'
import PendingApproval from './pages/PendingApproval'
import CheckEmail from './pages/CheckEmail'
import VerifyEmail from './pages/VerifyEmail'
import ForgotPassword from './pages/ForgotPassword'
import ResetPassword from './pages/ResetPassword'
import RiderDashboard from './pages/RiderDashboard'
import DriverDashboard from './pages/DriverDashboard'
import DriverRideDetail from './pages/DriverRideDetail'
import AdminDashboard from './pages/AdminDashboard'
import CreateRide from './pages/CreateRide'
import RideDetail from './pages/RideDetail'
import Billing from './pages/Billing'
import PaymentConfirmation from './pages/PaymentConfirmation'
import Feedback from './pages/Feedback'
import Profile from './pages/Profile'
import ReportIssue from './pages/ReportIssue'

type Toast = { id: string; title: string; body: string; action?: { label: string; to: string }; notificationId?: number }

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
    async function loadNotifications() {
      if (!getToken()) {
        setToasts((prev) => prev.filter((t) => !t.notificationId))
        return
      }
      try {
        const res = await api.get('/auth/notifications')
        const unreadToasts = (res.data || [])
          .filter((n: any) => !n.is_read)
          .slice(0, 3)
          .map((n: any) => ({
            id: `notification-${n.id}`,
            title: n.title,
            body: n.body,
            action: n.action_path ? { label: 'Open', to: n.action_path } : undefined,
            notificationId: n.id,
          }))
        setToasts((prev) => {
          const live = prev.filter((t) => !t.notificationId)
          return [...unreadToasts, ...live].slice(0, 4)
        })
      } catch {
        setToasts((prev) => prev.filter((t) => !t.notificationId))
      }
    }

    const syncSession = () => {
      const t = getToken()
      setToken(t)
      wsClient.close()
      wsClient.connect()
      loadNotifications()
    }
    syncSession()
    const onAuthChanged = () => syncSession()
    window.addEventListener('crcp-auth-changed', onAuthChanged)
    const notificationTimer = window.setInterval(() => {
      loadNotifications()
    }, 60000)
    const off = wsClient.on((msg) => {
      if (msg?.type === 'join_request') {
        const role = getRole()
        const openTo = role === 'driver' ? `/driver/ride/${msg.join_request.ride_id}` : `/ride/${msg.join_request.ride_id}`
        setToasts((prev) => [{
          id: crypto.randomUUID(),
          title: 'New Join Request',
          body: 'A rider requested to join a ride. Open ride details to respond.',
          action: { label: 'Open', to: openTo }
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
          body: 'Declare how the ride was paid and settle your platform bill from the billing page.',
          action: { label: 'Open Billing', to: '/billing' }
        }, ...prev].slice(0,3))
      }
    })
    return () => {
      off()
      window.clearInterval(notificationTimer)
      window.removeEventListener('crcp-auth-changed', onAuthChanged)
      wsClient.close()
    }
  }, [])

  return (
    <Layout>
      <div className="fixed inset-x-4 top-20 z-50 mx-auto w-auto max-w-[24rem] space-y-2 sm:inset-x-auto sm:right-4 sm:top-20 sm:mx-0 sm:w-[320px]">
        {toasts.map(t => (
          <div key={t.id} className="rounded-2xl border border-slate-200 bg-white shadow-sm p-4">
            <div className="font-bold">{t.title}</div>
            <div className="text-sm text-slate-600 mt-1">{t.body}</div>
            <div className="mt-3 flex flex-wrap gap-2">
              {t.action && (
                <button className="text-sm font-semibold text-brand-700 hover:underline" onClick={async () => { if (t.notificationId) { try { await api.post(`/auth/notifications/${t.notificationId}/read`) } catch {} } nav(t.action!.to); setToasts(prev=>prev.filter(x=>x.id!==t.id)) }}>
                  {t.action.label}
                </button>
              )}
              <button className="text-sm text-slate-500 hover:underline" onClick={async () => { if (t.notificationId) { try { await api.post(`/auth/notifications/${t.notificationId}/read`) } catch {} } setToasts(prev=>prev.filter(x=>x.id!==t.id)) }}>Dismiss</button>
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
        <Route path="/check-email" element={<CheckEmail />} />
        <Route path="/verify-email" element={<VerifyEmail />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />

        <Route path="/rider" element={<Protected role="rider"><RiderDashboard /></Protected>} />
        <Route path="/driver" element={<Protected role="driver"><DriverDashboard /></Protected>} />
        <Route path="/driver/ride/:id" element={<Protected role="driver"><DriverRideDetail /></Protected>} />
        <Route path="/admin" element={<Protected role="admin"><AdminDashboard /></Protected>} />

        <Route path="/ride/create" element={<Protected role="rider"><CreateRide /></Protected>} />
        <Route path="/ride/:id" element={<RideDetail />} />
        <Route path="/billing" element={<Billing />} />
        <Route path="/payment-confirmation" element={<PaymentConfirmation />} />
        <Route path="/feedback/:rideId" element={<Feedback />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/report" element={<ReportIssue />} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  )
}

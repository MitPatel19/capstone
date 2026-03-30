import React from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { clearSession, getRole } from '../api'
import { Button } from './Button'
import { RiderTopBar } from './RiderTopBar'

export function Layout({ children }: { children: React.ReactNode }) {
  const nav = useNavigate()
  const location = useLocation()
  const role = getRole()
  const isAdminView = role === 'admin' && location.pathname.startsWith('/admin')
  const isDriverView = role === 'driver' && (
    location.pathname.startsWith('/driver') ||
    location.pathname.startsWith('/ride/') ||
    location.pathname.startsWith('/billing') ||
    location.pathname.startsWith('/profile') ||
    location.pathname.startsWith('/payment-confirmation')
  )
  const isRiderView = role === 'rider' && (
    location.pathname.startsWith('/rider') ||
    location.pathname.startsWith('/ride/') ||
    location.pathname.startsWith('/billing') ||
    location.pathname.startsWith('/profile') ||
    location.pathname.startsWith('/payment-confirmation')
  )

  if (isAdminView) {
    return <div className="min-h-screen bg-slate-100">{children}</div>
  }

  if (isDriverView) {
    return <div className="min-h-screen bg-slate-100">{children}</div>
  }

  if (isRiderView) {
    return (
      <div className="min-h-screen bg-slate-100 text-slate-900">
        <RiderTopBar />
        <main className="mx-auto w-full max-w-6xl px-4 py-8">{children}</main>
      </div>
    )
  }

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 bg-white/80 backdrop-blur border-b border-slate-200">
        <div className="mx-auto max-w-6xl px-4 py-3 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-brand-600 to-emerald-600" />
            <div className="leading-tight">
              <div className="font-extrabold">Community Ride</div>
              <div className="text-xs text-slate-500">Safe coordination for small cities</div>
            </div>
          </Link>
          <div className="flex items-center gap-2">
            {role && (
              <>
                <span className="hidden sm:inline text-xs px-2 py-1 rounded-full bg-slate-100 border border-slate-200 capitalize">{role}</span>
                <Button variant="ghost" onClick={() => { clearSession(); nav('/'); }}>Logout</Button>
              </>
            )}
            {!role && (
              <>
                <Button variant="ghost" onClick={() => nav('/login')}>Login</Button>
                <Button onClick={() => nav('/signup')}>Sign Up</Button>
              </>
            )}
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-6 text-sm text-slate-600 flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between">
          <div>© {new Date().getFullYear()} Community Ride Coordination Platform</div>
          <div className="flex gap-4">
            <a className="hover:underline" href="#">About</a>
            <a className="hover:underline" href="#">Contact</a>
            <a className="hover:underline" href="#">Safety</a>
          </div>
        </div>
      </footer>
    </div>
  )
}

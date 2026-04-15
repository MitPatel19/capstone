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
        <main className="mx-auto w-full max-w-6xl px-4 py-5 pb-safe sm:py-8">{children}</main>
      </div>
    )
  }

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/85 backdrop-blur pt-safe">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <Link to="/" className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-brand-600 to-emerald-600 shadow-sm" />
            <div className="leading-tight">
              <div className="font-extrabold">Community Ride</div>
              <div className="hidden text-xs text-slate-500 sm:block">Safe coordination for small cities</div>
            </div>
          </Link>
          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
            {role && (
              <>
                <span className="inline rounded-full border border-slate-200 bg-slate-100 px-2 py-1 text-xs capitalize">{role}</span>
                <Button variant="ghost" onClick={() => { clearSession(); nav('/') }}>Logout</Button>
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
      <main className="mx-auto max-w-6xl px-4 py-5 pb-safe sm:py-8">{children}</main>
      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-6 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between">
          <div>&copy; {new Date().getFullYear()} Community Ride Coordination Platform</div>
          <div className="flex flex-wrap gap-4">
            <a className="hover:underline" href="#">About</a>
            <a className="hover:underline" href="#">Contact</a>
            <a className="hover:underline" href="#">Safety</a>
          </div>
        </div>
      </footer>
    </div>
  )
}

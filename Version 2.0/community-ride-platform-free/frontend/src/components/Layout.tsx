import React from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { clearSession, getRole } from '../api'
import { Button } from './Button'

export function Layout({ children }: { children: React.ReactNode }) {
  const nav = useNavigate()
  const role = getRole()
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

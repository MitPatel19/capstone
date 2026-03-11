import React from 'react'
import { CarFront, CircleDollarSign, LogOut, UserRound } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { clearSession } from '../api'

export function DriverTopBar() {
  const nav = useNavigate()

  return (
    <header className="border-b border-slate-300 bg-white">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-4">
        <button className="flex items-center gap-3" onClick={() => nav('/driver')}>
          <CarFront className="h-7 w-7 text-emerald-600" />
          <span className="text-2xl font-black">RideConnect Driver</span>
        </button>
        <div className="flex items-center gap-3">
          <button className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold hover:bg-slate-100" onClick={() => nav('/profile')}>
            <UserRound className="h-5 w-5" />
            Profile
          </button>
          <button className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold hover:bg-slate-100" onClick={() => nav('/billing')}>
            <CircleDollarSign className="h-5 w-5" />
            Billing
          </button>
          <button
            className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold hover:bg-slate-50"
            onClick={() => {
              clearSession()
              nav('/login?role=driver')
            }}
          >
            <LogOut className="h-5 w-5" />
            Logout
          </button>
        </div>
      </div>
    </header>
  )
}

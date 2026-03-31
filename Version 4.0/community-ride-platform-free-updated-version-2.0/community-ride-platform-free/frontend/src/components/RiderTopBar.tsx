import React from 'react'
import { CarFront, CircleDollarSign, LogOut, UserRound } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { clearSession } from '../api'

export function RiderTopBar() {
  const nav = useNavigate()

  return (
    <header className="border-b border-slate-300 bg-white pt-safe">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
        <button className="flex items-center gap-3 self-start text-left" onClick={() => nav('/rider')}>
          <CarFront className="h-7 w-7 text-brand-600" />
          <span className="text-xl font-black sm:text-2xl">RideConnect</span>
        </button>
        <div className="grid w-full grid-cols-3 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:items-center sm:justify-end sm:gap-3">
          <button className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold hover:bg-slate-100" onClick={() => nav('/profile')}>
            <UserRound className="h-5 w-5" />
            <span className="hidden sm:inline">Profile</span>
          </button>
          <button className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold hover:bg-slate-100" onClick={() => nav('/billing')}>
            <CircleDollarSign className="h-5 w-5" />
            <span className="hidden sm:inline">Billing</span>
          </button>
          <button
            className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold hover:bg-slate-50"
            onClick={() => {
              clearSession()
              nav('/login?role=rider')
            }}
          >
            <LogOut className="h-5 w-5" />
            <span className="hidden sm:inline">Logout</span>
          </button>
        </div>
      </div>
    </header>
  )
}

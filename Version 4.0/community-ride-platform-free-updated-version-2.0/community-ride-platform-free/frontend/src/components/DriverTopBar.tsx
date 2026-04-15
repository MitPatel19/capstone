import React from 'react'
import { CarFront, CircleDollarSign, House, LogOut, UserRound } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { clearSession } from '../api'

export function DriverTopBar() {
  const nav = useNavigate()

  return (
    <header className="border-b border-slate-300 bg-white pt-safe">
      <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
        <button className="flex items-center gap-3 self-start text-left" onClick={() => nav('/driver')}>
          <CarFront className="h-7 w-7 text-emerald-600" />
          <span className="text-xl font-black sm:text-2xl">RideConnect Driver</span>
        </button>
        <div className="grid w-full grid-cols-4 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:items-center sm:justify-end sm:gap-3">
          <button className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold hover:bg-slate-100" onClick={() => nav('/driver')}>
            <House className="h-5 w-5" />
            <span className="hidden sm:inline">Home</span>
          </button>
          <button className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold hover:bg-slate-100" onClick={() => nav('/profile')}>
            <UserRound className="h-5 w-5" />
            <span className="hidden sm:inline">Profile</span>
          </button>
          <button className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold hover:bg-slate-100" onClick={() => nav('/billing')}>
            <CircleDollarSign className="h-5 w-5" />
            <span className="hidden sm:inline">Billing</span>
          </button>
          <button
            className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold hover:bg-slate-100"
            onClick={() => {
              clearSession()
              nav('/login?role=driver')
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

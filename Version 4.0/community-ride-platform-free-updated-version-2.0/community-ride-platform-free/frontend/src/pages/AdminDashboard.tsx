import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, Check, ExternalLink, FileText, ImageOff, LogOut, Shield, Users, Wallet, X } from 'lucide-react'
import { api, clearSession } from '../api'
import { wsClient } from '../ws'

type Pending = {
  driver_id: number
  name: string
  email: string
  phone: string
  submitted: string
  license_expiry_date?: string | null
  license_expiry_status?: string
  documents?: { label: string; url: string }[]
}

type User = {
  id: number
  role: 'rider' | 'driver' | 'admin'
  name: string
  email: string
  status: 'active' | 'disabled'
  rating_avg?: number
  billing_free_access?: boolean
  billing_access_status?: string
}

type FlaggedReport = {
  id: number
  target_type: string
  status: string
  category: string
  subject: string
  description: string
  reporter_name: string
  reported_name: string
  ride_id?: number | null
  attachment_url?: string
  admin_note?: string
  created_at: string
  resolved_at?: string | null
}

type City = {
  id: number
  name: string
  is_active: boolean
  province_name: string
  tax_name: string
  tax_rate: number
}

type CityRequest = {
  user_id: number
  user_name: string
  user_email: string
  user_role: string
  pending_city_id: number
  pending_city_name: string
}

type BillingSettings = {
  fee_per_ride: number
  global_free_mode: boolean
  cycle_length_days: number
  grace_period_days: number
  billing_anchor_date: string
  stripe_ready: boolean
  currency: string
}

type BillingOverview = {
  bill_id: number
  user_id: number
  user_name: string
  user_email: string
  role: string
  period_label: string
  status: string
  subtotal: number
  tax_amount: number
  total_due: number
  is_paid: boolean
  is_waived: boolean
  city_name: string
  payment_provider: string
  payment_reference: string
  due_at?: string | null
  grace_expires_at?: string | null
  paid_at?: string | null
}

type Metrics = {
  active_riders: number
  active_drivers: number
}

type TabKey = 'pending' | 'users' | 'fees' | 'cities' | 'reports'

const TABS: { key: TabKey; label: string }[] = [
  { key: 'pending', label: 'Pending Approvals' },
  { key: 'users', label: 'User Management' },
  { key: 'fees', label: 'Billing & Fees' },
  { key: 'cities', label: 'City Tax Management' },
  { key: 'reports', label: 'Reports & Flags' },
]

function formatDate(dateLike: string) {
  const d = new Date(dateLike)
  if (Number.isNaN(d.valueOf())) return dateLike
  return d.toISOString().slice(0, 10)
}

function resolveDocumentUrl(url: string) {
  if (!url) return ''
  if (/^https?:\/\//i.test(url)) return url
  const baseURL = api.defaults.baseURL ?? window.location.origin
  return new URL(url.startsWith('/') ? url : `/${url}`, baseURL).toString()
}

export default function AdminDashboard() {
  const nav = useNavigate()
  const [activeTab, setActiveTab] = useState<TabKey>('pending')
  const [pending, setPending] = useState<Pending[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [reports, setReports] = useState<FlaggedReport[]>([])
  const [cities, setCities] = useState<City[]>([])
  const [cityRequests, setCityRequests] = useState<CityRequest[]>([])
  const [newCity, setNewCity] = useState('')
  const [billingSettings, setBillingSettings] = useState<BillingSettings>({
    fee_per_ride: 0.5,
    global_free_mode: false,
    cycle_length_days: 14,
    grace_period_days: 7,
    billing_anchor_date: '2024-01-01',
    stripe_ready: false,
    currency: 'cad',
  })
  const [billingRows, setBillingRows] = useState<BillingOverview[]>([])
  const [cityDrafts, setCityDrafts] = useState<Record<number, { province_name: string; tax_name: string; tax_rate: number }>>({})
  const [metrics, setMetrics] = useState<Metrics | null>(null)
  const [loading, setLoading] = useState(true)
  const [savingFee, setSavingFee] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [selectedDocument, setSelectedDocument] = useState<{ label: string; url: string } | null>(null)
  const [documentLoadFailed, setDocumentLoadFailed] = useState(false)
  const [selectedReport, setSelectedReport] = useState<FlaggedReport | null>(null)
  const [reportStatus, setReportStatus] = useState('open')
  const [reportNote, setReportNote] = useState('')

  async function load() {
    setLoading(true)
    try {
      const [p, u, f, r, c, cr, met] = await Promise.all([
        api.get('/admin/drivers/pending'),
        api.get('/admin/users'),
        api.get('/admin/billing/settings'),
        api.get('/admin/reports'),
        api.get('/admin/cities'),
        api.get('/admin/cities/requests'),
        api.get('/auth/metrics'),
      ])
      const billing = await api.get('/admin/billing/overview')
      setPending(p.data)
      setUsers(u.data)
      setBillingSettings(f.data)
      setReports(r.data)
      setCities(c.data)
      setCityRequests(cr.data)
      setMetrics({
        active_riders: met.data.active_riders,
        active_drivers: met.data.active_drivers,
      })
      setBillingRows(billing.data)
      setCityDrafts(
        Object.fromEntries(
          (c.data as City[]).map((city) => [
            city.id,
            {
              province_name: city.province_name,
              tax_name: city.tax_name,
              tax_rate: Number(city.tax_rate ?? 0),
            },
          ])
        )
      )
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  useEffect(() => {
    const unsub = wsClient.on((msg) => {
      if (msg?.type === 'presence_update') {
        setMetrics({
          active_riders: Number(msg.active_riders ?? 0),
          active_drivers: Number(msg.active_drivers ?? 0),
        })
      }
    })
    return () => {
      void unsub()
    }
  }, [])

  async function saveFee() {
    setSavingFee(true)
    setMsg(null)
    try {
      await api.post('/admin/billing/settings', {
        fee_per_ride: billingSettings.fee_per_ride,
        global_free_mode: billingSettings.global_free_mode,
        cycle_length_days: billingSettings.cycle_length_days,
        grace_period_days: billingSettings.grace_period_days,
        billing_anchor_date: billingSettings.billing_anchor_date,
      })
      setMsg('Billing settings updated.')
      await load()
    } finally {
      setSavingFee(false)
    }
  }

  const reportRows = reports

  const stats = useMemo(
    () => [
      {
        label: 'Pending Approvals',
        value: pending.length,
        icon: <FileText className="h-11 w-11 text-amber-200" />,
      },
      {
        label: 'Total Users',
        value: users.length,
        icon: <Users className="h-11 w-11 text-blue-200" />,
      },
      {
        label: 'Platform Fee',
        value: `$${billingSettings.fee_per_ride.toFixed(2)}`,
        icon: <Wallet className="h-11 w-11 text-emerald-200" />,
      },
      {
        label: 'Flagged Reports',
        value: reportRows.length,
        icon: <AlertTriangle className="h-11 w-11 text-rose-200" />,
      },
      {
        label: 'Active Riders',
        value: metrics?.active_riders ?? 0,
        icon: <Users className="h-11 w-11 text-sky-200" />,
      },
      {
        label: 'Active Drivers',
        value: metrics?.active_drivers ?? 0,
        icon: <Shield className="h-11 w-11 text-emerald-200" />,
      },
    ],
    [billingSettings.fee_per_ride, metrics?.active_drivers, metrics?.active_riders, pending.length, reportRows.length, users.length]
  )

  async function approveDriver(driverId: number) {
    await api.post(`/admin/drivers/${driverId}/approve`)
    await load()
  }

  async function rejectDriver(driverId: number) {
    await api.post(`/admin/drivers/${driverId}/reject`)
    await load()
  }

  async function toggleUser(uid: number, nextState: 'enable' | 'disable') {
    await api.post(`/admin/users/${uid}/${nextState}`)
    await load()
  }

  async function toggleFreeAccess(uid: number, enabled: boolean) {
    await api.post(`/admin/billing/users/${uid}/free-access`, {
      is_free_access: enabled,
      reason: enabled ? 'Admin granted personal free access.' : '',
    })
    setMsg(enabled ? 'Personal free access granted.' : 'Personal free access removed.')
    await load()
  }

  async function addCity() {
    const name = newCity.trim()
    if (!name) return
    await api.post('/admin/cities', { name })
    setNewCity('')
    setMsg('City added.')
    await load()
  }

  async function removeCity(cityId: number) {
    await api.delete(`/admin/cities/${cityId}`)
    setMsg('City removed.')
    await load()
  }

  async function saveCityTax(cityId: number) {
    const draft = cityDrafts[cityId]
    if (!draft) return
    await api.put(`/admin/cities/${cityId}`, draft)
    setMsg('City tax settings updated.')
    await load()
  }

  async function approveCityRequest(userId: number) {
    await api.post(`/admin/cities/requests/${userId}/approve`)
    await load()
  }

  async function rejectCityRequest(userId: number) {
    await api.post(`/admin/cities/requests/${userId}/reject`)
    await load()
  }

  async function saveReportReview() {
    if (!selectedReport) return
    await api.post(`/admin/reports/${selectedReport.id}`, { status: reportStatus, admin_note: reportNote })
    setSelectedReport(null)
    await load()
  }

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <header className="border-b border-slate-300 bg-white pt-safe">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:py-5">
          <div className="flex items-center gap-3">
            <Shield className="h-8 w-8 text-brand-600" strokeWidth={1.8} />
            <h1 className="text-2xl font-black sm:text-3xl">Admin Dashboard</h1>
          </div>
          <button
            className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold hover:bg-slate-50"
            onClick={() => {
              clearSession()
              nav('/login')
            }}
          >
            <LogOut className="h-5 w-5" />
            Logout
          </button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl space-y-6 px-4 py-5 pb-safe sm:space-y-8 sm:py-8">
        <section className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-6">
          {stats.map((stat) => (
            <article key={stat.label} className="rounded-3xl border border-slate-300 bg-white px-8 py-8">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-base text-slate-600">{stat.label}</div>
                  <div className="mt-2 text-4xl font-bold">{stat.value}</div>
                </div>
                {stat.icon}
              </div>
            </article>
          ))}
        </section>

        <section className="overflow-x-auto rounded-[1.75rem] bg-slate-200 p-1.5">
          <div className="grid min-w-[50rem] grid-cols-5 md:min-w-0">
            {TABS.map((tab) => (
              <button
                key={tab.key}
                className={[
                  'rounded-full px-4 py-3 text-sm font-bold transition',
                  activeTab === tab.key ? 'border border-slate-300 bg-white shadow-sm' : 'text-slate-900 hover:bg-slate-100',
                ].join(' ')}
                onClick={() => setActiveTab(tab.key)}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </section>

        <section className="rounded-3xl border border-slate-300 bg-white p-4 sm:p-8">
          {loading && <div className="text-base text-slate-600">Loading...</div>}
          {!loading && msg && <div className="mb-6 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{msg}</div>}

          {!loading && activeTab === 'pending' && (
            <div>
              <h2 className="text-2xl font-black">Pending Driver Approvals</h2>
              <p className="mt-2 text-base text-slate-600">Review and approve driver applications</p>

              {pending.length === 0 ? (
                <div className="mt-8 text-base text-slate-500 sm:text-xl">No pending approvals right now.</div>
              ) : (
                <div className="mt-8 overflow-x-auto">
                  <table className="min-w-full text-left">
                    <thead>
                      <tr className="border-b border-slate-200 text-sm font-bold">
                        <th className="px-3 py-4">Name</th>
                        <th className="px-3 py-4">Email</th>
                        <th className="px-3 py-4">Phone</th>
                        <th className="px-3 py-4">Applied Date</th>
                        <th className="px-3 py-4">License Status</th>
                        <th className="px-3 py-4">Documents</th>
                        <th className="px-3 py-4">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pending.map((driver) => (
                        <tr key={driver.driver_id} className="border-b border-slate-200 text-sm">
                          <td className="px-3 py-4">{driver.name}</td>
                          <td className="px-3 py-4">{driver.email}</td>
                          <td className="px-3 py-4">{driver.phone}</td>
                          <td className="px-3 py-4">{formatDate(driver.submitted)}</td>
                          <td className="px-3 py-4">
                            <div className="flex flex-col gap-1">
                              <span
                                className={[
                                  'inline-flex w-fit rounded-full px-3 py-1 text-xs font-bold',
                                  driver.license_expiry_status === 'expired'
                                    ? 'bg-rose-100 text-rose-700'
                                    : driver.license_expiry_status === 'expiring_soon'
                                      ? 'bg-amber-100 text-amber-700'
                                      : 'bg-emerald-100 text-emerald-700',
                                ].join(' ')}
                              >
                                {(driver.license_expiry_status || 'unknown').split('_').join(' ')}
                              </span>
                              <span className="text-xs text-slate-500">{driver.license_expiry_date || 'No expiry date recorded'}</span>
                            </div>
                          </td>
                          <td className="px-3 py-4">
                            <div className="flex flex-wrap gap-2">
                              {(driver.documents ?? []).length === 0 ? (
                                <span className="rounded-full border border-slate-300 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-500">
                                  No documents
                                </span>
                              ) : (
                                (driver.documents ?? []).map((doc) => (
                                  <button
                                    key={`${driver.driver_id}-${doc.label}`}
                                    type="button"
                                    className="rounded-full border border-slate-300 bg-slate-50 px-3 py-1 text-xs font-semibold transition hover:bg-slate-100 hover:text-slate-900"
                                    onClick={() => {
                                      setSelectedDocument({
                                        label: doc.label,
                                        url: resolveDocumentUrl(doc.url),
                                      })
                                      setDocumentLoadFailed(false)
                                    }}
                                  >
                                    View {doc.label}
                                  </button>
                                ))
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-4">
                            <div className="flex flex-wrap gap-2">
                              <button
                                className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700"
                                onClick={() => approveDriver(driver.driver_id)}
                              >
                                <Check className="h-5 w-5" />
                                Approve
                              </button>
                              <button
                                className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2 text-sm font-bold text-white hover:bg-rose-700"
                                onClick={() => rejectDriver(driver.driver_id)}
                              >
                                <X className="h-5 w-5" />
                                Reject
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="mt-10">
                <h3 className="text-xl font-black">Pending City Requests</h3>
                <p className="mt-1 text-sm text-slate-600">Approve or reject city changes requested by riders and drivers</p>
                {cityRequests.length === 0 ? (
                  <div className="mt-4 text-sm text-slate-500">No pending city requests.</div>
                ) : (
                  <div className="mt-4 overflow-x-auto">
                    <table className="min-w-full text-left">
                      <thead>
                        <tr className="border-b border-slate-200 text-sm font-bold">
                          <th className="px-3 py-3">User</th>
                          <th className="px-3 py-3">Role</th>
                          <th className="px-3 py-3">Email</th>
                          <th className="px-3 py-3">Requested City</th>
                          <th className="px-3 py-3">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {cityRequests.map((req) => (
                          <tr key={req.user_id} className="border-b border-slate-200 text-sm">
                            <td className="px-3 py-3">{req.user_name}</td>
                            <td className="px-3 py-3">
                              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold capitalize text-slate-700">{req.user_role || '-'}</span>
                            </td>
                            <td className="px-3 py-3">{req.user_email}</td>
                            <td className="px-3 py-3">{req.pending_city_name}</td>
                            <td className="px-3 py-3">
                              <div className="flex gap-2">
                                <button className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-700" onClick={() => approveCityRequest(req.user_id)}>
                                  Approve
                                </button>
                                <button className="rounded-xl bg-rose-600 px-3 py-2 text-xs font-bold text-white hover:bg-rose-700" onClick={() => rejectCityRequest(req.user_id)}>
                                  Reject
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {!loading && activeTab === 'users' && (
            <div>
              <h2 className="text-2xl font-black">User Management</h2>
              <p className="mt-2 text-base text-slate-600">Manage rider and driver accounts</p>

              <div className="mt-8 overflow-x-auto">
                <table className="min-w-full text-left">
                  <thead className="bg-slate-100">
                    <tr className="text-sm font-bold">
                      <th className="px-3 py-4">Name</th>
                      <th className="px-3 py-4">Email</th>
                      <th className="px-3 py-4">Role</th>
                      <th className="px-3 py-4">Rating</th>
                      <th className="px-3 py-4">Billing</th>
                      <th className="px-3 py-4">Free Access</th>
                      <th className="px-3 py-4">Status</th>
                      <th className="px-3 py-4">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((u) => (
                      <tr key={u.id} className="border-b border-slate-200 text-sm">
                        <td className="px-3 py-4">{u.name}</td>
                        <td className="px-3 py-4">{u.email}</td>
                        <td className="px-3 py-4">
                          <span
                            className={[
                              'rounded-full px-3 py-1 text-xs font-bold',
                              u.role === 'driver' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-900',
                            ].join(' ')}
                          >
                            {u.role}
                          </span>
                        </td>
                        <td className="px-3 py-4">{(u.rating_avg ?? 0).toFixed(1)}</td>
                        <td className="px-3 py-4">
                          <span className={`rounded-full px-3 py-1 text-xs font-bold capitalize ${
                            u.billing_access_status === 'locked'
                              ? 'bg-rose-100 text-rose-700'
                              : u.billing_access_status === 'warning'
                                ? 'bg-amber-100 text-amber-700'
                                : 'bg-emerald-100 text-emerald-700'
                          }`}>
                            {u.billing_access_status || 'current'}
                          </span>
                        </td>
                        <td className="px-3 py-4">
                          <button
                            className={[
                              'rounded-xl px-4 py-2 text-sm font-bold',
                              u.billing_free_access
                                ? 'border border-slate-300 bg-white hover:bg-slate-50'
                                : 'bg-brand-600 text-white hover:bg-brand-700',
                            ].join(' ')}
                            onClick={() => toggleFreeAccess(u.id, !u.billing_free_access)}
                            disabled={u.role === 'admin'}
                          >
                            {u.billing_free_access ? 'Remove Free' : 'Grant Free'}
                          </button>
                        </td>
                        <td className="px-3 py-4">
                          <span className="rounded-full bg-slate-900 px-3 py-1 text-xs font-bold text-white">{u.status}</span>
                        </td>
                        <td className="px-3 py-4">
                          {u.status === 'active' ? (
                            <button
                              className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-bold text-white hover:bg-rose-700"
                              onClick={() => toggleUser(u.id, 'disable')}
                            >
                              Disable
                            </button>
                          ) : (
                            <button
                              className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold hover:bg-slate-50"
                              onClick={() => toggleUser(u.id, 'enable')}
                            >
                              Enable
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

            </div>
          )}

          {!loading && activeTab === 'fees' && (
            <div className="space-y-8">
              <div className="max-w-5xl">
                <h2 className="text-2xl font-black">Billing Controls</h2>
                <p className="mt-2 text-base text-slate-600">Manage platform fees, launch free mode, and Stripe readiness for bi-weekly billing.</p>

                <div className="mt-8 grid gap-4 lg:grid-cols-2">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                    <label className="block text-base font-bold" htmlFor="platform-fee">
                      Platform Fee Per Ride (CAD)
                    </label>
                    <input
                      id="platform-fee"
                      className="mt-3 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-base outline-none focus:border-brand-300 focus:ring-2 focus:ring-brand-100"
                      type="number"
                      step="0.01"
                      value={billingSettings.fee_per_ride}
                      onChange={(e) => setBillingSettings((prev) => ({ ...prev, fee_per_ride: Number(e.target.value || 0) }))}
                    />
                    <p className="mt-3 text-sm text-slate-600">This amount is the platform bill charged per completed rider or driver participation.</p>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="text-base font-bold">Global Free Mode</div>
                        <div className="mt-2 text-sm text-slate-600">Turn this on during launch so everyone can use the app without platform billing.</div>
                      </div>
                      <label className="inline-flex cursor-pointer items-center gap-3">
                        <input
                          type="checkbox"
                          checked={billingSettings.global_free_mode}
                          onChange={(e) => setBillingSettings((prev) => ({ ...prev, global_free_mode: e.target.checked }))}
                        />
                        <span className="text-sm font-bold">{billingSettings.global_free_mode ? 'Enabled' : 'Disabled'}</span>
                      </label>
                    </div>
                    <div className="mt-4 rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-600">
                      Billing cycle: every {billingSettings.cycle_length_days} days<br />
                      Grace period before lock: {billingSettings.grace_period_days} days<br />
                      Stripe checkout ready: <b>{billingSettings.stripe_ready ? 'Yes' : 'No'}</b>
                    </div>
                  </div>
                </div>

                <button
                  className="mt-6 rounded-xl bg-brand-600 px-6 py-2.5 text-sm font-bold text-white hover:bg-brand-700 disabled:opacity-60"
                  onClick={saveFee}
                  disabled={savingFee}
                >
                  {savingFee ? 'Saving...' : 'Save Billing Settings'}
                </button>
              </div>

              <div>
                <h3 className="text-xl font-black">Bill Overview</h3>
                <p className="mt-1 text-sm text-slate-600">See who has paid, who is free, and who is approaching or past the billing deadline.</p>
                <div className="mt-4 overflow-x-auto">
                  <table className="min-w-full text-left">
                    <thead>
                      <tr className="border-b border-slate-200 text-sm font-bold">
                        <th className="px-3 py-3">User</th>
                        <th className="px-3 py-3">Role</th>
                        <th className="px-3 py-3">Period</th>
                        <th className="px-3 py-3">City</th>
                        <th className="px-3 py-3">Total</th>
                        <th className="px-3 py-3">Status</th>
                        <th className="px-3 py-3">Payment</th>
                      </tr>
                    </thead>
                    <tbody>
                      {billingRows.length === 0 ? (
                        <tr>
                          <td className="px-3 py-4 text-sm text-slate-500" colSpan={7}>
                            No billing rows yet.
                          </td>
                        </tr>
                      ) : (
                        billingRows.map((row) => (
                          <tr key={row.bill_id} className="border-b border-slate-200 text-sm">
                            <td className="px-3 py-3">
                              <div className="font-semibold">{row.user_name}</div>
                              <div className="text-xs text-slate-500">{row.user_email}</div>
                            </td>
                            <td className="px-3 py-3 capitalize">{row.role}</td>
                            <td className="px-3 py-3">{row.period_label}</td>
                            <td className="px-3 py-3">{row.city_name || '-'}</td>
                            <td className="px-3 py-3">
                              <div className="font-semibold">${row.total_due.toFixed(2)}</div>
                              <div className="text-xs text-slate-500">Tax ${row.tax_amount.toFixed(2)}</div>
                            </td>
                            <td className="px-3 py-3">
                              <span className={`rounded-full px-3 py-1 text-xs font-bold capitalize ${
                                row.status === 'locked'
                                  ? 'bg-rose-100 text-rose-700'
                                  : row.status === 'due'
                                    ? 'bg-amber-100 text-amber-700'
                                    : row.status === 'paid'
                                      ? 'bg-emerald-100 text-emerald-700'
                                      : row.status === 'waived'
                                        ? 'bg-blue-100 text-blue-700'
                                        : 'bg-slate-100 text-slate-700'
                              }`}>
                                {row.status}
                              </span>
                              <div className="mt-1 text-xs text-slate-500">
                                {row.paid_at ? `Paid ${formatDate(row.paid_at)}` : row.due_at ? `Due ${formatDate(row.due_at)}` : '-'}
                              </div>
                            </td>
                            <td className="px-3 py-3">
                              {row.payment_provider ? (
                                <div>
                                  <div className="font-semibold capitalize">{row.payment_provider}</div>
                                  <div className="max-w-[180px] truncate text-xs text-slate-500">{row.payment_reference || '-'}</div>
                                </div>
                              ) : (
                                <span className="text-slate-500">-</span>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {!loading && activeTab === 'cities' && (
            <div>
              <h2 className="text-2xl font-black">City Tax Management</h2>
              <p className="mt-2 text-base text-slate-600">Add cities and control the province and tax profile used on bi-weekly bills.</p>

              <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-col gap-3 sm:flex-row">
                  <input
                    className="flex-1 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-200"
                    placeholder="Add city name"
                    value={newCity}
                    onChange={(e) => setNewCity(e.target.value)}
                  />
                  <button className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-bold text-white hover:bg-brand-700" onClick={addCity}>
                    Add City
                  </button>
                </div>
              </div>

              <div className="mt-6 grid gap-4 lg:grid-cols-2">
                {cities.map((city) => (
                  <div key={city.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-lg font-black">{city.name}</div>
                        <div className="text-xs text-slate-500">Used to calculate platform bill tax snapshots</div>
                      </div>
                      <button className="text-sm font-semibold text-rose-600 hover:underline" onClick={() => removeCity(city.id)}>
                        remove
                      </button>
                    </div>
                    <div className="mt-4 grid gap-3 md:grid-cols-3">
                      <input
                        className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-200"
                        value={cityDrafts[city.id]?.province_name ?? city.province_name}
                        onChange={(e) =>
                          setCityDrafts((prev) => ({
                            ...prev,
                            [city.id]: {
                              ...prev[city.id],
                              province_name: e.target.value,
                              tax_name: prev[city.id]?.tax_name ?? city.tax_name,
                              tax_rate: prev[city.id]?.tax_rate ?? city.tax_rate,
                            },
                          }))
                        }
                        placeholder="Province"
                      />
                      <input
                        className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-200"
                        value={cityDrafts[city.id]?.tax_name ?? city.tax_name}
                        onChange={(e) =>
                          setCityDrafts((prev) => ({
                            ...prev,
                            [city.id]: {
                              ...prev[city.id],
                              province_name: prev[city.id]?.province_name ?? city.province_name,
                              tax_name: e.target.value,
                              tax_rate: prev[city.id]?.tax_rate ?? city.tax_rate,
                            },
                          }))
                        }
                        placeholder="Tax name"
                      />
                      <input
                        className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-200"
                        type="number"
                        step="0.01"
                        value={cityDrafts[city.id]?.tax_rate ?? city.tax_rate}
                        onChange={(e) =>
                          setCityDrafts((prev) => ({
                            ...prev,
                            [city.id]: {
                              ...prev[city.id],
                              province_name: prev[city.id]?.province_name ?? city.province_name,
                              tax_name: prev[city.id]?.tax_name ?? city.tax_name,
                              tax_rate: Number(e.target.value || 0),
                            },
                          }))
                        }
                        placeholder="Tax rate"
                      />
                    </div>
                    <button className="mt-4 rounded-xl bg-brand-600 px-4 py-2 text-sm font-bold text-white hover:bg-brand-700" onClick={() => saveCityTax(city.id)}>
                      Save Tax Settings
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {!loading && activeTab === 'reports' && (
            <div>
              <h2 className="text-2xl font-black">Flagged Reports</h2>
              <p className="mt-2 text-base text-slate-600">Review ride reports, user reports, and system issues submitted by users.</p>

              {reportRows.length === 0 ? (
                <div className="mt-8 rounded-2xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-600">No reports submitted yet.</div>
              ) : (
                <div className="mt-8 overflow-x-auto">
                  <table className="min-w-full text-left">
                    <thead>
                      <tr className="border-b border-slate-200 text-sm font-bold">
                        <th className="px-3 py-4">Target</th>
                        <th className="px-3 py-4">Category</th>
                        <th className="px-3 py-4">Reporter</th>
                        <th className="px-3 py-4">Status</th>
                        <th className="px-3 py-4">Date</th>
                        <th className="px-3 py-4">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reportRows.map((report) => (
                        <tr key={report.id} className="border-b border-slate-200 text-sm">
                          <td className="px-3 py-4">
                            <div className="font-semibold capitalize">{report.target_type}</div>
                            <div className="text-xs text-slate-500">{report.reported_name || (report.target_type === 'system' ? 'System' : report.ride_id ? `Ride #${report.ride_id}` : '-')}</div>
                          </td>
                          <td className="px-3 py-4">
                            <div className="rounded-full bg-rose-600 px-3 py-1 text-xs font-bold text-white inline-flex">{report.category.split('_').join(' ')}</div>
                            <div className="mt-1 text-xs text-slate-500">{report.subject}</div>
                          </td>
                          <td className="px-3 py-4">{report.reporter_name}</td>
                          <td className="px-3 py-4">
                            <span className="rounded-full border border-slate-300 px-3 py-1 text-xs font-semibold capitalize">{report.status.split('_').join(' ')}</span>
                          </td>
                          <td className="px-3 py-4">{formatDate(report.created_at)}</td>
                          <td className="px-3 py-4">
                            <button
                              className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold hover:bg-slate-50"
                              onClick={() => {
                                setSelectedReport(report)
                                setReportStatus(report.status)
                                setReportNote(report.admin_note || '')
                              }}
                            >
                              Review
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </section>
      </main>

      {selectedReport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4" onClick={() => setSelectedReport(null)}>
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-3xl bg-white p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-2xl font-black">{selectedReport.subject}</div>
                <div className="mt-1 text-sm text-slate-600">
                  {selectedReport.reporter_name} reported {selectedReport.reported_name || (selectedReport.target_type === 'system' ? 'System' : selectedReport.target_type)}
                </div>
              </div>
              <button className="rounded-full border border-slate-300 bg-white p-2" onClick={() => setSelectedReport(null)}>
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-5 space-y-4">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                <div><b>Category:</b> {selectedReport.category.split('_').join(' ')}</div>
                <div><b>Target:</b> {selectedReport.target_type}</div>
                {selectedReport.ride_id ? <div><b>Ride:</b> #{selectedReport.ride_id}</div> : null}
                <div><b>Submitted:</b> {formatDate(selectedReport.created_at)}</div>
              </div>
              <div>
                <div className="mb-2 text-sm font-bold text-slate-700">Description</div>
                <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-700 whitespace-pre-wrap">{selectedReport.description}</div>
              </div>
              {selectedReport.attachment_url && (
                <div className="flex gap-3">
                  <button
                    className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold hover:bg-slate-50"
                    onClick={() => {
                      setSelectedDocument({ label: `Report #${selectedReport.id} attachment`, url: resolveDocumentUrl(selectedReport.attachment_url || '') })
                      setDocumentLoadFailed(false)
                    }}
                  >
                    View Attachment
                  </button>
                </div>
              )}
              <div>
                <label className="mb-2 block text-sm font-bold">Status</label>
                <select className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm" value={reportStatus} onChange={(e) => setReportStatus(e.target.value)}>
                  <option value="open">Open</option>
                  <option value="in_review">In Review</option>
                  <option value="resolved">Resolved</option>
                  <option value="dismissed">Dismissed</option>
                </select>
              </div>
              <div>
                <label className="mb-2 block text-sm font-bold">Admin Note</label>
                <textarea
                  rows={4}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                  value={reportNote}
                  onChange={(e) => setReportNote(e.target.value)}
                  placeholder="Add internal resolution notes"
                />
              </div>
              <div className="flex flex-col gap-3 sm:flex-row">
                <button className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-bold text-white hover:bg-brand-700" onClick={saveReportReview}>
                  Save Review
                </button>
                <button className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold hover:bg-slate-50" onClick={() => setSelectedReport(null)}>
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {selectedDocument && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm"
          onClick={() => setSelectedDocument(null)}
        >
          <div
            className="relative max-h-[92vh] w-full max-w-5xl overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b border-slate-200 bg-slate-50/80 px-6 py-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500">Document Preview</p>
                  <h3 className="mt-1 text-2xl font-black text-slate-900">{selectedDocument.label}</h3>
                </div>
                <div className="flex items-center gap-3">
                  <a
                    href={selectedDocument.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-100"
                  >
                    Open Original
                    <ExternalLink className="h-4 w-4" />
                  </a>
                  <button
                    type="button"
                    className="rounded-full border border-slate-300 bg-white p-2 text-slate-600 transition hover:bg-slate-100"
                    onClick={() => setSelectedDocument(null)}
                    aria-label="Close document preview"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
              </div>
            </div>
            <div className="bg-[radial-gradient(circle_at_top,_rgba(226,232,240,0.7),_rgba(248,250,252,1)_55%)] p-6">
              <div className="flex min-h-[300px] items-center justify-center overflow-hidden rounded-[1.5rem] border border-slate-200 bg-white shadow-inner sm:min-h-[420px]">
                {documentLoadFailed ? (
                  <div className="flex max-w-md flex-col items-center px-6 py-12 text-center">
                    <div className="mb-4 rounded-full bg-slate-100 p-4 text-slate-500">
                      <ImageOff className="h-8 w-8" />
                    </div>
                    <h4 className="text-lg font-bold text-slate-900">Preview unavailable</h4>
                    <p className="mt-2 text-sm leading-6 text-slate-600">
                      This file could not be rendered inside the dashboard. You can still open the original document in a new tab.
                    </p>
                    <a
                      href={selectedDocument.url}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-5 inline-flex items-center gap-2 rounded-full bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
                    >
                      Open Original
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  </div>
                ) : (
                  <img
                    src={selectedDocument.url}
                    alt={selectedDocument.label}
                    className="max-h-[75vh] w-full object-contain"
                    onError={() => setDocumentLoadFailed(true)}
                  />
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

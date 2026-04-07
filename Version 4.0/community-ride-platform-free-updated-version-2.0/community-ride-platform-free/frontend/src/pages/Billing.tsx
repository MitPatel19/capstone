import React, { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, CalendarDays, CreditCard, ReceiptText, ShieldCheck, Wallet } from 'lucide-react'
import { api, getRole } from '../api'
import { DriverTopBar } from '../components/DriverTopBar'
import { Button } from '../components/Button'
import { money } from '../utils'

type BillItem = { ride_id: number; description: string; amount: number }
type Bill = {
  id: number
  month: string
  period_key: string
  label: string
  period_start?: string | null
  period_end?: string | null
  subtotal: number
  tax_rate: number
  tax_name: string
  tax_amount: number
  total_due: number
  is_paid: boolean
  is_waived: boolean
  status: 'accruing' | 'due' | 'locked' | 'paid' | 'waived' | 'cleared'
  payable_now: boolean
  due_at?: string | null
  grace_expires_at?: string | null
  paid_at?: string | null
  waived_at?: string | null
  waiver_reason?: string
  currency: string
  city_name: string
  province_name: string
  items: BillItem[]
}
type Summary = {
  period_key: string
  label: string
  fee_per_ride: number
  completed_as_rider: number
  completed_as_driver: number
  subtotal: number
  tax_rate: number
  tax_name: string
  tax_amount: number
  total_due: number
  status: string
  city_name: string
  province_name: string
  currency: string
  is_free: boolean
  free_reason?: string
}
type BillingAccess = {
  status: 'current' | 'warning' | 'locked'
  message: string
  has_outstanding_bill: boolean
  has_locked_bill: boolean
  days_left?: number | null
  global_free_mode: boolean
  personal_free_access: boolean
  stripe_ready: boolean
}
type Declaration = {
  ride_id: number
  payer_user_id: number
  payer_name: string
  payee_user_id: number
  payee_name: string
  amount: number
  payment_method: string
  note: string
  declared_at?: string | null
  completed_at?: string | null
  route_label: string
  can_declare: boolean
  status: 'pending' | 'declared'
}

const PAYMENT_OPTIONS = [
  { value: 'cash', label: 'Cash' },
  { value: 'interac', label: 'Interac' },
  { value: 'etransfer', label: 'E-Transfer' },
  { value: 'card', label: 'Card' },
  { value: 'other', label: 'Other' },
]

function formatDate(iso?: string | null) {
  if (!iso) return '-'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toISOString().slice(0, 10)
}

function statusPill(status: string) {
  const map: Record<string, string> = {
    accruing: 'bg-slate-100 text-slate-700',
    due: 'bg-amber-100 text-amber-700',
    locked: 'bg-rose-100 text-rose-700',
    paid: 'bg-emerald-100 text-emerald-700',
    waived: 'bg-blue-100 text-blue-700',
    cleared: 'bg-slate-100 text-slate-700',
    pending: 'bg-amber-100 text-amber-700',
    declared: 'bg-emerald-100 text-emerald-700',
  }
  return map[status] ?? 'bg-slate-100 text-slate-700'
}

export default function Billing() {
  const role = getRole()
  const isDriver = role === 'driver'
  const declarationsRef = useRef<HTMLElement | null>(null)
  const [bill, setBill] = useState<Bill | null>(null)
  const [history, setHistory] = useState<Bill[]>([])
  const [summary, setSummary] = useState<Summary | null>(null)
  const [access, setAccess] = useState<BillingAccess | null>(null)
  const [declarations, setDeclarations] = useState<Declaration[]>([])
  const [formState, setFormState] = useState<Record<number, { payment_method: string; note: string; saving?: boolean }>>({})
  const [loading, setLoading] = useState(true)
  const [verifyingBillId, setVerifyingBillId] = useState<number | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setErr(null)
    try {
      const [billRes, historyRes, summaryRes, accessRes, declarationsRes] = await Promise.all([
        api.get('/billing/me'),
        api.get('/billing/history'),
        api.get('/billing/summary'),
        api.get('/billing/access'),
        api.get('/billing/declarations'),
      ])
      const currentBill = billRes.data as Bill
      const declarationRows = declarationsRes.data as Declaration[]
      setBill(currentBill)
      setHistory(historyRes.data as Bill[])
      setSummary(summaryRes.data as Summary)
      setAccess(accessRes.data as BillingAccess)
      setDeclarations(declarationRows)
      setFormState((prev) => {
        const next = { ...prev }
        declarationRows.forEach((row) => {
          next[row.ride_id] = {
            payment_method: next[row.ride_id]?.payment_method || (row.payment_method || '').toLowerCase().replace('-', ''),
            note: next[row.ride_id]?.note ?? row.note ?? '',
            saving: false,
          }
        })
        return next
      })
    } catch (error: any) {
      setErr(error?.response?.data?.detail ?? 'Unable to load billing information.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  async function startCheckout(billId: number) {
    setErr(null)
    setMsg(null)
    try {
      const res = await api.post(`/billing/${billId}/pay`)
      const checkoutUrl = res.data?.checkout_url
      if (!checkoutUrl) throw new Error('Stripe checkout URL was not returned.')
      window.location.href = checkoutUrl
    } catch (error: any) {
      setErr(error?.response?.data?.detail ?? error?.message ?? 'Unable to start Stripe checkout.')
    }
  }

  async function verifyPayment(billId: number) {
    setErr(null)
    setMsg(null)
    setVerifyingBillId(billId)
    try {
      await api.post(`/billing/${billId}/verify-payment`)
      setMsg('Stripe payment status checked successfully.')
      await load()
    } catch (error: any) {
      setErr(error?.response?.data?.detail ?? 'Unable to verify the Stripe payment yet.')
    } finally {
      setVerifyingBillId(null)
    }
  }

  async function saveDeclaration(rideId: number) {
    const state = formState[rideId]
    if (!state?.payment_method) {
      setErr('Select how the ride was paid before saving.')
      return
    }
    setErr(null)
    setMsg(null)
    setFormState((prev) => ({
      ...prev,
      [rideId]: { ...prev[rideId], saving: true },
    }))
    try {
      await api.post(`/billing/declarations/${rideId}`, {
        payment_method: state.payment_method,
        note: state.note,
      })
      setMsg('Ride payment declaration saved.')
      await load()
    } catch (error: any) {
      setErr(error?.response?.data?.detail ?? 'Unable to save payment declaration.')
    } finally {
      setFormState((prev) => ({
        ...prev,
        [rideId]: { ...prev[rideId], saving: false },
      }))
    }
  }

  const otherBills = useMemo(() => history.filter((row) => row.id !== bill?.id), [history, bill?.id])
  const openBills = useMemo(() => otherBills.filter((row) => row.payable_now), [otherBills])
  const billHistory = useMemo(() => otherBills.filter((row) => !row.payable_now || row.is_paid || row.is_waived), [otherBills])
  const pendingDeclarations = useMemo(() => declarations.filter((row) => row.status === 'pending'), [declarations])

  const content = (
    <div className="space-y-6">
      {!isDriver && pendingDeclarations.length > 0 && (
        <section className="rounded-3xl border border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50 p-4 sm:p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-xs font-bold uppercase tracking-[0.2em] text-amber-700">Action Needed</div>
              <h2 className="mt-2 text-xl font-black text-slate-900 sm:text-2xl">Declare Direct Ride Payments</h2>
              <p className="mt-2 text-sm text-slate-700">
                {pendingDeclarations.length} completed ride payment declaration{pendingDeclarations.length > 1 ? 's are' : ' is'} waiting for you.
                Tell the app how you paid the driver so the ride is fully recorded.
              </p>
            </div>
            <Button
              className="w-full sm:w-auto"
              onClick={() => declarationsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
            >
              Open Declaration Form
            </Button>
          </div>
        </section>
      )}

      <section className="grid gap-4 lg:grid-cols-3">
        <article className="rounded-3xl border border-slate-300 bg-white p-6 lg:col-span-2">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-3xl font-black">Bi-Weekly Billing</h1>
              <p className="mt-2 text-sm text-slate-600">
                Platform fees only. Ride amounts are paid directly between users and declared below.
              </p>
            </div>
            {summary && (
              <div className="rounded-2xl bg-slate-950 px-4 py-3 text-white">
                <div className="text-xs uppercase tracking-[0.2em] text-slate-300">Current Cycle</div>
                <div className="mt-2 text-2xl font-black">{money(summary.total_due)}</div>
                <div className="mt-1 text-xs text-slate-300">{summary.label}</div>
              </div>
            )}
          </div>

          {access && (
            <div
              className={[
                'mt-6 rounded-2xl border px-4 py-4 text-sm',
                access.status === 'locked'
                  ? 'border-rose-200 bg-rose-50 text-rose-800'
                  : access.status === 'warning'
                    ? 'border-amber-200 bg-amber-50 text-amber-800'
                    : 'border-emerald-200 bg-emerald-50 text-emerald-800',
              ].join(' ')}
            >
              <div className="flex items-start gap-3">
                {access.status === 'locked' || access.status === 'warning' ? (
                  <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
                ) : (
                  <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" />
                )}
                <div>
                  <div className="font-bold">
                    {access.global_free_mode
                      ? 'Global free mode is active'
                      : access.personal_free_access
                        ? 'Personal free access is active'
                        : access.status === 'locked'
                          ? 'Billing overdue'
                          : access.status === 'warning'
                            ? 'Payment reminder'
                            : 'Billing is current'}
                  </div>
                  <div className="mt-1">{access.message}</div>
                  {!access.stripe_ready && access.has_outstanding_bill && (
                    <div className="mt-2 text-xs font-semibold">
                      Stripe checkout is not configured yet on the server, so bills cannot be paid online yet.
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {bill && summary && (
            <>
              <div className="mt-6 grid gap-4 md:grid-cols-4">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Completed As Rider</div>
                  <div className="mt-2 text-3xl font-black">{summary.completed_as_rider}</div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Completed As Driver</div>
                  <div className="mt-2 text-3xl font-black">{summary.completed_as_driver}</div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Platform Fee</div>
                  <div className="mt-2 text-3xl font-black">{money(summary.fee_per_ride)}</div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Tax Rule</div>
                  <div className="mt-2 text-xl font-black">{summary.tax_name || 'Tax'}</div>
                  <div className="text-sm text-slate-600">
                    {(summary.city_name || 'Selected city') + (summary.province_name ? `, ${summary.province_name}` : '')}
                  </div>
                </div>
              </div>

              <div className="mt-6 overflow-x-auto rounded-2xl border border-slate-200">
                <table className="min-w-full text-left">
                  <thead className="bg-slate-50">
                    <tr className="text-sm font-bold text-slate-700">
                      <th className="px-4 py-3">Ride</th>
                      <th className="px-4 py-3">Description</th>
                      <th className="px-4 py-3">Fee</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bill.items.length === 0 ? (
                      <tr>
                        <td className="px-4 py-6 text-sm text-slate-500" colSpan={3}>
                          No completed rides have been billed in this cycle yet.
                        </td>
                      </tr>
                    ) : (
                      bill.items.map((item) => (
                        <tr key={`${bill.id}-${item.ride_id}-${item.description}`} className="border-t border-slate-200 text-sm">
                          <td className="px-4 py-3">#{item.ride_id}</td>
                          <td className="px-4 py-3">{item.description}</td>
                          <td className="px-4 py-3 font-semibold">{money(item.amount)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              <div className="mt-6 grid gap-4 md:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="text-sm font-bold text-slate-800">Cycle Details</div>
                  <div className="mt-3 space-y-2 text-sm text-slate-600">
                    <div className="flex items-center justify-between">
                      <span>Status</span>
                      <span className={`rounded-full px-3 py-1 text-xs font-bold ${statusPill(bill.status)}`}>{bill.status}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Period</span>
                      <span>{bill.label || bill.month}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Due date</span>
                      <span>{formatDate(bill.due_at)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Grace deadline</span>
                      <span>{formatDate(bill.grace_expires_at)}</span>
                    </div>
                    {bill.paid_at && (
                      <div className="flex items-center justify-between">
                        <span>Paid on</span>
                        <span>{formatDate(bill.paid_at)}</span>
                      </div>
                    )}
                    {bill.is_waived && (
                      <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-blue-800">
                        <div className="font-bold">Bill waived</div>
                        <div className="mt-1 text-xs">{bill.waiver_reason || summary.free_reason || 'Free access is enabled for this billing period.'}</div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-950 p-4 text-white">
                  <div className="flex items-center gap-2 text-sm font-semibold text-slate-300">
                    <Wallet className="h-4 w-4" />
                    Platform invoice
                  </div>
                  <div className="mt-4 space-y-3 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-300">Platform subtotal</span>
                      <span>{money(bill.subtotal)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-300">{bill.tax_name || 'Tax'} ({bill.tax_rate.toFixed(2)}%)</span>
                      <span>{money(bill.tax_amount)}</span>
                    </div>
                    <div className="border-t border-slate-800 pt-3">
                      <div className="flex items-center justify-between text-xl font-black">
                        <span>Total due</span>
                        <span>{money(bill.total_due)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </article>

        <div className="space-y-4">
          <article className="rounded-3xl border border-slate-300 bg-white p-5">
            <div className="flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-brand-600" />
              <h2 className="text-xl font-black">Open Bills</h2>
            </div>
            <div className="mt-4 space-y-3">
              {openBills.length === 0 ? (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                  No closed bills are waiting for payment right now.
                </div>
              ) : (
                openBills.map((row) => (
                  <div key={row.id} className="rounded-2xl border border-slate-200 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="font-bold">{row.label || row.month}</div>
                        <div className="mt-1 text-xs text-slate-500">{row.city_name ? `${row.city_name}, ${row.province_name}` : 'City tax snapshot applied'}</div>
                      </div>
                      <span className={`rounded-full px-3 py-1 text-xs font-bold ${statusPill(row.status)}`}>{row.status}</span>
                    </div>
                    <div className="mt-3 text-2xl font-black">{money(row.total_due)}</div>
                    <div className="mt-1 text-xs text-slate-500">Due {formatDate(row.due_at)}{row.grace_expires_at ? ` | Grace ends ${formatDate(row.grace_expires_at)}` : ''}</div>
                    <div className="mt-4 grid gap-2">
                      <Button
                        className="w-full"
                        onClick={() => startCheckout(row.id)}
                        disabled={!access?.stripe_ready}
                      >
                        Pay With Stripe
                      </Button>
                      <Button
                        className="w-full"
                        variant="ghost"
                        onClick={() => verifyPayment(row.id)}
                        disabled={!access?.stripe_ready || verifyingBillId === row.id}
                      >
                        {verifyingBillId === row.id ? 'Checking Stripe...' : 'Check Payment'}
                      </Button>
                    </div>
                    <div className="mt-2 text-xs text-slate-500">
                      Use Check Payment if Stripe already charged you but you came back later without the confirmation page.
                    </div>
                  </div>
                ))
              )}
            </div>
          </article>

          <article className="rounded-3xl border border-slate-300 bg-white p-5">
            <div className="flex items-center gap-2">
              <ReceiptText className="h-5 w-5 text-brand-600" />
              <h2 className="text-xl font-black">Billing History</h2>
            </div>
            <div className="mt-4 space-y-3">
              {billHistory.length === 0 ? (
                <div className="text-sm text-slate-500">No earlier bi-weekly billing periods yet.</div>
              ) : (
                billHistory.map((row) => (
                  <div key={row.id} className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 px-4 py-3 text-sm">
                    <div>
                      <div className="font-semibold">{row.label || row.month}</div>
                      <div className="text-xs text-slate-500">
                        {row.is_paid ? `Paid ${formatDate(row.paid_at)}` : row.is_waived ? 'Waived' : row.status}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold">{money(row.total_due)}</div>
                      <span className={`mt-1 inline-flex rounded-full px-3 py-1 text-xs font-bold ${statusPill(row.status)}`}>{row.status}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </article>
        </div>
      </section>

      <section ref={declarationsRef} className="rounded-3xl border border-slate-300 bg-white p-4 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-black">{isDriver ? 'Direct Ride Payment Declarations' : 'Declare Direct Ride Payments'}</h2>
            <p className="mt-2 text-sm text-slate-600">
              {isDriver
                ? 'Drivers can review how riders said they paid for completed rides outside the platform.'
                : 'After each completed ride, declare whether you paid the driver by cash, Interac, e-transfer, card, or another method.'}
            </p>
          </div>
          {!isDriver && pendingDeclarations.length > 0 && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              {pendingDeclarations.length} ride payment declaration{pendingDeclarations.length > 1 ? 's' : ''} still pending.
            </div>
          )}
        </div>

        <div className="mt-6 space-y-4">
          {declarations.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-600">
              No completed rides need a payment declaration right now.
            </div>
          ) : (
            declarations.map((row) => (
              <article key={`${row.ride_id}-${row.payer_user_id}`} className="rounded-2xl border border-slate-200 p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <CalendarDays className="h-4 w-4 text-slate-500" />
                      <span className="text-sm text-slate-500">{formatDate(row.completed_at)}</span>
                    </div>
                    <div className="mt-2 text-xl font-black">{row.route_label || `Ride #${row.ride_id}`}</div>
                    <div className="mt-1 text-sm text-slate-600">
                      {isDriver ? `${row.payer_name} said they paid ${row.payee_name}` : `You paid ${row.payee_name}`}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-black">{money(row.amount)}</div>
                    <span className={`mt-2 inline-flex rounded-full px-3 py-1 text-xs font-bold ${statusPill(row.status)}`}>{row.status}</span>
                  </div>
                </div>

                {isDriver ? (
                  <div className="mt-4 grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 md:grid-cols-3">
                    <div>
                      <div className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Payer</div>
                      <div className="mt-2 text-sm font-semibold">{row.payer_name}</div>
                    </div>
                    <div>
                      <div className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Method</div>
                      <div className="mt-2 text-sm font-semibold">{row.payment_method || 'Not declared yet'}</div>
                    </div>
                    <div>
                      <div className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Declared</div>
                      <div className="mt-2 text-sm font-semibold">{formatDate(row.declared_at)}</div>
                    </div>
                    {row.note && (
                      <div className="md:col-span-3">
                        <div className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Note</div>
                        <div className="mt-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">{row.note}</div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="mt-4 grid gap-3 md:grid-cols-[220px,1fr,140px]">
                    <select
                      className="min-h-[44px] rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-200"
                      value={formState[row.ride_id]?.payment_method ?? ''}
                      onChange={(event) =>
                        setFormState((prev) => ({
                          ...prev,
                          [row.ride_id]: {
                            ...prev[row.ride_id],
                            payment_method: event.target.value,
                            note: prev[row.ride_id]?.note ?? row.note ?? '',
                          },
                        }))
                      }
                    >
                      <option value="">Select payment method</option>
                      {PAYMENT_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <input
                      className="min-h-[44px] rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-200"
                      placeholder="Optional note for admin or driver"
                      value={formState[row.ride_id]?.note ?? ''}
                      onChange={(event) =>
                        setFormState((prev) => ({
                          ...prev,
                          [row.ride_id]: {
                            ...prev[row.ride_id],
                            payment_method: prev[row.ride_id]?.payment_method ?? '',
                            note: event.target.value,
                          },
                        }))
                      }
                    />
                    <Button
                      className="w-full md:w-auto"
                      onClick={() => saveDeclaration(row.ride_id)}
                      disabled={!!formState[row.ride_id]?.saving}
                    >
                      {formState[row.ride_id]?.saving ? 'Saving...' : row.status === 'declared' ? 'Update' : 'Declare'}
                    </Button>
                  </div>
                )}
              </article>
            ))
          )}
        </div>
      </section>

      {(msg || err) && (
        <section className="space-y-3">
          {msg && <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{msg}</div>}
          {err && <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{err}</div>}
        </section>
      )}
    </div>
  )

  if (loading) {
    const loadingView = <div className="rounded-3xl border border-slate-200 bg-white p-6 text-sm text-slate-600">Loading billing...</div>
    if (isDriver) {
      return (
        <div className="min-h-screen bg-slate-100 text-slate-900">
          <DriverTopBar />
          <main className="mx-auto w-full max-w-6xl px-4 py-8">{loadingView}</main>
        </div>
      )
    }
    return loadingView
  }

  if (isDriver) {
    return (
      <div className="min-h-screen bg-slate-100 text-slate-900">
        <DriverTopBar />
        <main className="mx-auto w-full max-w-6xl px-4 py-8">{content}</main>
      </div>
    )
  }

  return content
}

import React, { useEffect, useState } from 'react'
import { api } from '../api'
import { Card, CardContent, CardHeader } from '../components/Card'
import { Button } from '../components/Button'
import { Input, Label } from '../components/Input'

type Pending = { driver_id:number; name:string; email:string; phone:string; age:number; submitted:string }
type User = { id:number; role:string; name:string; email:string; status:string; age:number; is_student:boolean }

export default function AdminDashboard() {
  const [pending, setPending] = useState<Pending[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [fee, setFee] = useState<number>(0.5)
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState<string|null>(null)

  async function load() {
    setLoading(true)
    const p = await api.get('/admin/drivers/pending')
    const u = await api.get('/admin/users')
    const f = await api.get('/admin/fee')
    setPending(p.data)
    setUsers(u.data)
    setFee(f.data.fee_per_ride)
    setLoading(false)
  }
  useEffect(()=>{ load() }, [])

  async function saveFee() {
    setMsg(null)
    await api.post('/admin/fee', { fee_per_ride: fee })
    setMsg('Fee saved ✅')
    await load()
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="text-3xl font-black">Admin Dashboard</div>
        <div className="text-sm text-slate-600">Approve drivers, manage users, and adjust platform fees.</div>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-1">
          <CardHeader><div className="font-bold">Platform Fee Settings</div></CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label>Fee per ride (applies to both Rider & Driver)</Label>
              <Input type="number" step="0.01" value={fee} onChange={e=>setFee(parseFloat(e.target.value||'0'))} />
            </div>
            <Button onClick={saveFee}>Save</Button>
            {msg && <div className="text-sm text-emerald-700">{msg}</div>}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader><div className="font-bold">Pending Driver Approvals</div></CardHeader>
          <CardContent>
            {loading ? <div className="text-sm text-slate-600">Loading…</div> : pending.length===0 ? <div className="text-sm text-slate-600">No pending drivers.</div> : (
              <div className="space-y-3">
                {pending.map(d => (
                  <div key={d.driver_id} className="rounded-2xl border border-slate-200 bg-white p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="font-black">{d.name} <span className="text-slate-500 font-semibold">({d.age})</span></div>
                        <div className="text-sm text-slate-600">{d.email} · {d.phone}</div>
                      </div>
                      <div className="flex gap-2">
                        <Button variant="secondary" onClick={async()=>{ await api.post(`/admin/drivers/${d.driver_id}/approve`); await load() }}>Approve</Button>
                        <Button variant="danger" onClick={async()=>{ await api.post(`/admin/drivers/${d.driver_id}/reject`); await load() }}>Reject</Button>
                      </div>
                    </div>
                    <div className="text-xs text-slate-500 mt-2">Submitted: {d.submitted}</div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><div className="font-bold">User Management</div></CardHeader>
        <CardContent>
          {loading ? <div className="text-sm text-slate-600">Loading…</div> : (
            <div className="overflow-auto">
              <table className="min-w-full text-sm">
                <thead className="text-left text-slate-600">
                  <tr>
                    <th className="py-2 pr-4">ID</th>
                    <th className="py-2 pr-4">Name</th>
                    <th className="py-2 pr-4">Email</th>
                    <th className="py-2 pr-4">Role</th>
                    <th className="py-2 pr-4">Status</th>
                    <th className="py-2 pr-4"></th>
                  </tr>
                </thead>
                <tbody>
                  {users.map(u => (
                    <tr key={u.id} className="border-t border-slate-100">
                      <td className="py-2 pr-4">{u.id}</td>
                      <td className="py-2 pr-4">{u.name}</td>
                      <td className="py-2 pr-4">{u.email}</td>
                      <td className="py-2 pr-4 capitalize">{u.role}</td>
                      <td className="py-2 pr-4 capitalize">{u.status}</td>
                      <td className="py-2 pr-4">
                        {u.status === 'active'
                          ? <Button variant="ghost" onClick={async()=>{ await api.post(`/admin/users/${u.id}/disable`); await load() }}>Disable</Button>
                          : <Button variant="ghost" onClick={async()=>{ await api.post(`/admin/users/${u.id}/enable`); await load() }}>Enable</Button>
                        }
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="mt-4">
            <Button variant="ghost" onClick={load}>Refresh</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

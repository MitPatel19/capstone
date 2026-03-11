import React, { useEffect, useMemo, useState } from 'react'
import { api, getRole } from '../api'
import { Card, CardContent, CardHeader } from '../components/Card'
import { Input, Label } from '../components/Input'
import { Button } from '../components/Button'

type Profile = {
  id:number; role:'rider'|'driver'|'admin'; name:string; email:string; phone:string;
  default_address:string; avatar_url:string; member_since:string;
  rating_avg:number; rating_count:number;
}
type RiderStats = { total_rides:number; rides_this_month:number; favorite_route:string }
type DriverDocs = { approval_status:string; reviewed_at?:string|null; review_note:string; docs_status:string; docs_updated_at?:string|null }

function initials(name: string) {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return 'U'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export default function Profile() {
  const role = getRole()
  const [p, setP] = useState<Profile|null>(null)
  const [stats, setStats] = useState<RiderStats|null>(null)
  const [docs, setDocs] = useState<DriverDocs|null>(null)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<string|null>(null)

  const [form, setForm] = useState({ name:'', phone:'', default_address:'' })
  const [pw, setPw] = useState({ current_password:'', new_password:'' })

  const avatarSrc = useMemo(() => {
    if (!p?.avatar_url) return ''
    // backend serves uploads at /uploads
    const base = (import.meta.env.VITE_API_BASE ?? 'http://localhost:8000').replace(/\/$/, '')
    return base + p.avatar_url
  }, [p?.avatar_url])

  async function load() {
    const me = await api.get('/auth/me')
    setP(me.data)
    setForm({ name: me.data.name || '', phone: me.data.phone || '', default_address: me.data.default_address || '' })

    if (me.data.role === 'rider') {
      try { const s = await api.get('/auth/rider_stats'); setStats(s.data) } catch {}
      setDocs(null)
    } else if (me.data.role === 'driver') {
      try { const d = await api.get('/auth/driver_docs'); setDocs(d.data) } catch {}
      setStats(null)
    } else {
      setStats(null); setDocs(null)
    }
  }

  useEffect(()=>{ load() }, [])

  async function saveProfile() {
    setSaving(true); setMsg(null)
    try {
      const res = await api.put('/auth/me', form)
      setP(res.data)
      setMsg('Saved ✅')
      setTimeout(()=>setMsg(null), 2500)
    } finally {
      setSaving(false)
    }
  }

  async function changePassword() {
    setSaving(true); setMsg(null)
    try {
      await api.post('/auth/change_password', pw)
      setPw({ current_password:'', new_password:'' })
      setMsg('Password updated ✅')
      setTimeout(()=>setMsg(null), 2500)
    } finally { setSaving(false) }
  }

  async function uploadAvatar(file: File) {
    const fd = new FormData()
    fd.append('file', file)
    await api.post('/auth/avatar', fd, { headers: { 'Content-Type': 'multipart/form-data' }})
    await load()
  }

  async function removeAvatar() {
    await api.delete('/auth/avatar')
    await load()
  }

  async function updateDriverDocs(files: {license?:File; id?:File; insurance?:File}) {
    const fd = new FormData()
    if (files.license) fd.append('license_file', files.license)
    if (files.id) fd.append('id_file', files.id)
    if (files.insurance) fd.append('insurance_file', files.insurance)
    await api.post('/auth/driver_documents', fd, { headers: { 'Content-Type': 'multipart/form-data' }})
    await load()
    setMsg('Documents submitted for admin review ✅')
    setTimeout(()=>setMsg(null), 2500)
  }

  if (!p) return <div className="text-sm text-slate-600">Loading profile…</div>

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <div className="text-3xl font-black">Profile</div>
          <div className="text-sm text-slate-600">Update your personal details</div>
        </div>
        {msg && <div className="text-sm rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-emerald-800">{msg}</div>}
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        {/* Left column */}
        <div className="space-y-4">
          <Card>
            <CardContent className="p-6 flex flex-col items-center text-center gap-3">
              <div className="relative">
                {avatarSrc ? (
                  <img src={avatarSrc} alt="avatar" className="h-40 w-40 rounded-full object-cover border border-slate-200" />
                ) : (
                  <div className="h-40 w-40 rounded-full bg-gradient-to-br from-brand-500 to-emerald-500 flex items-center justify-center text-white text-5xl font-black">
                    {initials(p.name)}
                  </div>
                )}
                <label className="absolute bottom-2 right-2 cursor-pointer rounded-xl bg-white border border-slate-200 px-3 py-2 text-xs font-semibold shadow-sm hover:bg-slate-50">
                  Change
                  <input type="file" accept="image/*" className="hidden" onChange={(e)=>{ const f=e.target.files?.[0]; if (f) uploadAvatar(f) }} />
                </label>
              </div>

              {avatarSrc && <button className="text-xs font-semibold text-rose-600 hover:underline" onClick={removeAvatar}>Remove photo</button>}

              <div className="flex items-center gap-2 mt-2">
                <span className="text-2xl">⭐</span>
                <div className="text-sm font-semibold">{p.rating_avg.toFixed(1)} <span className="text-slate-500">({p.rating_count})</span></div>
              </div>

              <div className="w-full rounded-2xl bg-slate-50 border border-slate-200 p-4">
                <div className="text-xs text-slate-600">Member since</div>
                <div className="font-black">{p.member_since || '—'}</div>
              </div>
            </CardContent>
          </Card>

          {p.role === 'rider' && (
            <Card>
              <CardHeader><div className="font-bold">Ride Statistics</div></CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-sm text-slate-600">Total rides</div>
                  <div className="font-black text-xl">{stats?.total_rides ?? 0}</div>
                </div>
                <div className="flex items-center justify-between">
                  <div className="text-sm text-slate-600">This month (completed)</div>
                  <div className="font-black text-xl">{stats?.rides_this_month ?? 0}</div>
                </div>
                <div>
                  <div className="text-sm text-slate-600">Favorite route</div>
                  <div className="font-semibold mt-1">{stats?.favorite_route ?? '—'}</div>
                </div>
                <div className="text-xs text-slate-500">Favorite route updates automatically from completed rides.</div>
              </CardContent>
            </Card>
          )}

          {p.role === 'driver' && (
            <Card>
              <CardHeader><div className="font-bold">Documents & Verification</div></CardHeader>
              <CardContent className="space-y-3">
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="text-sm text-slate-600">Admin approval</div>
                  <div className="font-black capitalize">{docs?.approval_status?.replaceAll('_',' ') ?? '—'}</div>
                  {docs?.review_note && <div className="text-xs text-slate-500 mt-1">{docs.review_note}</div>}
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="text-sm text-slate-600">Document status</div>
                  <div className="font-black capitalize">{docs?.docs_status?.replaceAll('_',' ') ?? '—'}</div>
                  {docs?.docs_updated_at && <div className="text-xs text-slate-500 mt-1">Last submitted: {new Date(docs.docs_updated_at).toLocaleString()}</div>}
                </div>

                <div className="text-xs text-slate-500">Upload new documents if anything changes. Admin will review and re-approve.</div>

                <div className="grid gap-2">
                  <label className="text-sm font-semibold">Driver License</label>
                  <Input type="file" onChange={(e)=>{ const f=e.target.files?.[0]; (window as any)._lic=f }} />
                  <label className="text-sm font-semibold">ID</label>
                  <Input type="file" onChange={(e)=>{ const f=e.target.files?.[0]; (window as any)._id=f }} />
                  <label className="text-sm font-semibold">Insurance</label>
                  <Input type="file" onChange={(e)=>{ const f=e.target.files?.[0]; (window as any)._ins=f }} />
                  <Button variant="secondary" onClick={()=>updateDriverDocs({ license:(window as any)._lic, id:(window as any)._id, insurance:(window as any)._ins })}>
                    Submit for Review
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right column */}
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader><div className="font-bold">Profile Information</div></CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Full Name</Label>
                <Input value={form.name} onChange={e=>setForm(v=>({...v, name:e.target.value}))} />
              </div>
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <Label>Email</Label>
                  <Input value={p.email} disabled />
                </div>
                <div>
                  <Label>Phone Number</Label>
                  <Input value={form.phone} onChange={e=>setForm(v=>({...v, phone:e.target.value}))} />
                </div>
              </div>

              {p.role !== 'admin' && (
                <div>
                  <Label>Default Address</Label>
                  <Input value={form.default_address} onChange={e=>setForm(v=>({...v, default_address:e.target.value}))} />
                </div>
              )}

              <div className="flex gap-2">
                <Button onClick={saveProfile} disabled={saving}>Save Changes</Button>
                <Button variant="ghost" onClick={load}>Cancel</Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><div className="font-bold">Password & Security</div></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <Label>Current Password</Label>
                  <Input type="password" value={pw.current_password} onChange={e=>setPw(v=>({...v, current_password:e.target.value}))} placeholder="••••••••" />
                </div>
                <div>
                  <Label>New Password</Label>
                  <Input type="password" value={pw.new_password} onChange={e=>setPw(v=>({...v, new_password:e.target.value}))} placeholder="••••••••" />
                </div>
              </div>
              <Button variant="secondary" onClick={changePassword} disabled={saving || !pw.current_password || !pw.new_password}>
                Change Password
              </Button>
              <div className="text-xs text-slate-500">Tip: If you changed the backend hashing (PBKDF2), delete old app.db to reset demo users.</div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

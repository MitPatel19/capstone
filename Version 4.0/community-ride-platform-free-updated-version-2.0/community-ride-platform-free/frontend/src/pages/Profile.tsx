import React, { useEffect, useState } from 'react'
import { AlertTriangle, Mail, MapPin, Phone, Star, UserRound } from 'lucide-react'
import { api, getRole } from '../api'
import { Card, CardContent, CardHeader } from '../components/Card'
import { Input, Label } from '../components/Input'
import { Button } from '../components/Button'
import { DriverTopBar } from '../components/DriverTopBar'

type Profile = {
  id: number
  role: 'rider' | 'driver' | 'admin'
  name: string
  email: string
  phone: string
  default_address: string
  member_since: string
  rating_avg: number
  rating_count: number
  vehicle_details?: string
}
type City = { id: number; name: string; is_active: boolean }
type DriverCity = {
  approved_city_id?: number | null
  approved_city_name?: string
  pending_city_id?: number | null
  pending_city_name?: string
  approval_status?: string
}
type DriverDocs = {
  approval_status: string
  review_note: string
  docs_status: string
  license_expiry_date?: string | null
  license_expiry_status?: string
  license_expiry_source?: string
}
type RiderDefaults = { pickup_text: string; dropoff_text: string; updated_at?: string | null }

function initials(name: string) {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return 'U'
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase()
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
}

export default function Profile() {
  const role = getRole()
  const isDriver = role === 'driver'

  const [p, setP] = useState<Profile | null>(null)
  const [riderDefaults, setRiderDefaults] = useState<RiderDefaults>({ pickup_text: '', dropoff_text: '' })
  const [msg, setMsg] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const [form, setForm] = useState({ name: '', phone: '', default_address: '', vehicle_details: '' })
  const [pw, setPw] = useState({ current_password: '', new_password: '' })

  const [cities, setCities] = useState<City[]>([])
  const [selectedRiderCityId, setSelectedRiderCityId] = useState<number>(0)
  const [riderCity, setRiderCity] = useState<DriverCity | null>(null)
  const [driverCity, setDriverCity] = useState<DriverCity | null>(null)
  const [selectedCityId, setSelectedCityId] = useState<number>(0)
  const [driverDocs, setDriverDocs] = useState<DriverDocs | null>(null)
  const [licenseFile, setLicenseFile] = useState<File | null>(null)
  const [licenseExpiryDate, setLicenseExpiryDate] = useState('')
  const [idFile, setIdFile] = useState<File | null>(null)
  const [insuranceFile, setInsuranceFile] = useState<File | null>(null)

  async function load() {
    const me = await api.get('/auth/me')
    setP(me.data)
    setForm({
      name: me.data.name || '',
      phone: me.data.phone || '',
      default_address: me.data.default_address || '',
      vehicle_details: me.data.vehicle_details || '',
    })

    if (me.data.role === 'rider') {
      try {
        const [cityList, defaults, currentCity] = await Promise.all([api.get('/auth/cities'), api.get('/auth/rider_defaults'), api.get('/auth/rider_city')])
        setCities(cityList.data)
        setRiderDefaults({
          pickup_text: defaults.data?.pickup_text || '',
          dropoff_text: defaults.data?.dropoff_text || '',
          updated_at: defaults.data?.updated_at || null,
        })
        setRiderCity(currentCity.data)
        setSelectedRiderCityId(currentCity.data.pending_city_id || currentCity.data.approved_city_id || 0)
      } catch {
        setCities([])
        setRiderDefaults({ pickup_text: '', dropoff_text: '' })
        setRiderCity(null)
        setSelectedRiderCityId(0)
      }
    }

    if (me.data.role === 'driver') {
      try {
        const [cityList, currentCity, docs] = await Promise.all([api.get('/auth/cities'), api.get('/auth/driver_city'), api.get('/auth/driver_docs')])
        setCities(cityList.data)
        setDriverCity(currentCity.data)
        setSelectedCityId(currentCity.data.pending_city_id || currentCity.data.approved_city_id || 0)
        setDriverDocs(docs.data)
        setLicenseExpiryDate(docs.data?.license_expiry_date || '')
      } catch {
        setCities([])
        setDriverCity(null)
        setDriverDocs(null)
        setLicenseExpiryDate('')
      }
    }
  }

  useEffect(() => {
    load()
  }, [])

  async function saveProfile() {
    setSaving(true)
    setMsg(null)
    try {
      const res = await api.put('/auth/me', form)
      setP(res.data)
      setMsg('Profile saved.')
    } finally {
      setSaving(false)
    }
  }

  async function saveRiderDefaults() {
    setSaving(true)
    setMsg(null)
    try {
      const res = await api.put('/auth/rider_defaults', riderDefaults)
      setRiderDefaults({
        pickup_text: res.data?.pickup_text || '',
        dropoff_text: res.data?.dropoff_text || '',
        updated_at: res.data?.updated_at || null,
      })
      setMsg('Default route saved.')
    } finally {
      setSaving(false)
    }
  }

  async function changePassword() {
    setSaving(true)
    setMsg(null)
    try {
      await api.post('/auth/change_password', pw)
      setPw({ current_password: '', new_password: '' })
      setMsg('Password updated.')
    } finally {
      setSaving(false)
    }
  }

  async function submitDriverCity() {
    if (!selectedCityId) return
    setSaving(true)
    setMsg(null)
    try {
      const res = await api.post('/auth/driver_city', { city_id: selectedCityId })
      setDriverCity(res.data)
      setMsg('City submitted for admin approval.')
    } catch (e: any) {
      setMsg(e?.response?.data?.detail ?? 'Unable to submit city change right now.')
    } finally {
      setSaving(false)
    }
  }

  async function submitRiderCity() {
    if (!selectedRiderCityId) return
    setSaving(true)
    setMsg(null)
    try {
      const selectedCity = cities.find((c) => c.id === selectedRiderCityId)
      const res = await api.post('/auth/rider_city', { city_id: selectedRiderCityId })
      setRiderCity(res.data)
      if (selectedCity) setForm((v) => ({ ...v, default_address: selectedCity.name }))
      setMsg('City submitted for admin approval.')
    } catch (e: any) {
      setMsg(e?.response?.data?.detail ?? 'Unable to submit city change right now.')
    } finally {
      setSaving(false)
    }
  }

  async function submitDriverDocuments() {
    if (!licenseFile && !idFile && !insuranceFile) return
    setSaving(true)
    setMsg(null)
    try {
      const fd = new FormData()
      if (licenseFile) {
        if (!licenseExpiryDate) throw new Error('Please enter the driver license expiry date')
        fd.append('license_file', licenseFile)
        fd.append('license_expiry_date', licenseExpiryDate)
      }
      if (idFile) fd.append('id_file', idFile)
      if (insuranceFile) fd.append('insurance_file', insuranceFile)
      await api.post('/auth/driver_documents', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      setLicenseFile(null)
      setIdFile(null)
      setInsuranceFile(null)
      setMsg('Documents submitted for admin approval.')
      await load()
    } catch (e: any) {
      setMsg(e?.response?.data?.detail ?? e?.message ?? 'Unable to submit documents.')
    } finally {
      setSaving(false)
    }
  }

  function body() {
    if (!p) return <div className="text-sm text-slate-600">Loading profile...</div>

    return (
      <div className="space-y-4">
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div>
            <div className="text-3xl font-black">Profile Information</div>
            <div className="text-sm text-slate-600">Update your personal details</div>
          </div>
          {msg && <div className="text-sm rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-emerald-800">{msg}</div>}
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <div className="space-y-4">
            <Card>
              <CardContent className="p-6 text-center">
                <div className="mx-auto flex h-32 w-32 items-center justify-center rounded-full bg-gradient-to-b from-blue-400 to-blue-600 text-5xl font-black text-white">
                  {initials(p.name)}
                </div>
                <div className="mt-4 text-3xl font-black">{p.name}</div>
                <div className="mt-2 inline-flex items-center gap-2 text-amber-500">
                  <Star className="h-5 w-5 fill-amber-500" />
                  <span className="text-2xl font-semibold">{p.rating_avg.toFixed(1)}</span>
                  <span className="text-base text-slate-600">{isDriver ? 'Rider Rating' : `(${p.rating_count})`}</span>
                </div>
                <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-100 p-4">
                  <div className="text-base text-slate-600">Member since</div>
                  <div className="text-2xl font-bold">{p.member_since || '-'}</div>
                </div>
              </CardContent>
            </Card>

            {isDriver ? (
              <Card>
                <CardHeader>
                  <div className="font-bold">Update Documents</div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {driverDocs?.license_expiry_status === 'expired' && (
                    <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
                      <div className="flex items-start gap-3">
                        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
                        <div>
                          <div className="font-bold">Driver license expired</div>
                          <div className="mt-1">
                            Your recorded driver license expired on <b>{driverDocs.license_expiry_date || '-'}</b>. Upload an updated license to stay compliant.
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
                    <div>
                      Driver approval: <b className="capitalize">{(driverDocs?.approval_status || '-').split('_').join(' ')}</b>
                    </div>
                    <div>
                      Documents status: <b className="capitalize">{(driverDocs?.docs_status || '-').split('_').join(' ')}</b>
                    </div>
                    <div>
                      License expiry: <b>{driverDocs?.license_expiry_date || '-'}</b>
                      {driverDocs?.license_expiry_status ? ` (${driverDocs.license_expiry_status.split('_').join(' ')})` : ''}
                    </div>
                    {driverDocs?.review_note && <div className="mt-1 text-xs text-slate-600">{driverDocs.review_note}</div>}
                  </div>
                  <div>
                    <Label>Driver License</Label>
                    <Input type="file" onChange={(e) => setLicenseFile(e.target.files?.[0] ?? null)} />
                  </div>
                  <div>
                    <Label>License Expiry Date</Label>
                    <Input type="date" value={licenseExpiryDate} onChange={(e) => setLicenseExpiryDate(e.target.value)} />
                  </div>
                  <div>
                    <Label>Government ID</Label>
                    <Input type="file" onChange={(e) => setIdFile(e.target.files?.[0] ?? null)} />
                  </div>
                  <div>
                    <Label>Insurance Certificate</Label>
                    <Input type="file" onChange={(e) => setInsuranceFile(e.target.files?.[0] ?? null)} />
                  </div>
                  <button
                    type="button"
                    className="w-full rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                    onClick={submitDriverDocuments}
                    disabled={saving || (!licenseFile && !idFile && !insuranceFile)}
                  >
                    Submit Documents for Approval
                  </button>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardHeader>
                  <div className="font-bold">Default Route</div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <Label>Default Pickup</Label>
                    <Input value={riderDefaults.pickup_text} onChange={(e) => setRiderDefaults((v) => ({ ...v, pickup_text: e.target.value }))} placeholder="Enter default pickup location" />
                  </div>
                  <div>
                    <Label>Default Drop-off</Label>
                    <Input value={riderDefaults.dropoff_text} onChange={(e) => setRiderDefaults((v) => ({ ...v, dropoff_text: e.target.value }))} placeholder="Enter default drop-off location" />
                  </div>
                  <button
                    type="button"
                    className="w-full rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                    onClick={saveRiderDefaults}
                    disabled={saving}
                  >
                    Save Default Route
                  </button>
                </CardContent>
              </Card>
            )}
          </div>

          <div className="space-y-4 lg:col-span-2">
            <Card>
              <CardHeader>
                <div className="font-bold">Profile Information</div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label>Full Name</Label>
                  <div className="relative">
                    <UserRound className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                    <Input className="pl-10" value={form.name} onChange={(e) => setForm((v) => ({ ...v, name: e.target.value }))} />
                  </div>
                </div>
                <div>
                  <Label>Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                    <Input className="pl-10" value={p.email} disabled />
                  </div>
                </div>
                <div>
                  <Label>Phone Number</Label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                    <Input className="pl-10" value={form.phone} onChange={(e) => setForm((v) => ({ ...v, phone: e.target.value }))} />
                  </div>
                </div>
                {isDriver && (
                  <div>
                    <Label>Vehicle Details</Label>
                    <Input value={form.vehicle_details} onChange={(e) => setForm((v) => ({ ...v, vehicle_details: e.target.value }))} placeholder="Toyota Camry - ABC 123" />
                  </div>
                )}

                {isDriver ? (
                  <div>
                    <Label>City Selection</Label>
                    <div className="relative">
                      <MapPin className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                      <select
                        className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-10 pr-3 text-sm outline-none focus:ring-2 focus:ring-brand-200"
                        value={selectedCityId}
                        onChange={(e) => setSelectedCityId(Number(e.target.value))}
                      >
                        <option value={0}>Select city</option>
                        {cities.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="mt-2 text-xs text-slate-600">
                      Approved city: <b>{driverCity?.approved_city_name || '-'}</b>
                      {driverCity?.approval_status === 'pending' && driverCity?.pending_city_name ? ` | Pending: ${driverCity.pending_city_name}` : ''}
                    </div>
                    <button
                      className="mt-3 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                      onClick={submitDriverCity}
                      disabled={saving || !selectedCityId}
                      type="button"
                    >
                      Submit City for Approval
                    </button>
                  </div>
                ) : (
                  <div>
                    <Label>City Selection</Label>
                    <div className="relative">
                      <MapPin className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                      <select
                        className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-10 pr-3 text-sm outline-none focus:ring-2 focus:ring-brand-200"
                        value={selectedRiderCityId}
                        onChange={(e) => setSelectedRiderCityId(Number(e.target.value))}
                      >
                        <option value={0}>Select city</option>
                        {cities.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="mt-2 text-xs text-slate-600">
                      Approved city: <b>{riderCity?.approved_city_name || '-'}</b>
                      {riderCity?.approval_status === 'pending' && riderCity?.pending_city_name ? ` | Pending: ${riderCity.pending_city_name}` : ''}
                    </div>
                    <button
                      className="mt-3 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                      onClick={submitRiderCity}
                      disabled={saving || !selectedRiderCityId}
                      type="button"
                    >
                      Submit City for Approval
                    </button>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="font-bold">Password and Security</div>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button variant="ghost">Change Password</Button>
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <Label>Current Password</Label>
                    <Input type="password" value={pw.current_password} onChange={(e) => setPw((v) => ({ ...v, current_password: e.target.value }))} />
                  </div>
                  <div>
                    <Label>New Password</Label>
                    <Input type="password" value={pw.new_password} onChange={(e) => setPw((v) => ({ ...v, new_password: e.target.value }))} />
                  </div>
                </div>
                <Button variant="secondary" onClick={changePassword} disabled={saving || !pw.current_password || !pw.new_password}>
                  Update Password
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="font-bold">Support and Reporting</div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="text-sm text-slate-600">Report bugs, payment issues, account problems, or anything else that should go to the admin team.</div>
                <Button variant="secondary" onClick={() => window.location.href = '/report?target=system&label=Report%20a%20system%20issue%20or%20bug'}>
                  Report System Issue
                </Button>
              </CardContent>
            </Card>

            <div className="flex gap-3">
              <Button variant="ghost" onClick={load}>
                Cancel
              </Button>
              <Button onClick={saveProfile} disabled={saving}>
                Save Changes
              </Button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (isDriver) {
    return (
      <div className="min-h-screen bg-slate-100 text-slate-900">
        <DriverTopBar />
        <main className="mx-auto w-full max-w-6xl px-4 py-8">{body()}</main>
      </div>
    )
  }

  return <div className="space-y-4">{body()}</div>
}

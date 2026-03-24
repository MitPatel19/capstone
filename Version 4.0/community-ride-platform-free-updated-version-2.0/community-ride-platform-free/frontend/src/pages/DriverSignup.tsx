import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CarFront, Upload } from 'lucide-react'
import { api } from '../api'

type City = { id: number; name: string; is_active: boolean }

function DocInput({ label, onPick }: { label: string; onPick: (file: File | null) => void }) {
  return (
    <div>
      <label className="mb-2 block text-base font-bold">{label}</label>
      <div className="flex items-center gap-2">
        <input className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm" type="file" accept="image/*,.pdf" onChange={(e) => onPick(e.target.files?.[0] ?? null)} />
        <Upload className="h-5 w-5 text-slate-400" />
      </div>
    </div>
  )
}

export default function DriverSignup() {
  const nav = useNavigate()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [phone, setPhone] = useState('')
  const [age, setAge] = useState(23)
  const [cities, setCities] = useState<City[]>([])
  const [cityId, setCityId] = useState(0)
  const [license, setLicense] = useState<File | null>(null)
  const [licenseExpiryDate, setLicenseExpiryDate] = useState('')
  const [idFile, setIdFile] = useState<File | null>(null)
  const [insurance, setInsurance] = useState<File | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    api.get('/auth/cities')
      .then((res) => setCities(res.data))
      .catch(() => setCities([]))
  }, [])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setErr(null)
    setLoading(true)
    try {
      if (!cityId) throw new Error('Please select your city')
      if (!licenseExpiryDate) throw new Error('Please enter the driver license expiry date')
      const fd = new FormData()
      fd.append('name', name)
      fd.append('email', email)
      fd.append('password', password)
      fd.append('phone', phone)
      fd.append('age', String(age))
      fd.append('is_student', 'false')
      fd.append('city_id', String(cityId))
      fd.append('license_expiry_date', licenseExpiryDate)
      if (!license || !idFile || !insurance) throw new Error('Please upload all documents')
      fd.append('license_file', license)
      fd.append('id_file', idFile)
      fd.append('insurance_file', insurance)
      const res = await api.post('/auth/signup/driver', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      const params = new URLSearchParams({
        mode: 'verify',
        role: 'driver',
        email,
      })
      if (res.data?.debug_url) params.set('debug_url', res.data.debug_url)
      nav(`/check-email?${params.toString()}`)
    } catch (e: any) {
      setErr(e?.response?.data?.detail ?? e?.message ?? 'Signup failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-100 px-4 py-10">
      <div className="mx-auto w-full max-w-2xl">
        <div className="mb-8 flex items-center justify-center gap-3">
          <CarFront className="h-9 w-9 text-brand-600" />
          <h1 className="text-4xl font-black text-slate-900">RideConnect</h1>
        </div>

        <div className="rounded-3xl border border-slate-300 bg-white p-8">
          <h2 className="text-2xl font-black">Sign Up as Driver</h2>
          <p className="mt-2 text-base text-slate-500">Create your driver account - verification required</p>

          <form className="mt-6 space-y-4" onSubmit={submit}>
            <div>
              <label className="mb-2 block text-base font-bold">Full Name</label>
              <input className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-base" placeholder="John Doe" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <label className="mb-2 block text-base font-bold">Email</label>
              <input className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-base" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div>
              <label className="mb-2 block text-base font-bold">Password</label>
              <input className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-base" type="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <div>
              <label className="mb-2 block text-base font-bold">Phone Number</label>
              <input className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-base" placeholder="+1 (555) 123-4567" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div>
              <label className="mb-2 block text-base font-bold">Age (23+)</label>
              <input className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-base" type="number" min={23} value={age} onChange={(e) => setAge(Number(e.target.value || 23))} />
            </div>
            <div>
              <label className="mb-2 block text-base font-bold">City Selection</label>
              <select
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-base outline-none focus:ring-2 focus:ring-brand-200"
                value={cityId}
                onChange={(e) => setCityId(Number(e.target.value))}
              >
                <option value={0}>Select your city</option>
                {cities.map((city) => (
                  <option key={city.id} value={city.id}>
                    {city.name}
                  </option>
                ))}
              </select>
              <div className="mt-2 text-sm text-slate-500">
                This list uses the same cities added by the admin in City Dropdown Management.
              </div>
            </div>

            <div className="border-t border-slate-200 pt-5">
              <h3 className="text-2xl font-black">Upload Documents</h3>
              <div className="mt-4 space-y-4">
                <DocInput label="Driver License" onPick={setLicense} />
                <div>
                  <label className="mb-2 block text-base font-bold">License Expiry Date</label>
                  <input
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-base"
                    type="date"
                    value={licenseExpiryDate}
                    onChange={(e) => setLicenseExpiryDate(e.target.value)}
                  />
                  <div className="mt-2 text-sm text-slate-500">
                    Enter the expiry date exactly as shown on the uploaded driver license.
                  </div>
                </div>
                <DocInput label="Government ID" onPick={setIdFile} />
                <DocInput label="Insurance Certificate" onPick={setInsurance} />
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-base text-slate-600">
              Your account will be pending admin approval. You'll receive an email within 24 hours.
            </div>

            {err && <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{err}</div>}

            <button className="w-full rounded-xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-60" disabled={loading}>
              {loading ? 'Submitting...' : 'Submit Application'}
            </button>
          </form>

          <div className="mt-6 text-center text-base text-slate-600">
            Already have an account?{' '}
            <button className="font-bold text-brand-600 hover:underline" onClick={() => nav('/login?role=driver')}>
              Login here
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

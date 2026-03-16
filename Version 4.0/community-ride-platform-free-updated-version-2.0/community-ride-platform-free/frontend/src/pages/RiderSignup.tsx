import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, CardContent, CardHeader } from '../components/Card'
import { Input, Label } from '../components/Input'
import { Button } from '../components/Button'
import { api } from '../api'

type City = { id: number; name: string; is_active: boolean }

export default function RiderSignup() {
  const nav = useNavigate()
  const [name,setName]=useState('')
  const [email,setEmail]=useState('')
  const [password,setPassword]=useState('')
  const [phone,setPhone]=useState('')
  const [age,setAge]=useState(18)
  const [isStudent,setIsStudent]=useState(false)
  const [cities, setCities] = useState<City[]>([])
  const [cityId, setCityId] = useState(0)
  const [err,setErr]=useState<string|null>(null)
  const [loading,setLoading]=useState(false)

  useEffect(() => {
    api.get('/auth/cities')
      .then((res) => setCities(res.data))
      .catch(() => setCities([]))
  }, [])

  async function submit(e: React.FormEvent){
    e.preventDefault()
    setErr(null); setLoading(true)
    try{
      if (!cityId) throw new Error('Please select your city')
      await api.post('/auth/signup/rider',{name,email,password,phone,age,is_student:isStudent,city_id: cityId})
      nav('/login?role=rider')
    }catch(e:any){
      setErr(e?.response?.data?.detail ?? e?.message ?? 'Signup failed')
    }finally{ setLoading(false) }
  }

  return (
    <Card>
      <CardHeader>
        <div className="text-2xl font-black">Sign Up as Rider</div>
        <div className="text-sm text-slate-600 mt-1">Create your rider account to get started.</div>
      </CardHeader>
      <CardContent>
        <form className="grid md:grid-cols-2 gap-4" onSubmit={submit}>
          <div>
            <Label>Name</Label>
            <Input value={name} onChange={e=>setName(e.target.value)} placeholder="Mitkumar Patel" />
          </div>
          <div>
            <Label>Email</Label>
            <Input value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com" />
          </div>
          <div>
            <Label>Password</Label>
            <Input type="password" value={password} onChange={e=>setPassword(e.target.value)} />
          </div>
          <div>
            <Label>Phone Number</Label>
            <Input value={phone} onChange={e=>setPhone(e.target.value)} placeholder="807..." />
          </div>
          <div>
            <Label>Age</Label>
            <Input type="number" value={age} onChange={e=>setAge(parseInt(e.target.value||'18'))} />
          </div>
          <div>
            <Label>City Selection</Label>
            <select
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-200"
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
            <div className="mt-2 text-xs text-slate-600">
              This list uses the same cities added by the admin in City Dropdown Management.
            </div>
          </div>
          <div className="flex items-center gap-2 pt-6">
            <input id="student" type="checkbox" checked={isStudent} onChange={e=>setIsStudent(e.target.checked)} />
            <label htmlFor="student" className="text-sm text-slate-700">I am a student</label>
          </div>
          {err && <div className="md:col-span-2 rounded-xl bg-rose-50 border border-rose-200 p-3 text-sm text-rose-700">{err}</div>}
          <div className="md:col-span-2 flex gap-3">
            <Button disabled={loading}>{loading?'Creating...':'Create Account'}</Button>
            <Button type="button" variant="ghost" onClick={()=>nav('/login?role=rider')}>Back to Login</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

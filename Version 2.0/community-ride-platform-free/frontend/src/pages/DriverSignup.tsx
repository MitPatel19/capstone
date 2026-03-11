import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, CardContent, CardHeader } from '../components/Card'
import { Input, Label } from '../components/Input'
import { Button } from '../components/Button'
import { api } from '../api'

export default function DriverSignup() {
  const nav = useNavigate()
  const [name,setName]=useState('')
  const [email,setEmail]=useState('')
  const [password,setPassword]=useState('')
  const [phone,setPhone]=useState('')
  const [age,setAge]=useState(23)
  const [isStudent,setIsStudent]=useState(false)
  const [license,setLicense]=useState<File|null>(null)
  const [idFile,setIdFile]=useState<File|null>(null)
  const [insurance,setInsurance]=useState<File|null>(null)
  const [err,setErr]=useState<string|null>(null)
  const [loading,setLoading]=useState(false)

  async function submit(e: React.FormEvent){
    e.preventDefault()
    setErr(null); setLoading(true)
    try{
      const fd = new FormData()
      fd.append('name', name)
      fd.append('email', email)
      fd.append('password', password)
      fd.append('phone', phone)
      fd.append('age', String(age))
      fd.append('is_student', String(isStudent))
      if (!license || !idFile || !insurance) throw new Error('Please upload all documents')
      fd.append('license_file', license)
      fd.append('id_file', idFile)
      fd.append('insurance_file', insurance)
      await api.post('/auth/signup/driver', fd, { headers: { 'Content-Type':'multipart/form-data' }})
      nav('/pending')
    }catch(e:any){
      setErr(e?.response?.data?.detail ?? e?.message ?? 'Signup failed')
    }finally{ setLoading(false) }
  }

  return (
    <Card>
      <CardHeader>
        <div className="text-2xl font-black">Sign Up as Driver</div>
        <div className="text-sm text-slate-600 mt-1">Upload documents. Account requires admin approval.</div>
      </CardHeader>
      <CardContent>
        <form className="grid md:grid-cols-2 gap-4" onSubmit={submit}>
          <div><Label>Name</Label><Input value={name} onChange={e=>setName(e.target.value)} /></div>
          <div><Label>Email</Label><Input value={email} onChange={e=>setEmail(e.target.value)} /></div>
          <div><Label>Password</Label><Input type="password" value={password} onChange={e=>setPassword(e.target.value)} /></div>
          <div><Label>Phone Number</Label><Input value={phone} onChange={e=>setPhone(e.target.value)} /></div>
          <div><Label>Age (must be 23+)</Label><Input type="number" value={age} onChange={e=>setAge(parseInt(e.target.value||'23'))} /></div>
          <div className="flex items-center gap-2 pt-6">
            <input id="student2" type="checkbox" checked={isStudent} onChange={e=>setIsStudent(e.target.checked)} />
            <label htmlFor="student2" className="text-sm text-slate-700">I am a student (drivers not allowed)</label>
          </div>

          <div className="md:col-span-2 grid sm:grid-cols-3 gap-3">
            <Doc label="Driver License" onPick={setLicense} />
            <Doc label="ID" onPick={setIdFile} />
            <Doc label="Insurance" onPick={setInsurance} />
          </div>

          <div className="md:col-span-2 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
            <b>Message:</b> Account pending admin approval (within 24 hours)
          </div>

          {err && <div className="md:col-span-2 rounded-xl bg-rose-50 border border-rose-200 p-3 text-sm text-rose-700">{err}</div>}

          <div className="md:col-span-2 flex gap-3">
            <Button variant="secondary" disabled={loading}>{loading?'Submitting...':'Submit'}</Button>
            <Button type="button" variant="ghost" onClick={()=>nav('/login?role=driver')}>Back to Login</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

function Doc({ label, onPick }: { label: string; onPick: (f: File|null)=>void }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="font-semibold">{label}</div>
      <input className="mt-2 text-sm" type="file" accept="image/*,.pdf" onChange={e=>onPick(e.target.files?.[0] ?? null)} />
      <div className="text-xs text-slate-500 mt-2">Upload a photo or PDF.</div>
    </div>
  )
}

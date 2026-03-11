import React, { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Card, CardContent, CardHeader } from '../components/Card'
import { Button } from '../components/Button'
import { Input, Label } from '../components/Input'
import { api } from '../api'

export default function Feedback() {
  const { rideId } = useParams()
  const nav = useNavigate()
  const [toUserId, setToUserId] = useState<number>(0)
  const [stars, setStars] = useState(5)
  const [comment, setComment] = useState('')
  const [msg, setMsg] = useState<string|null>(null)

  async function submit() {
    setMsg(null)
    await api.post(`/rides/${rideId}/rate`, { to_user_id: toUserId, stars, comment })
    setMsg('Feedback submitted ✅')
  }

  return (
    <Card>
      <CardHeader>
        <div className="text-2xl font-black">Feedback</div>
        <div className="text-sm text-slate-600 mt-1">Rate the other user after the ride.</div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
          For demo, enter the other user’s ID (shown in admin list). In production, this would auto-select.
        </div>
        <div>
          <Label>To User ID</Label>
          <Input type="number" value={toUserId} onChange={e=>setToUserId(parseInt(e.target.value||'0'))} />
        </div>
        <div>
          <Label>Stars (1-5)</Label>
          <Input type="number" min={1} max={5} value={stars} onChange={e=>setStars(parseInt(e.target.value||'5'))} />
        </div>
        <div>
          <Label>Comment</Label>
          <Input value={comment} onChange={e=>setComment(e.target.value)} placeholder="Optional" />
        </div>
        <div className="flex gap-3">
          <Button onClick={submit}>Submit</Button>
          <Button variant="ghost" onClick={()=>nav(-1)}>Back</Button>
        </div>
        {msg && <div className="text-sm text-emerald-700">{msg}</div>}
      </CardContent>
    </Card>
  )
}

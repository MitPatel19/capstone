import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Input } from './Input'

type Item = { display_name: string }

export function PlaceAutocomplete({ value, onChange, placeholder, className }: {
  value: string
  onChange: (v: string)=>void
  placeholder?: string
  className?: string
}) {
  const [items, setItems] = useState<Item[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const lastReq = useRef<number>(0)

  useEffect(() => {
    const q = value.trim()
    if (q.length < 3) { setItems([]); return }
    const id = ++lastReq.current
    const t = window.setTimeout(async () => {
      setLoading(true)
      try {
        const url = `https://nominatim.openstreetmap.org/search?format=json&limit=6&q=${encodeURIComponent(q)}`
        const res = await fetch(url, { headers: { 'Accept': 'application/json' } })
        const data = await res.json()
        if (id === lastReq.current) setItems((data || []).map((x:any)=>({ display_name: x.display_name })))
      } catch {
        if (id === lastReq.current) setItems([])
      } finally {
        if (id === lastReq.current) setLoading(false)
      }
    }, 300)
    return () => window.clearTimeout(t)
  }, [value])

  return (
    <div className="relative">
      <Input
        className={className}
        value={value}
        onChange={e=>{ onChange(e.target.value); setOpen(true) }}
        onFocus={()=>setOpen(true)}
        onBlur={()=>setTimeout(()=>setOpen(false), 150)}
        placeholder={placeholder ?? 'Search address...'}
      />
      {open && items.length > 0 && (
        <div className="absolute z-30 mt-2 w-full rounded-2xl border border-slate-200 bg-white shadow-lg overflow-hidden">
          {items.map((it, idx) => (
            <button
              type="button"
              key={idx}
              className="w-full text-left px-4 py-3 text-sm hover:bg-slate-50"
              onMouseDown={(e)=>e.preventDefault()}
              onClick={() => { onChange(it.display_name); setOpen(false); setItems([]) }}
            >
              {it.display_name}
            </button>
          ))}
          {loading && <div className="px-4 py-2 text-xs text-slate-500">Searching…</div>}
        </div>
      )}
    </div>
  )
}

'use client'
import { useEffect, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

export type ReportFilterValues = { start: string; end: string; customer: string; product: string; category: string; staff: string; language: string }
const empty: ReportFilterValues = { start: '', end: '', customer: '', product: '', category: '', staff: '', language: '' }
export function ReportFilters({ value, onChange }: { value: ReportFilterValues; onChange: (value: ReportFilterValues) => void }) {
  const [draft, setDraft] = useState(value)
  useEffect(() => setDraft(value), [value])
  const update = (key: keyof ReportFilterValues, next: string) => setDraft((old) => ({ ...old, [key]: next }))
  const apply = () => onChange(draft)
  const clear = () => { setDraft(empty); onChange(empty) }
  return <form className="grid gap-3 rounded-2xl bg-card p-4 ring-1 ring-foreground/8 sm:grid-cols-2 lg:grid-cols-4" onSubmit={(e) => { e.preventDefault(); apply() }} aria-label="Report filters">
    <label className="text-xs font-medium text-muted-foreground">From<input aria-label="From date" type="date" value={draft.start} onChange={(e) => update('start', e.target.value)} className="mt-1 h-10 w-full rounded-lg border border-input bg-transparent px-3 text-sm" /></label>
    <label className="text-xs font-medium text-muted-foreground">To<input aria-label="To date" type="date" value={draft.end} onChange={(e) => update('end', e.target.value)} className="mt-1 h-10 w-full rounded-lg border border-input bg-transparent px-3 text-sm" /></label>
    {(['customer', 'product', 'category', 'staff', 'language'] as const).map((key) => <label key={key} className="text-xs font-medium capitalize text-muted-foreground">{key}<Input aria-label={key} value={draft[key]} onChange={(e) => update(key, e.target.value)} placeholder={`Filter by ${key}`} className="mt-1" /></label>)}
    <div className="flex items-end gap-2"><Button type="submit">Apply filters</Button><Button type="button" variant="outline" onClick={clear}>Clear</Button></div>
  </form>
}

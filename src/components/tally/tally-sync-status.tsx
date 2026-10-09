'use client'
import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

type SyncStatus = { status: string; lastRun: any; snapshot: any; counts: Record<string, number>; checksum?: string | null; reconciliation?: string }
export function TallySyncStatus() {
 const [data, setData] = useState<SyncStatus | null>(null); const [error, setError] = useState<string | null>(null); const [loading, setLoading] = useState(true)
 const load = () => { setLoading(true); fetch('/api/tally/sync-status', { cache: 'no-store' }).then(async r => { if (!r.ok) throw new Error('Unable to load sync status'); return r.json() }).then((x) => setData(x.data)).catch((e) => setError(e.message)).finally(() => setLoading(false)) }
 // eslint-disable-next-line react-hooks/set-state-in-effect
 useEffect(load, [])
 if (loading) return <div role="status" aria-live="polite" className="h-40 animate-pulse rounded-2xl bg-muted" />
 if (error) return <Card><CardContent className="space-y-3 pt-6"><p role="alert" className="text-sm text-destructive">{error}</p><Button variant="outline" onClick={load}>Try again</Button></CardContent></Card>
 if (!data || !data.lastRun) return <Card><CardHeader><CardTitle>Tally sync</CardTitle><CardDescription>No Tally import has been received yet.</CardDescription></CardHeader></Card>
 const stale = data.status === 'stale'; const blocked = data.status === 'blocked'
 return <Card><CardHeader><div className="flex items-center justify-between gap-3"><div><CardTitle>Tally sync status</CardTitle><CardDescription>Historical imports stay labelled as source snapshots.</CardDescription></div><Badge variant={blocked || stale ? 'destructive' : 'secondary'}>{blocked ? 'Blocked' : stale ? 'Stale' : 'Reconciled'}</Badge></div></CardHeader><CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><Info label="Last run" value={new Date(data.lastRun.received_at).toLocaleString()} /><Info label="Source period" value={`${data.lastRun.source_period_start ?? '—'} – ${data.lastRun.source_period_end ?? '—'}`} /><Info label="Records" value={Object.entries(data.counts ?? {}).map(([k,v]) => `${k}: ${v}`).join(', ') || '—'} /><Info label="Checksum" value={data.checksum ? `${data.checksum.slice(0, 12)}…` : 'Unavailable'} /><p className="text-xs text-muted-foreground sm:col-span-2 lg:col-span-4">Reconciliation: {data.reconciliation ?? data.lastRun.reconciliation_status ?? 'unknown'}</p></CardContent></Card>
}
function Info({ label, value }: { label: string; value: string }) { return <div><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 text-sm font-medium">{value}</dd></div> }

'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import type { AiReport, ReportLanguage, TallyReportSnapshot } from '@/lib/tally/ai-report'

export function AiReportPanel({ snapshot, language = 'en' }: { snapshot: TallyReportSnapshot; language?: ReportLanguage }) {
  const [report, setReport] = useState<AiReport | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function preview() {
    setLoading(true); setError(null)
    try { const response = await fetch('/api/ai/tally-report', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ snapshot, language, consent_state: 'unknown', identity_state: 'incomplete' }) }); const payload = await response.json(); if (!response.ok) throw new Error(payload.error ?? 'Could not build report'); setReport(payload.data) } catch (err) { setError(err instanceof Error ? err.message : 'Could not build report') } finally { setLoading(false) }
  }
  return <Card aria-label="AI report preview"><CardHeader className="flex flex-row items-center justify-between gap-3"><div><CardTitle>AI report preview</CardTitle><p className="mt-1 text-sm text-muted-foreground">Grounded in reconciled Tally data. Preview only; nothing is sent or approved.</p></div><Button onClick={preview} disabled={loading}>{loading ? 'Preparing…' : 'Prepare preview'}</Button></CardHeader><CardContent className="space-y-4">{error && <p role="alert" className="text-sm text-destructive">{error}</p>}{report && <><div className="flex flex-wrap gap-2"><Badge variant={report.needs_review ? 'destructive' : 'secondary'}>{report.needs_review ? 'Needs review' : 'Ready to review'}</Badge><Badge variant="outline">{report.generated_by === 'ai' ? 'AI assisted' : 'Deterministic fallback'}</Badge></div><p className="text-sm">{report.summary}</p><dl className="grid gap-2 sm:grid-cols-2">{report.evidence_metrics.map(item => <div key={item.id} className="rounded-md border p-2"><dt className="text-xs text-muted-foreground">{item.label}</dt><dd className="font-medium">{item.value}</dd></div>)}</dl><p className="text-sm"><strong>Recommended human action:</strong> {report.recommended_human_action.text}</p><div className="grid gap-3 sm:grid-cols-2"><div className="rounded-md border p-3 text-sm"><strong>English draft</strong><p className="mt-1">{report.english_draft}</p></div><div className="rounded-md border p-3 text-sm"><strong>Malayalam draft</strong><p className="mt-1">{report.malayalam_draft}</p></div></div><ul className="list-disc pl-5 text-xs text-muted-foreground">{report.confidence_notes.map(note => <li key={note}>{note}</li>)}</ul></>}</CardContent></Card>
}

import { ArrowDown, ArrowUp, Minus } from 'lucide-react'
import type { ComponentType } from 'react'
import { cn } from '@/lib/utils'

interface MetricCardProps {
  title: string
  /** Pre-formatted value for display (e.g. "42" or "$1,250"). */
  value: string
  icon: ComponentType<{ className?: string }>
  /**
   * Delta-mode secondary row: arrow + delta text. Omit when the metric
   * doesn't have a sensible comparison (e.g. total pipeline value).
   */
  delta?: {
    /** Positive / negative / zero drives arrow + color. */
    sign: number
    /** Pre-formatted delta, e.g. "+3 vs yesterday". */
    label: string
  }
  /** Used instead of `delta` when the metric has a static subtitle. */
  subtitle?: string
  /** The lead KPI uses the reference's near-black featured treatment. */
  featured?: boolean
  className?: string
}

export function MetricCard({ title, value, icon: Icon, delta, subtitle, featured = false, className }: MetricCardProps) {
  return (
    <div
      className={cn(
        'group flex min-h-44 flex-col rounded-[28px] border p-6 transition-transform hover:-translate-y-0.5',
        featured
          ? 'border-foreground bg-foreground text-background'
          : 'border-border bg-card text-foreground',
        className,
      )}
    >
      <div className="flex items-start justify-between">
        <p className={cn('text-sm font-medium', featured ? 'text-background/70' : 'text-muted-foreground')}>
          {title}
        </p>
        <div className={cn(
          'flex size-10 items-center justify-center rounded-full',
          featured ? 'bg-background text-foreground' : 'bg-card-2 text-muted-foreground',
        )}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <p className={cn(
        'mt-auto pt-6 text-[36px] font-light leading-none tracking-[-0.04em] tabular-nums',
        featured ? 'text-background' : 'text-foreground',
      )}>
        {value}
      </p>
      {delta ? <DeltaRow sign={delta.sign} label={delta.label} /> : subtitle ? (
        <p className={cn('mt-2 text-sm', featured ? 'text-background/70' : 'text-muted-foreground')}>{subtitle}</p>
      ) : null}
    </div>
  )
}

function DeltaRow({ sign, label }: { sign: number; label: string }) {
  const tone =
    sign > 0
      ? 'text-primary'
      : sign < 0
      ? 'text-destructive'
      : 'text-muted-foreground'
  const Arrow = sign > 0 ? ArrowUp : sign < 0 ? ArrowDown : Minus
  return (
    <div className={cn('mt-2 flex items-center gap-1 text-sm', tone)}>
      <Arrow className="h-4 w-4" aria-hidden />
      <span className="tabular-nums">{label}</span>
    </div>
  )
}

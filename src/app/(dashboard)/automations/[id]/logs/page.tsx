"use client"

import { use, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import {
  ArrowLeft,
  Check,
  X,
  ChevronDown,
  ChevronRight,
} from "lucide-react"
import { useTranslations } from "next-intl"

import { createClient } from "@/lib/supabase/client"
import type {
  Automation,
  AutomationLog,
  AutomationLogStepResult,
} from "@/types"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { formatRelative } from "@/lib/automations/trigger-meta"
import { DashboardPageLoading } from "@/components/dashboard/page-loading"

export default function AutomationLogsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const router = useRouter()
  const t = useTranslations("Automations.logs")
  const tRelative = useTranslations("Automations.relative")

  const [automation, setAutomation] = useState<Automation | null>(null)
  const [logs, setLogs] = useState<AutomationLog[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [openLogId, setOpenLogId] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      try {
        const supabase = createClient()
        const [autRes, logRes] = await Promise.all([
          supabase
            .from("automations")
            .select("*")
            .eq("id", id)
            .maybeSingle(),
          supabase
            .from("automation_logs")
            .select("*, contact:contacts(id, name, phone)")
            .eq("automation_id", id)
            .order("created_at", { ascending: false })
            .limit(100),
        ])
        if (autRes.error) throw autRes.error
        if (logRes.error) throw logRes.error
        setAutomation(autRes.data as Automation | null)
        setLogs((logRes.data ?? []) as AutomationLog[])
      } catch (err) {
        setError(err instanceof Error ? err.message : t("loadError"))
      }
    }
    load()
  }, [id])

  if (error) {
    return (
      <div className="flex min-h-64 flex-col items-center justify-center gap-4 rounded-[28px] border border-red-500/20 bg-red-500/5 px-6 text-center">
        <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
        <Button variant="outline" onClick={() => router.push("/automations")}>
          {t("back")}
        </Button>
      </div>
    )
  }

  if (!automation || logs === null) {
    return <DashboardPageLoading variant="table" />
  }

  return (
    <div className="space-y-8">
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={() => router.push("/automations")}
          className="mt-1 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full border border-border/70 bg-card text-muted-foreground shadow-sm transition-colors hover:bg-pale-lime hover:text-foreground"
          aria-label={t("backAria")}
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-primary">{t("title")}</p>
          <h1 className="max-w-3xl text-3xl font-light tracking-tight text-foreground sm:text-4xl">{automation.name}</h1>
        </div>
      </div>

      {logs.length === 0 ? (
        <div className="flex h-56 flex-col items-center justify-center rounded-[28px] border border-dashed border-border/80 bg-card/70 px-6 text-center">
          <p className="text-sm text-foreground">{t("emptyTitle")}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {t("emptyDesc")}
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {logs.map((log) => {
            const isOpen = openLogId === log.id
            return (
              <li
                key={log.id}
                className="overflow-hidden rounded-[24px] border border-border/70 bg-card shadow-[0_14px_38px_-30px_rgba(21,35,12,0.5)]"
              >
                <button
                  type="button"
                  onClick={() => setOpenLogId(isOpen ? null : log.id)}
                  className="flex w-full items-start gap-3 px-4 py-4 text-left transition-colors hover:bg-pale-lime/60 sm:items-center sm:px-5"
                >
                  {isOpen ? (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  )}
                  <StatusBadge status={log.status} t={t} />
                  <div className="min-w-0 flex-1">
                    <div className="break-words text-sm font-medium text-foreground">
                      {log.contact?.name ?? log.contact?.phone ?? t("unknownContact")}
                    </div>
                    <div className="break-words text-xs text-muted-foreground">
                      {log.trigger_event} · {log.steps_executed?.length ?? 0}{" "}
                      {log.steps_executed?.length === 1 ? t("step", { count: 1 }).replace("1 ", "") : t("stepPlural", { count: log.steps_executed?.length ?? 0 }).replace(/^[0-9]+ /, "")}
                    </div>
                  </div>
                  <div className="shrink-0 text-xs text-muted-foreground">
                    {formatRelative(log.created_at, tRelative)}
                  </div>
                </button>
                {isOpen && (
                  <div className="border-t border-border/70 bg-card-2/40 px-4 py-4 sm:px-5">
                    {log.error_message && (
                      <p className="mb-3 rounded-2xl border border-red-500/25 bg-red-500/10 px-3 py-2 text-xs text-red-800 dark:text-red-200">
                        {log.error_message}
                      </p>
                    )}
                    <ul className="space-y-1.5">
                      {(log.steps_executed ?? []).map((r, i) => (
                        <StepRow key={i} result={r} />
                      ))}
                      {(log.steps_executed ?? []).length === 0 && (
                        <li className="text-xs text-muted-foreground">{t("noSteps")}</li>
                      )}
                    </ul>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

function StatusBadge({ status, t }: { status: AutomationLog["status"], t: ReturnType<typeof useTranslations> }) {
  const classes =
    status === "success"
      ? "border-primary/30 bg-primary/10 text-primary"
      : status === "partial"
      ? "border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-200"
      : "border-red-500/30 bg-red-500/10 text-red-800 dark:text-red-200"
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium",
        classes,
      )}
    >
      {t(`status.${status}`)}
    </span>
  )
}

function StepRow({ result }: { result: AutomationLogStepResult }) {
  const ok = result.status === "success"
  return (
    <li className="flex items-start gap-2 text-xs">
      <span
        className={cn(
          "mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full",
          ok ? "bg-primary/20 text-primary" : "bg-red-500/20 text-red-800 dark:text-red-200",
        )}
        aria-hidden
      >
        {ok ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
      </span>
      <span className="min-w-0 break-words text-muted-foreground">{result.step_type}</span>
      {result.detail && (
        <span className="min-w-0 break-words text-muted-foreground">— {result.detail}</span>
      )}
    </li>
  )
}

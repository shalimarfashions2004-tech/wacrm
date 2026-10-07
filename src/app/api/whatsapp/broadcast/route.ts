import { NextResponse } from 'next/server'
import { requireRole, toErrorResponse } from '@/lib/auth/account'
import type { SendTimeParams } from '@/lib/whatsapp/template-send-builder'
import {
  checkRateLimit,
  rateLimitResponse,
  RATE_LIMITS,
} from '@/lib/rate-limit'
import {
  getDeliveryMode,
} from '@/lib/whatsapp/delivery-policy'
import { runDryRunBroadcast } from '@/lib/whatsapp/broadcast-dry-run'

/**
 * Two input shapes are accepted:
 *
 *   NEW (preferred — supports per-recipient variable substitution):
 *     {
 *       recipients: Array<{ phone: string; params: string[] }>,
 *       template_name, template_language
 *     }
 *
 *   LEGACY (all phones receive the same params — kept so existing
 *   callers don't break):
 *     {
 *       phone_numbers: string[],
 *       template_params: string[],
 *       template_name, template_language
 *     }
 *
 * Previous implementation only supported the legacy shape, and the
 * sending hook was forced to ship every batch with `templateParams[0]`
 * — meaning every recipient got contact-0's personalization. The new
 * shape is what actually fixes that.
 */
interface NewRecipient {
  phone: string
  idempotencyKey?: string
  /** Body variable values, one per {{N}}. Legacy field. */
  params?: string[]
  /**
   * Structured per-send values (header text variable, media URL
   * override, URL/COPY_CODE button values). When set, takes
   * precedence over `params` for the body too — see
   * sendTemplateMessage for the merge rules.
   */
  messageParams?: SendTimeParams
}

export async function POST(request: Request) {
  try {
    const { userId } = await requireRole('agent')
    const limit = checkRateLimit(`broadcast:${userId}`, RATE_LIMITS.broadcast)
    if (!limit.success) return rateLimitResponse(limit)

    const body = await request.json()
    const {
      recipients: newRecipients,
      phone_numbers,
      template_name,
      template_params,
    } = body

    // Normalize to a list of {phone, params} regardless of shape.
    let recipients: NewRecipient[]
    if (Array.isArray(newRecipients) && newRecipients.length > 0) {
      recipients = newRecipients
    } else if (Array.isArray(phone_numbers) && phone_numbers.length > 0) {
      const shared: string[] = Array.isArray(template_params)
        ? template_params
        : []
      recipients = phone_numbers.map((phone: string) => ({
        phone,
        params: shared,
      }))
    } else {
      return NextResponse.json(
        {
          error:
            'Provide either `recipients` (preferred) or `phone_numbers` — must be a non-empty array',
        },
        { status: 400 }
      )
    }

    if (!template_name) {
      return NextResponse.json(
        { error: 'template_name is required' },
        { status: 400 }
      )
    }

    const deliveryMode = getDeliveryMode()
    if (deliveryMode === 'dry-run') {
      const dryRun = await runDryRunBroadcast({
        recipients,
        templateName: template_name,
      })
      return NextResponse.json({
        success: true,
        mode: 'dry-run',
        dry_run: true,
        total: recipients.length,
        ...dryRun,
      })
    }

    // A caller-supplied phone list has no durable campaign approval, budget
    // reservation or recipient claim. Never let the global live flags turn
    // this legacy dashboard adapter into an untracked fan-out endpoint.
    return NextResponse.json(
      {
        error: 'Campaign delivery is disabled until server-side campaign approval, budget reservations and recipient claims are configured. Inbox replies are controlled separately.',
        code: 'campaign_controls_required',
        mode: deliveryMode,
      },
      { status: 409 },
    )
  } catch (error) {
    // requireRole throws Unauthorized/Forbidden; toErrorResponse maps
    // those to 401/403 and collapses anything else to a generic 500.
    console.error('Error in WhatsApp broadcast POST:', error)
    return toErrorResponse(error)
  }
}

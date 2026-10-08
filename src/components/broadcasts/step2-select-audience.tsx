'use client';

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  previewCustomerAudience,
  type CustomerAudienceReceipt,
} from '@/lib/customer-data/audience';
import { CustomerAudienceSummary } from '@/components/customer-data/audience-summary';
import { parseBroadcastCsv } from '@/lib/broadcast-csv';
import { CustomField, Tag } from '@/types';
import type {
  AudienceConfig,
  AudienceType,
  CustomerDataAudiencePreset,
  CustomFieldFilter,
  CustomFieldOperator,
} from '@/lib/broadcasts/audience';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import {
  Users,
  Tags,
  Filter,
  Upload,
  FileText,
  Loader2,
  ArrowRight,
  ArrowLeft,
  X,
  BarChart3,
} from 'lucide-react';
import { useTranslations } from 'next-intl';

interface Step2Props {
  audience: AudienceConfig;
  templateLanguage?: string;
  onUpdate: (audience: AudienceConfig) => void;
  onNext: () => void;
  onBack: () => void;
}

export function Step2SelectAudience({
  audience,
  templateLanguage = 'en_US',
  onUpdate,
  onNext,
  onBack,
}: Step2Props) {
  const t = useTranslations('Broadcasts.wizard');

  const OPERATOR_OPTIONS = useMemo<
    { value: CustomFieldOperator; label: string }[]
  >(
    () => [
      { value: 'is', label: t('selectAudience.operatorIs') },
      { value: 'is_not', label: t('selectAudience.operatorIsNot') },
      { value: 'contains', label: t('selectAudience.operatorContains') },
    ],
    [t]
  );

  const audienceOptions = useMemo<
    {
      type: AudienceType;
      label: string;
      description: string;
      icon: typeof Users;
    }[]
  >(
    () => [
      {
        type: 'all',
        label: t('selectAudience.method.all'),
        description: t('selectAudience.allDescLoading'),
        icon: Users,
      },
      {
        type: 'tags',
        label: t('selectAudience.method.tags'),
        description: t('selectAudience.tagDesc'),
        icon: Tags,
      },
      {
        type: 'custom_field',
        label: t('selectAudience.method.customField'),
        description: t('selectAudience.customFieldDesc'),
        icon: Filter,
      },
      {
        type: 'csv',
        label: t('selectAudience.method.csv'),
        description: t('selectAudience.csvDesc'),
        icon: Upload,
      },
      {
        type: 'customer_data',
        label: t('selectAudience.method.customerData'),
        description: t('selectAudience.customerDataDesc'),
        icon: BarChart3,
      },
    ],
    [t]
  );
  const [tags, setTags] = useState<Tag[]>([]);
  const [customFields, setCustomFields] = useState<CustomField[]>([]);
  const [loadingTags, setLoadingTags] = useState(false);
  const [loadingFields, setLoadingFields] = useState(false);
  const [estimatedCount, setEstimatedCount] = useState<number | null>(null);
  const [loadingCount, setLoadingCount] = useState(false);
  const [customerReceipt, setCustomerReceipt] =
    useState<CustomerAudienceReceipt | null>(null);
  const [customerError, setCustomerError] = useState('');
  // The picked file's name, shown back to the user. The parsed rows
  // themselves live on `audience.csvContacts` (owned by the wizard) so
  // they survive stepping forward and back.
  const [pickedCsvName, setPickedCsvName] = useState<string | null>(null);
  const csvInputRef = useRef<HTMLInputElement>(null);

  const csvCount = audience.csvContacts?.length ?? 0;
  // Only meaningful while the rows it produced are still in play —
  // picking another audience type wipes `csvContacts`.
  const csvFileName = csvCount > 0 ? pickedCsvName : null;

  // Tags are used both by the primary "Filter by Tags" audience type
  // AND by the exclude-list below — so always load once on mount.
  useEffect(() => {
    async function fetchTags() {
      setLoadingTags(true);
      try {
        const supabase = createClient();
        const { data } = await supabase.from('tags').select('*').order('name');
        setTags(data ?? []);
      } finally {
        setLoadingTags(false);
      }
    }
    fetchTags();
  }, []);

  // Lazy-load custom fields only when that audience type is active.
  useEffect(() => {
    if (audience.type !== 'custom_field') return;
    async function fetchFields() {
      setLoadingFields(true);
      try {
        const supabase = createClient();
        const { data } = await supabase
          .from('custom_fields')
          .select('*')
          .order('field_name');
        setCustomFields(data ?? []);
      } finally {
        setLoadingFields(false);
      }
    }
    fetchFields();
  }, [audience.type]);

  const fetchEstimatedCount = useCallback(async () => {
    if (audience.type === 'customer_data') return;
    setLoadingCount(true);
    try {
      const supabase = createClient();

      // Base query — produces the superset before exclude is applied.
      let baseIds: Set<string> | null = null; // null means "all contacts"

      if (audience.type === 'all') {
        // Handled below — full-table count adjusted by excludes.
      } else if (
        audience.type === 'tags' &&
        audience.tagIds &&
        audience.tagIds.length > 0
      ) {
        const { data } = await supabase
          .from('contact_tags')
          .select('contact_id')
          .in('tag_id', audience.tagIds);
        baseIds = new Set((data ?? []).map((r) => r.contact_id));
      } else if (
        audience.type === 'custom_field' &&
        audience.customField?.fieldId &&
        audience.customField.value
      ) {
        const { fieldId, operator, value } = audience.customField;
        let q = supabase
          .from('contact_custom_values')
          .select('contact_id')
          .eq('custom_field_id', fieldId);
        if (operator === 'is') q = q.eq('value', value);
        else if (operator === 'is_not') q = q.neq('value', value);
        else q = q.ilike('value', `%${value}%`);
        const { data } = await q;
        baseIds = new Set((data ?? []).map((r) => r.contact_id));
      } else if (
        audience.type === 'csv' &&
        audience.csvContacts &&
        audience.csvContacts.length > 0
      ) {
        setEstimatedCount(audience.csvContacts.length);
        return;
      } else {
        // Partially-configured audience — wait for the user to finish.
        setEstimatedCount(null);
        return;
      }

      // Apply exclude tags
      let excludeSet: Set<string> | null = null;
      if (audience.excludeTagIds && audience.excludeTagIds.length > 0) {
        const { data: excludeRows } = await supabase
          .from('contact_tags')
          .select('contact_id')
          .in('tag_id', audience.excludeTagIds);
        excludeSet = new Set((excludeRows ?? []).map((r) => r.contact_id));
      }

      if (baseIds) {
        const effective = [...baseIds].filter((id) => !excludeSet?.has(id));
        setEstimatedCount(effective.length);
      } else {
        // "All" — fetch the total, then subtract exclude set if any.
        const { count } = await supabase
          .from('contacts')
          .select('*', { count: 'exact', head: true });
        const total = count ?? 0;
        setEstimatedCount(
          excludeSet ? Math.max(0, total - excludeSet.size) : total
        );
      }
    } finally {
      setLoadingCount(false);
    }
  }, [
    audience.type,
    audience.tagIds,
    audience.customField,
    audience.csvContacts,
    audience.excludeTagIds,
  ]);

  useEffect(() => {
    fetchEstimatedCount();
  }, [fetchEstimatedCount]);

  useEffect(() => {
    if (audience.type !== 'customer_data') return;
    const controller = new AbortController();
    setLoadingCount(true);
    setCustomerReceipt(null);
    setCustomerError('');
    setEstimatedCount(null);
    previewCustomerAudience(audience, templateLanguage, controller.signal)
      .then((receipt) => {
        if (!controller.signal.aborted) {
          setCustomerReceipt(receipt);
          setEstimatedCount(receipt.eligible);
        }
      })
      .catch((e) => {
        if (!controller.signal.aborted) setCustomerError((e as Error).message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingCount(false);
      });
    return () => controller.abort();
  }, [audience, templateLanguage]);

  async function handleCsvChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0];
    if (!selected) return;

    const result = parseBroadcastCsv(await selected.text());

    if (!result.ok) {
      toast.error(
        result.error === 'missing_phone_column'
          ? t('selectAudience.errorCsvMissingPhone')
          : t('selectAudience.errorCsvParse')
      );
      // Clear the input so re-picking the same corrected file still
      // fires `change` (the browser suppresses it for an identical value).
      e.target.value = '';
      setPickedCsvName(null);
      onUpdate({ ...audience, csvContacts: undefined });
      return;
    }

    // Rows without a leading `+` and country code were refused (issue
    // #586). Say so, or a spreadsheet export that stripped the `+` looks
    // like a mysteriously smaller audience.
    if (result.invalid > 0) {
      toast.warning(
        t('selectAudience.csvInvalidPhones', { count: result.invalid })
      );
    }

    setPickedCsvName(selected.name);
    onUpdate({ ...audience, csvContacts: result.contacts });
  }

  function toggleTag(tagId: string) {
    const current = audience.tagIds ?? [];
    const updated = current.includes(tagId)
      ? current.filter((id) => id !== tagId)
      : [...current, tagId];
    onUpdate({ ...audience, tagIds: updated });
  }

  function toggleExcludeTag(tagId: string) {
    const current = audience.excludeTagIds ?? [];
    const updated = current.includes(tagId)
      ? current.filter((id) => id !== tagId)
      : [...current, tagId];
    onUpdate({ ...audience, excludeTagIds: updated });
  }

  function updateCustomField(patch: Partial<CustomFieldFilter>) {
    const prev = audience.customField ?? {
      fieldId: '',
      operator: 'is' as CustomFieldOperator,
      value: '',
    };
    onUpdate({ ...audience, customField: { ...prev, ...patch } });
  }

  const isValid =
    audience.type === 'all' ||
    (audience.type === 'tags' &&
      audience.tagIds &&
      audience.tagIds.length > 0) ||
    (audience.type === 'custom_field' &&
      !!audience.customField?.fieldId &&
      audience.customField.value.length > 0) ||
    (audience.type === 'csv' &&
      audience.csvContacts &&
      audience.csvContacts.length > 0) ||
    (audience.type === 'customer_data' && !!audience.customerData?.preset);

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-foreground text-xl font-light tracking-tight">
          {t('selectAudience.title')}
        </h2>
        <p className="text-muted-foreground mt-1 text-sm">
          {t('selectAudience.subtitle')}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {audienceOptions.map(
          (option: {
            type: AudienceType;
            label: string;
            description: string;
            icon: typeof Users;
          }) => {
            const isSelected = audience.type === option.type;
            const Icon = option.icon;
            return (
              <button
                key={option.type}
                onClick={() =>
                  onUpdate({
                    ...audience,
                    type: option.type,
                    // Wipe shape fields from other types to avoid stale
                    // config leaking across selections.
                    tagIds:
                      option.type === 'tags' ? audience.tagIds : undefined,
                    customField:
                      option.type === 'custom_field'
                        ? audience.customField
                        : undefined,
                    csvContacts:
                      option.type === 'csv' ? audience.csvContacts : undefined,
                    customerData:
                      option.type === 'customer_data'
                        ? (audience.customerData ?? {
                            preset: 'all_reviewed',
                          })
                        : undefined,
                    source:
                      option.type === 'customer_data'
                        ? 'customer-data'
                        : undefined,
                  })
                }
                className={`flex items-start gap-3 rounded-[22px] border p-5 text-left transition-all ${
                  isSelected
                    ? 'border-primary bg-pale-lime ring-primary/30 ring-1'
                    : 'border-border bg-card-2 hover:border-primary/30'
                }`}
              >
                <div
                  className={`flex size-10 shrink-0 items-center justify-center rounded-full ${
                    isSelected
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-card text-muted-foreground'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-foreground text-sm font-medium">
                    {option.label}
                  </p>
                  <p className="text-muted-foreground mt-0.5 text-xs">
                    {option.description}
                  </p>
                </div>
              </button>
            );
          }
        )}
      </div>

      {audience.type === 'tags' && (
        <div className="border-border bg-card-2 rounded-[22px] border p-5">
          <p className="text-foreground mb-3 text-sm font-medium">
            {t('selectAudience.selectTags')}
          </p>
          {loadingTags ? (
            <Loader2 className="text-primary h-5 w-5 animate-spin" />
          ) : tags.length === 0 ? (
            <p className="text-muted-foreground text-xs">
              {t('selectAudience.noTagsFound')}
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {tags.map((tag) => {
                const isSelected = audience.tagIds?.includes(tag.id);
                return (
                  <button
                    key={tag.id}
                    onClick={() => toggleTag(tag.id)}
                    className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium transition-all ${
                      isSelected
                        ? 'border-primary/30 bg-primary/10 text-primary'
                        : 'border-border bg-card text-muted-foreground hover:border-primary/30'
                    }`}
                  >
                    <span
                      className="mr-1.5 h-2 w-2 rounded-full"
                      style={{ backgroundColor: tag.color }}
                    />
                    {tag.name}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {audience.type === 'custom_field' && (
        <div className="border-border bg-card-2 space-y-3 rounded-[22px] border p-5">
          <p className="text-foreground text-sm font-medium">
            {t('selectAudience.method.customField')}
          </p>
          {loadingFields ? (
            <Loader2 className="text-primary h-5 w-5 animate-spin" />
          ) : customFields.length === 0 ? (
            <p className="text-muted-foreground text-xs">
              {t('selectAudience.errorLoadFields')}
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_140px_minmax(0,1fr)]">
              <select
                value={audience.customField?.fieldId ?? ''}
                onChange={(e) => updateCustomField({ fieldId: e.target.value })}
                className="border-border bg-card text-foreground focus:border-primary focus:ring-primary h-10 rounded-full border px-4 text-sm outline-none focus:ring-1"
              >
                <option value="">{t('selectAudience.selectField')}</option>
                {customFields.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.field_name}
                  </option>
                ))}
              </select>
              <select
                value={audience.customField?.operator ?? 'is'}
                onChange={(e) =>
                  updateCustomField({
                    operator: e.target.value as CustomFieldOperator,
                  })
                }
                className="border-border bg-card text-foreground focus:border-primary focus:ring-primary h-10 rounded-full border px-4 text-sm outline-none focus:ring-1"
              >
                {OPERATOR_OPTIONS.map(
                  (op: { value: CustomFieldOperator; label: string }) => (
                    <option key={op.value} value={op.value}>
                      {op.label}
                    </option>
                  )
                )}
              </select>
              <input
                type="text"
                value={audience.customField?.value ?? ''}
                onChange={(e) => updateCustomField({ value: e.target.value })}
                placeholder={t('selectAudience.valuePlaceholder')}
                className="border-border bg-card text-foreground placeholder:text-muted-foreground focus:border-primary focus:ring-primary h-10 rounded-full border px-4 text-sm outline-none focus:ring-1"
              />
            </div>
          )}
        </div>
      )}

      {audience.type === 'csv' && (
        <div className="border-border bg-card-2 space-y-3 rounded-[22px] border p-5">
          <div>
            <p className="text-foreground text-sm font-medium">
              {t('selectAudience.uploadCsv')}
            </p>
            <p className="text-muted-foreground mt-0.5 text-xs">
              {t('selectAudience.csvFormatDesc')}
            </p>
          </div>

          <button
            type="button"
            onClick={() => csvInputRef.current?.click()}
            className="group border-border bg-card hover:border-primary/40 hover:bg-pale-lime flex w-full flex-col items-center gap-2 rounded-[22px] border border-dashed px-4 py-7 text-center transition-colors"
          >
            <div className="bg-card-2 text-muted-foreground group-hover:bg-pale-lime group-hover:text-foreground flex size-11 items-center justify-center rounded-full">
              {csvFileName ? (
                <FileText className="h-5 w-5" />
              ) : (
                <Upload className="h-5 w-5" />
              )}
            </div>
            <p className="text-foreground text-sm">
              {csvFileName ?? t('selectAudience.uploadCsv')}
            </p>
            {csvCount > 0 && (
              <p className="text-primary text-xs">
                {t('selectAudience.csvContactsFound', { count: csvCount })}
              </p>
            )}
          </button>

          <input
            ref={csvInputRef}
            type="file"
            accept=".csv,text/csv"
            onChange={handleCsvChange}
            className="hidden"
          />
        </div>
      )}

      {audience.type === 'customer_data' && (
        <div className="border-border bg-card-2 space-y-4 rounded-[22px] border p-5">
          <div>
            <p className="text-foreground text-sm font-medium">
              {t('selectAudience.customerDataTitle')}
            </p>
            <p className="text-muted-foreground mt-1 text-xs leading-5">
              {t('selectAudience.customerDataDescLong')}
            </p>
          </div>
          <select
            aria-label="Customer purchase segment"
            value={audience.customerData?.preset ?? 'all_reviewed'}
            onChange={(e) =>
              onUpdate({
                ...audience,
                customerData: {
                  ...audience.customerData,
                  preset: e.target.value as CustomerDataAudiencePreset,
                },
                source: 'customer-data',
              })
            }
            className="border-border bg-card text-foreground focus:border-primary focus:ring-primary h-10 w-full rounded-full border px-4 text-sm outline-none focus:ring-1"
          >
            <option value="all_reviewed">
              All reviewed customers with permission
            </option>
            <option value="high_value_frequent">
              {t('selectAudience.customerDataPresets.highValueFrequent')}
            </option>
            <option value="high_value_at_risk">
              {t('selectAudience.customerDataPresets.highValueAtRisk')}
            </option>
            <option value="product_interest" disabled>
              {t('selectAudience.customerDataPresets.productInterest')}
            </option>
            <option value="low_value_one_time">
              {t('selectAudience.customerDataPresets.lowValueOneTime')}
            </option>
          </select>
          <CustomerAudienceSummary
            receipt={customerReceipt}
            error={customerError}
            loading={loadingCount}
          />
        </div>
      )}

      {/* Exclude list — applies regardless of audience type */}
      <div className="border-border bg-card-2 rounded-[22px] border p-5">
        <div className="mb-3 flex items-center gap-2">
          <X className="h-4 w-4 text-red-700 dark:text-red-300" />
          <p className="text-foreground text-sm font-medium">
            {t('selectAudience.excludeTags')}
          </p>
        </div>
        {tags.length === 0 ? (
          <p className="text-muted-foreground text-xs">
            {t('selectAudience.noTagsFound')}
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {tags.map((tag) => {
              const isExcluded = audience.excludeTagIds?.includes(tag.id);
              return (
                <button
                  key={tag.id}
                  onClick={() => toggleExcludeTag(tag.id)}
                  className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium transition-all ${
                    isExcluded
                      ? 'border-red-500/30 bg-red-500/10 text-red-800 dark:text-red-200'
                      : 'border-border bg-card text-muted-foreground hover:border-primary/30'
                  }`}
                >
                  <span
                    className="mr-1.5 h-2 w-2 rounded-full"
                    style={{ backgroundColor: tag.color }}
                  />
                  {tag.name}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Audience Summary */}
      <div className="border-border bg-card-2 rounded-[22px] border p-5">
        <p className="text-foreground mb-2 text-sm font-medium">
          {t('selectAudience.audienceSummary')}
        </p>
        {loadingCount ? (
          <div className="flex items-center gap-2">
            <Loader2 className="text-primary h-4 w-4 animate-spin" />
            <span className="text-muted-foreground text-xs">
              {t('selectAudience.calculating')}
            </span>
          </div>
        ) : estimatedCount !== null ? (
          <div className="flex items-center gap-2">
            <Users className="text-primary h-4 w-4" />
            <span className="text-foreground text-sm">
              {estimatedCount.toLocaleString()}
            </span>
            <span className="text-muted-foreground text-xs">
              estimated recipients
            </span>
          </div>
        ) : (
          <p className="text-muted-foreground text-xs">
            {audience.type === 'customer_data'
              ? t('selectAudience.customerDataEstimatePending')
              : 'Select an audience type to see the estimate.'}
          </p>
        )}
      </div>

      <div className="border-border flex items-center justify-between border-t pt-5">
        <Button
          variant="outline"
          onClick={onBack}
          className="border-border bg-card-2 text-muted-foreground hover:bg-pale-lime hover:text-foreground h-10 rounded-full"
        >
          <ArrowLeft className="h-4 w-4" />
          {t('back')}
        </Button>
        <Button
          onClick={onNext}
          disabled={!isValid}
          className="bg-primary text-primary-foreground hover:bg-primary-hover h-10 rounded-full px-5 disabled:opacity-50"
        >
          {t('next')}
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

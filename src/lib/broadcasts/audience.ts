export type AudienceType =
  'all' | 'tags' | 'custom_field' | 'csv' | 'customer_data';

export type CustomFieldOperator = 'is' | 'is_not' | 'contains';

export type CustomerDataAudiencePreset =
  | 'high_value_frequent'
  | 'high_value_at_risk'
  | 'product_interest'
  | 'low_value_one_time';

export interface CustomFieldFilter {
  fieldId: string;
  operator: CustomFieldOperator;
  value: string;
}

export interface CustomerDataAudienceFilter {
  preset: CustomerDataAudiencePreset;
  product?: string;
}

export interface AudienceConfig {
  type: AudienceType;
  tagIds?: string[];
  customField?: CustomFieldFilter;
  csvContacts?: { phone: string; name?: string }[];
  customerData?: CustomerDataAudienceFilter;
  source?: 'customer-data';
  /** Contacts carrying any of these tags are subtracted from the result. */
  excludeTagIds?: string[];
}

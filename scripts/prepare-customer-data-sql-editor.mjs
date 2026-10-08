import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
const output = resolve(root, 'docs/sql/SHALIMAR_RUN_THIS_052.sql');
const migration = await readFile(
  resolve(root, 'supabase/migrations/052_customer_data_imports.sql'),
  'utf8'
);
await writeFile(
  output,
  [
    '-- SHALIMAR: paste this ENTIRE file into a new Supabase SQL Editor query.',
    '-- Generated from migration 052. Stores no customer data and sends no messages.',
    '-- Adds private import/review tables and account-checked functions.',
    '-- Credentials, Inbox replies, managed delivery and INR 1,000 budget are untouched.',
    '-- Run only in the Shalimar database where migrations 050/051 are installed.',
    'BEGIN;',
    "SET LOCAL lock_timeout = '5s';",
    "SET LOCAL statement_timeout = '60s';",
    `DO $$ BEGIN
    IF (SELECT count(*) FROM public.messaging_budget_policies p JOIN public.whatsapp_config c ON c.account_id=p.account_id
      WHERE c.phone_number_id='1391671597361924' AND c.waba_id='28787952197487898'
      AND p.phone_number_id=c.phone_number_id AND p.waba_id=c.waba_id AND p.monthly_limit_paise=100000)<>1 THEN
      RAISE EXCEPTION 'Stopped: this is not the expected Shalimar database / installed INR 1000 policy';
    END IF;
  END $$;`,
    migration,
    `SELECT '052 installed' AS migration, 'Private customer imports ready' AS customer_data,
    p.monthly_limit_paise/100 AS monthly_limit_inr,
    CASE WHEN p.enabled THEN 'ON - saved campaign approval still required' ELSE 'OFF' END AS managed_delivery,
    'Existing Contacts, credentials and Inbox replies unchanged' AS connection,
    'Upload the prepared CSV in Contacts > Customer Data, then review numbers, language and permission' AS next_step
    FROM public.messaging_budget_policies p WHERE p.phone_number_id='1391671597361924' AND p.waba_id='28787952197487898';`,
    'COMMIT;',
    '',
  ].join('\n')
);
console.log(output);

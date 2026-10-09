// Isolated PostgreSQL execution with PGlite. No production connection or sends.
// PGLITE_MODULE_ROOT points to a separately installed @electric-sql/pglite.
// Replays actual prerequisite migrations; auth/storage platform objects below
// are minimal stand-ins. Full Supabase replay remains a separate CI check.
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { test } from 'node:test';

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const moduleRoot = process.env.PGLITE_MODULE_ROOT;
if (!moduleRoot)
  throw new Error(
    'Set PGLITE_MODULE_ROOT to an isolated @electric-sql/pglite installation'
  );
const { PGlite } = await import(
  pathToFileURL(resolve(moduleRoot, 'dist/index.js')).href
);
const { uuid_ossp } = await import(
  pathToFileURL(resolve(moduleRoot, 'dist/contrib/uuid_ossp.js')).href
);
const { pgcrypto } = await import(
  pathToFileURL(resolve(moduleRoot, 'dist/contrib/pgcrypto.js')).href
);
const db = new PGlite({ extensions: { uuid_ossp, pgcrypto } });
const sql = async (text, values = []) => (await db.query(text, values)).rows;
const scalar = async (text, values = []) =>
  Object.values((await sql(text, values))[0])[0];
const file = (path) => readFile(resolve(root, path), 'utf8');
const user = '00000000-0000-4000-8000-000000000001';
const outsider = '00000000-0000-4000-8000-000000000002';

await db.exec(`
  CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
  CREATE SCHEMA auth;
  CREATE TABLE auth.users(id uuid PRIMARY KEY, email text, raw_user_meta_data jsonb DEFAULT '{}');
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
    $$SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid$$;
  GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
  CREATE SCHEMA extensions;
  CREATE SCHEMA storage;
  CREATE TABLE storage.buckets(id text PRIMARY KEY, name text, public boolean,
    file_size_limit bigint, allowed_mime_types text[]);
  CREATE TABLE storage.objects(id uuid PRIMARY KEY, bucket_id text, name text, owner uuid);
  ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
  CREATE FUNCTION storage.foldername(text) RETURNS text[] LANGUAGE sql AS
    $$SELECT string_to_array($1, '/')$$;
  CREATE PUBLICATION supabase_realtime;
  GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
`);
const prerequisites = new Set([34, 37, 38, 40, 41, 43, 44, 46, 48]);
for (const name of (
  await readdir(resolve(root, 'supabase/migrations'))
).sort()) {
  const n = Number(name.slice(0, 3));
    if (n <= 28 || prerequisites.has(n) || (n >= 50 && n <= 58)) {
    try {
      await db.exec(await file(`supabase/migrations/${name}`));
    } catch (error) {
      throw new Error(`Migration ${name}: ${error.message}`, { cause: error });
    }
  }
}

const member = '00000000-0000-4000-8000-000000000003';
await sql(
  `INSERT INTO auth.users(id,email) VALUES ($1,'owner@example.invalid'),($2,'other@example.invalid'),($3,'agent@example.invalid')`,
  [user, outsider, member]
);
const account = await scalar(
  'SELECT account_id FROM profiles WHERE user_id=$1',
  [user]
);
await sql(
  `UPDATE profiles SET account_id=$1,account_role='agent' WHERE user_id=$2`,
  [account, member]
);
async function as(id) {
  await db.exec('RESET ROLE');
  await sql(`SELECT set_config('request.jwt.claim.sub',$1,false)`, [id]);
  await db.exec('SET ROLE authenticated');
}
const row = (n, changes = {}) => ({
  source_key: `synthetic:${n}`,
  name: `Synthetic customer ${n}`,
  raw_phone: `916${String(n).padStart(9, '0')}`,
  first_order: '2024-04-01',
  last_order: '2026-05-01',
  orders: 4,
  lifetime_gross_paise: 8000000,
  gross_12m_paise: 6000000,
  orders_12m: 4,
  language: 'en',
  is_internal: false,
  ...changes,
});

const save = (rows, hash = 'a'.repeat(64), start = '2024-04-01') =>
  scalar(
    `SELECT save_customer_data_import('synthetic.csv',$1,$2,'2026-05-23',$3::jsonb)`,
    [hash, start, JSON.stringify(rows)]
  );
const preview = (id, preset = 'all_reviewed', language = 'en', tags = []) =>
  scalar('SELECT preview_customer_data_audience($1,$2,$3,$4::uuid[])', [
    id,
    preset,
    language,
    tags,
  ]);
const review = (id, language, permission = null) =>
  sql('SELECT review_customer_data_row($1,$2,$3::jsonb)', [
    id,
    language,
    permission ? JSON.stringify(permission) : null,
  ]);
const evidence = (status = 'opted_in', changes = {}) => ({
  status,
  observed_at: '2026-05-20T12:00:00Z',
  source: 'Synthetic explicit form',
  wording: 'I agree to WhatsApp marketing from the synthetic store.',
  evidence: 'Synthetic signed form receipt 1',
  ...changes,
});

await test('Customer imports, privacy, identity and language/permission audiences', async (t) => {
  let run, rows, tag;
  await t.test(
    'migration replays safely and anonymous RPC access is denied',
    async () => {
      await db.exec(
        await file('supabase/migrations/052_customer_data_imports.sql')
      );
      await db.exec('SET ROLE anon');
      await assert.rejects(() => save([row(1)]), /permission denied/);
      await db.exec('RESET ROLE');
    }
  );
  await t.test(
    'agent cannot import or publish; caller cannot supply another account',
    async () => {
      await as(member);
      await assert.rejects(
        () => save([row(1)]),
        /customer_data_admin_required/
      );
      await assert.rejects(
        () => sql('SELECT publish_customer_data_contacts($1)', [outsider]),
        /customer_data_admin_required/
      );
      // A caller-created temporary profile must never supply an elevated role.
      await sql(
        'CREATE TEMP TABLE profiles(user_id uuid,account_id uuid,account_role text)'
      );
      await sql(`INSERT INTO pg_temp.profiles VALUES($1,$2,'owner')`, [
        member,
        account,
      ]);
      await assert.rejects(
        () => save([row(1)]),
        /customer_data_admin_required/
      );
      await sql('DROP TABLE pg_temp.profiles');
      await as(user);
    }
  );
  await t.test(
    'invalid row rolls back the whole import, including its parent',
    async () => {
      await assert.rejects(
        () =>
          save([row(1), row(2, { gross_12m_paise: 9000000 })], 'b'.repeat(64)),
        /check constraint/
      );
      assert.equal(
        await scalar('SELECT count(*) FROM customer_data_imports'),
        0
      );
      await assert.rejects(
        () => save([row(2, { last_order: '2027-01-01' })], 'c'.repeat(64)),
        /customer_data_invalid_dates/
      );
      assert.equal(await scalar('SELECT count(*) FROM customer_data_rows'), 0);
    }
  );
  await t.test(
    'SQL recomputes shared, missing, ambiguous, invalid and internal quarantines',
    async () => {
      run = await save([
        row(1),
        row(2, { language: 'ml' }),
        row(3, { language: 'unknown' }),
        row(4),
        row(5),
        row(6),
        row(7),
        row(8, { raw_phone: row(7).raw_phone, phone_state: 'ready' }),
        row(9, { raw_phone: '' }),
        row(10, { raw_phone: `${row(10).raw_phone}/${row(11).raw_phone}` }),
        row(11, { raw_phone: '+44 1234567890' }),
        row(12, { is_internal: true }),
        row(13),
        row(14),
        row(15),
        row(16, { name: 'Repeated customer' }),
        row(17, { name: 'Repeated-Customer' }),
      ]);
      rows = await sql(
        'SELECT * FROM customer_data_rows WHERE import_id=$1 ORDER BY source_key',
        [run]
      );
      for (const [n, state] of [
        [7, 'shared_phone'],
        [8, 'shared_phone'],
        [9, 'missing_phone'],
        [10, 'ambiguous_phone'],
        [11, 'invalid_phone'],
        [12, 'internal_outlet'],
        [16, 'duplicate_name'],
        [17, 'duplicate_name'],
      ])
        assert.equal(
          rows.find((r) => r.source_key === `synthetic:${n}`).phone_state,
          state
        );
      assert.equal(
        await scalar(
          'SELECT ready_count FROM customer_data_imports WHERE id=$1',
          [run]
        ),
        9
      );
    }
  );
  await t.test(
    'repeating the same file is idempotent and creates no Contacts or consent',
    async () => {
      assert.equal(await save([row(999)]), run);
      assert.equal(
        await scalar('SELECT count(*) FROM customer_data_imports'),
        1
      );
      assert.equal(await scalar('SELECT count(*) FROM contacts'), 0);
      assert.equal(await scalar('SELECT count(*) FROM contact_consents'), 0);
    }
  );
  await t.test(
    'cross-account users cannot read imports or rows or invoke their RPCs',
    async () => {
      await as(outsider);
      assert.equal(
        await scalar('SELECT count(*) FROM customer_data_imports'),
        0
      );
      assert.equal(await scalar('SELECT count(*) FROM customer_data_rows'), 0);
      await assert.rejects(
        () => preview(run),
        /customer_data_import_not_found/
      );
      await assert.rejects(
        () => sql('SELECT publish_customer_data_contacts($1)', [run]),
        /customer_data_import_not_found/
      );
      await assert.rejects(
        () => review(rows[0].id, 'en'),
        /customer_data_row_not_found/
      );
      await as(user);
    }
  );
  await t.test(
    'authenticated users have no direct write privileges to reviewed source tables',
    async () => {
      await assert.rejects(
        () =>
          sql(
            `UPDATE customer_data_rows SET phone_state='ready' WHERE import_id=$1`,
            [run]
          ),
        /permission denied/
      );
      await assert.rejects(
        () => sql('DELETE FROM customer_data_imports WHERE id=$1', [run]),
        /permission denied/
      );
    }
  );
  await t.test(
    'publisher preserves identity conflicts, links legacy numbers, and never overwrites Contacts',
    async () => {
      await db.exec('RESET ROLE');
      await sql(
        `INSERT INTO contacts(account_id,user_id,phone,name,suppressed_at) VALUES
      ($1,$2,$3,'Different business',null),($1,$2,$4,'Synthetic customer 6',now()),
      ($1,$2,$5,'Synthetic customer 15',null),($1,$2,$6,'Synthetic customer 15',null)`,
        [
          account,
          user,
          row(5).raw_phone,
          row(6).raw_phone.slice(2),
          row(15).raw_phone,
          row(15).raw_phone.slice(2),
        ]
      );
      await as(user);
      const result = await scalar('SELECT publish_customer_data_contacts($1)', [
        run,
      ]);
      assert.equal(result.created, 6);
      assert.equal(result.linked, 7);
      assert.equal(result.conflicts, 2);
      assert.equal(
        await scalar(
          'SELECT ready_count FROM customer_data_imports WHERE id=$1',
          [run]
        ),
        7
      );
      assert.equal(await scalar('SELECT count(*) FROM contact_consents'), 0);
      assert.equal(
        await scalar('SELECT name FROM contacts WHERE phone=$1', [
          row(5).raw_phone,
        ]),
        'Different business'
      );
      assert.ok(
        await scalar('SELECT suppressed_at FROM contacts WHERE phone=$1', [
          row(6).raw_phone.slice(2),
        ])
      );
      assert.equal(
        (await scalar('SELECT publish_customer_data_contacts($1)', [run]))
          .created,
        0
      );
      rows = await sql('SELECT * FROM customer_data_rows WHERE import_id=$1', [
        run,
      ]);
    }
  );
  const by = (n) => rows.find((r) => r.source_key === `synthetic:${n}`);
  await t.test(
    'initial audience has zero reach, with language and permission explanations',
    async () => {
      const value = await preview(run);
      assert.equal(value.eligible, 0);
      assert.equal(value.total, 17);
      assert.equal(value.excluded, 17);
      assert.equal(value.reasons.language_unknown, 1);
      assert.equal(value.reasons.other_language, 1);
      assert.equal(value.source_as_of, '2026-05-23');
      assert.equal(value.source_kind, 'historical_csv');
    }
  );
  await t.test(
    'missing, future or unlinked evidence cannot grant permission',
    async () => {
      await assert.rejects(
        () => review(by(1).id, 'en', evidence('opted_in', { evidence: '' })),
        /evidence_required/
      );
      await assert.rejects(
        () =>
          review(
            by(1).id,
            'en',
            evidence('opted_in', { observed_at: '2099-01-01T00:00:00Z' })
          ),
        /invalid_permission/
      );
      await assert.rejects(
        () => review(by(9).id, 'en', evidence()),
        /contact_not_linked/
      );
      assert.equal(await scalar('SELECT count(*) FROM contact_consents'), 0);
    }
  );
  await t.test(
    'English and Malayalam audiences only include their language and explicit evidence',
    async () => {
      await review(by(1).id, 'en', evidence());
      await review(by(2).id, 'ml', evidence());
      await review(by(13).id, 'en', evidence());
      const en = await preview(run);
      const ml = await preview(run, 'all_reviewed', 'ml');
      assert.deepEqual(
        new Set(en.contacts.map((c) => c.id)),
        new Set([by(1).contact_id, by(13).contact_id])
      );
      assert.equal(ml.eligible, 1);
      assert.equal(ml.contacts[0].id, by(2).contact_id);
      assert.equal(en.source_sha256, 'a'.repeat(64));
    }
  );
  await t.test(
    'opt-out suppresses immediately; later opt-in never clears global suppression',
    async () => {
      await review(by(4).id, 'en', evidence('opted_out'));
      await review(
        by(4).id,
        'en',
        evidence('opted_in', { observed_at: '2026-05-21T12:00:00Z' })
      );
      await review(by(6).id, 'en', evidence());
      const value = await preview(run);
      assert.equal(value.reasons.opted_out, 2);
      assert.equal(value.eligible, 2);
      assert.ok(
        await scalar('SELECT suppressed_at FROM contacts WHERE id=$1', [
          by(4).contact_id,
        ])
      );
      await assert.rejects(
        () => review(by(4).id, 'en', evidence('opted_in')),
        /invalid_older_permission/
      );
    }
  );
  await t.test(
    'existing opted-in status without required evidence remains ineligible',
    async () => {
      await db.exec('RESET ROLE');
      await sql(
        `INSERT INTO contact_consents(account_id,contact_id,channel,category,status,source,wording_version)
      VALUES($1,$2,'whatsapp','marketing','opted_in','','')`,
        [account, by(14).contact_id]
      );
      await as(user);
      assert.equal((await preview(run)).eligible, 2);
    }
  );
  await t.test(
    'exclusion tags subtract actual contacts and membership reads never invent reach',
    async () => {
      await db.exec('RESET ROLE');
      tag = await scalar(
        `INSERT INTO tags(account_id,user_id,name) VALUES($1,$2,'Synthetic exclusion') RETURNING id`,
        [account, user]
      );
      await sql('INSERT INTO contact_tags(contact_id,tag_id) VALUES($1,$2)', [
        by(13).contact_id,
        tag,
      ]);
      await as(member);
      const value = await preview(run, 'all_reviewed', 'en', [tag]);
      assert.equal(value.eligible, 1);
      assert.equal(value.reasons.excluded_tag, 1);
      await assert.rejects(() => review(by(1).id, 'ml'), /admin_required/);
      await as(user);
    }
  );
  await t.test(
    'purchase thresholds use actual source amounts and date; short coverage is blocked',
    async () => {
      assert.equal((await preview(run, 'high_value_frequent')).eligible, 2);
      assert.equal((await preview(run, 'high_value_at_risk')).eligible, 0);
      assert.equal((await preview(run, 'low_value_one_time')).eligible, 0);
      await assert.rejects(
        () => preview(run, 'product_interest'),
        /unsupported_preset/
      );
      const short = await save(
        [row(100, { first_order: '2026-05-01' })],
        'd'.repeat(64),
        '2026-05-01'
      );
      await assert.rejects(
        () => preview(short, 'high_value_frequent'),
        /invalid_short_coverage/
      );
      assert.equal((await preview(short)).eligible, 0);
    }
  );
  await t.test(
    '1,505 customer rows are stored and classified without the API default 1,000-row truncation',
    async () => {
      const bulk = await save(
        Array.from({ length: 1505 }, (_, i) => row(1000 + i)),
        'e'.repeat(64)
      );
      const value = await preview(bulk);
      assert.equal(value.total, 1505);
      assert.equal(value.eligible, 0);
      const result = await scalar('SELECT publish_customer_data_contacts($1)', [
        bulk,
      ]);
      assert.equal(result.created, 1505);
      assert.equal((await preview(bulk)).reasons.permission_missing, 1505);
      await db.exec('RESET ROLE');
      await sql(
        `INSERT INTO contact_consents(account_id,contact_id,channel,category,status,source,wording_version,consented_at)
        SELECT account_id,contact_id,'whatsapp','marketing','opted_in','Synthetic explicit form','synthetic-v1','2026-05-20T12:00:00Z'
        FROM customer_data_rows WHERE import_id=$1`,
        [bulk]
      );
      await as(user);
      const eligible = await preview(bulk);
      assert.equal(eligible.eligible, 1505);
      assert.equal(eligible.contacts.length, 1505);
    }
  );
});
const awaitFile = await file('docs/sql/SHALIMAR_RUN_THIS_052.sql');
await test('exact SQL Editor handoff and read-only status remain safe', async (t) => {
  await t.test(
    'viewer sees permission status for imported Contacts without underlying evidence or other tenants',
    async () => {
      await db.exec('RESET ROLE');
      await sql(`UPDATE profiles SET account_role='viewer' WHERE user_id=$1`, [
        member,
      ]);
      const linked = await scalar(
        `SELECT contact_id FROM customer_data_rows WHERE account_id=$1 AND source_key='synthetic:1'`,
        [account]
      );
      await as(member);
      const statuses = await scalar(
        'SELECT customer_data_permission_status($1::uuid[])',
        [[linked]]
      );
      assert.deepEqual(statuses, [{ contact_id: linked, status: 'opted_in' }]);
      assert.equal(await scalar('SELECT count(*) FROM contact_consents'), 0);
      await as(outsider);
      assert.deepEqual(
        await scalar('SELECT customer_data_permission_status($1::uuid[])', [
          [linked],
        ]),
        []
      );
      await as(user);
    }
  );
  await t.test(
    'changed contact identity is held; legacy ten-digit formatting is never sent silently',
    async () => {
      await db.exec('RESET ROLE');
      const id = await scalar(
        `SELECT id FROM customer_data_imports WHERE account_id=$1 AND source_sha256=$2`,
        [account, 'a'.repeat(64)]
      );
      const contact = await scalar(
        `SELECT contact_id FROM customer_data_rows WHERE import_id=$1 AND source_key='synthetic:13'`,
        [id]
      );
      const legacy = await scalar(
        `SELECT contact_id FROM customer_data_rows WHERE import_id=$1 AND source_key='synthetic:6'`,
        [id]
      );
      await sql(`UPDATE contacts SET name='Changed identity' WHERE id=$1`, [
        contact,
      ]);
      await sql(`UPDATE contacts SET suppressed_at=null WHERE id=$1`, [legacy]);
      await as(user);
      const value = await preview(id);
      assert.equal(value.eligible, 1);
      assert.equal(value.reasons.contact_changed, 1);
      assert.equal(value.reasons.contact_number_format, 1);
      await db.exec('RESET ROLE');
      await sql(
        `UPDATE contacts SET name='Synthetic customer 13' WHERE id=$1`,
        [contact]
      );
      await sql(`UPDATE contacts SET suppressed_at=now() WHERE id=$1`, [
        legacy,
      ]);
    }
  );
  await t.test(
    'wrong database stops before changes and rolls back the entire handoff',
    async () => {
      await db.exec('RESET ROLE');
      await assert.rejects(
        () => db.exec(awaitFile),
        /expected Shalimar database/
      );
      await db.exec('ROLLBACK');
    }
  );
  await t.test(
    'whole handoff replays twice and preserves existing data, credentials and disabled policy',
    async () => {
      await sql(
        `INSERT INTO whatsapp_config(user_id,account_id,phone_number_id,waba_id,access_token,status)
      VALUES($1,$2,'1391671597361924','28787952197487898','synthetic-placeholder','connected')`,
        [user, account]
      );
      await sql(
        `INSERT INTO messaging_budget_policies(account_id,monthly_limit_paise,phone_number_id,waba_id,enabled,reservation_paise)
      VALUES($1,100000,'1391671597361924','28787952197487898',false,200)`,
        [account]
      );
      const before = await scalar('SELECT count(*) FROM contacts');
      const imports = await scalar(
        'SELECT count(*) FROM customer_data_imports'
      );
      await db.exec(awaitFile);
      await db.exec(awaitFile);
      assert.equal(await scalar('SELECT count(*) FROM contacts'), before);
      assert.equal(
        await scalar('SELECT count(*) FROM customer_data_imports'),
        imports
      );
      assert.equal(
        await scalar(
          'SELECT enabled FROM messaging_budget_policies WHERE account_id=$1',
          [account]
        ),
        false
      );
      assert.equal(
        await scalar(
          'SELECT monthly_limit_paise FROM messaging_budget_policies WHERE account_id=$1',
          [account]
        ),
        100000
      );
      assert.equal(
        await scalar(
          'SELECT access_token FROM whatsapp_config WHERE account_id=$1',
          [account]
        ),
        'synthetic-placeholder'
      );
    }
  );
});
await test('Tally independent controls block legacy self-consistency', async () => {
  await db.exec('RESET ROLE');
  await db.exec('SET ROLE service_role');
  const run = '10000000-0000-4000-8000-000000000001';
  await sql(`INSERT INTO tally_sync_runs(id,account_id,payload_sha256,company_name,company_fingerprint,tally_release,source_period_start,source_period_end,counts,gross_value_paise) VALUES($1,$2,$3,'SHALIMAR FASHIONS',$4,'7.1','2026-06-01','2026-10-08','{"ledgers":0,"vouchers":1,"stock_items":0}',12500)`, [run, account, '1'.repeat(64), '2'.repeat(64)]);
  await sql(`INSERT INTO tally_sync_vouchers(run_id,account_id,source_id,voucher_date,gross_value_paise) VALUES($1,$2,'v1','2026-06-01',12500)`, [run, account]);
  await as(user);
  const blocked = await scalar('SELECT tally_reconcile_run($1)', [run]);
  assert.match(JSON.stringify(blocked), /missing_control_totals/);
  await db.exec('RESET ROLE');
  await db.exec('SET ROLE service_role');
  const run2 = '10000000-0000-4000-8000-000000000002';
  const controls = { source: 'tally_sales_register', collection_method: 'operator_readback', metric_scope: 'posted_sales_gross_v1', voucher_count: 1, gross_value_paise: 12500, period_start: '2026-06-01', period_end: '2026-10-08', captured_at: '2026-10-09T20:00:00Z' };
  await sql(`INSERT INTO tally_sync_runs(id,account_id,payload_sha256,company_name,company_fingerprint,tally_release,source_period_start,source_period_end,counts,gross_value_paise,control_totals) VALUES($1,$2,$3,'SHALIMAR FASHIONS',$4,'7.1','2026-06-01','2026-10-08','{"ledgers":0,"vouchers":1,"stock_items":0}',12500,$5::jsonb)`, [run2, account, '3'.repeat(64), '4'.repeat(64), JSON.stringify(controls)]);
  await sql(`INSERT INTO tally_sync_vouchers(run_id,account_id,source_id,voucher_date,gross_value_paise) VALUES($1,$2,'v2','2026-06-01',12500)`, [run2, account]);
  await as(user);
  const reconciled = await scalar('SELECT tally_reconcile_run($1)', [run2]);
  assert.match(JSON.stringify(reconciled), /reconciled/);
  assert.equal(await scalar('SELECT metric_version FROM tally_report_snapshots WHERE run_id=$1', [run2]), 'tally-v2');
});
await db.close();

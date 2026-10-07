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
const payloadHash = 'a'.repeat(64);
let state;

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
  if (n <= 28 || prerequisites.has(n) || n === 50) {
    try {
      await db.exec(await file(`supabase/migrations/${name}`));
    } catch (error) {
      throw new Error(`Migration ${name}: ${error.message}`, { cause: error });
    }
  }
}

async function fixture() {
  await sql(
    `INSERT INTO auth.users(id,email) VALUES ($1,'owner@example.invalid'),($2,'other@example.invalid')`,
    [user, outsider]
  );
  const account = await scalar(
    'SELECT account_id FROM profiles WHERE user_id=$1',
    [user]
  );
  const otherAccount = await scalar(
    'SELECT account_id FROM profiles WHERE user_id=$1',
    [outsider]
  );
  await sql(`SELECT set_config('request.jwt.claim.sub',$1,true)`, [user]);
  await sql(
    `INSERT INTO whatsapp_config(user_id,account_id,phone_number_id,waba_id,access_token,status)
    VALUES ($1,$2,'10001','20001','test-placeholder','connected')`,
    [user, account]
  );
  await sql(
    `INSERT INTO messaging_budget_policies(account_id,monthly_limit_paise,phone_number_id,waba_id,
    enabled,reservation_paise,rate_source,rate_reviewed_at,rate_valid_until)
    VALUES ($1,1000,'10001','20001',true,200,'test-only rate',now(),now()+interval '1 day')`,
    [account]
  );
  const contacts = await sql(
    `INSERT INTO contacts(user_id,account_id,phone,name)
    SELECT $1,$2,'91900000000'||n,'Synthetic contact '||n FROM generate_series(1,6) n RETURNING id`,
    [user, account]
  );
  const template = await scalar(
    `INSERT INTO message_templates(user_id,account_id,name,language,body_text,category,status,meta_template_id)
    VALUES ($1,$2,'test_notice','en_US','Test {{1}}','Marketing','APPROVED','test-template') RETURNING id`,
    [user, account]
  );
  const broadcast = await scalar(
    `INSERT INTO broadcasts(user_id,account_id,name,template_name,template_language)
    VALUES ($1,$2,'Synthetic campaign','test_notice','en_US') RETURNING id`,
    [user, account]
  );
  const recipients = [];
  for (const { id } of contacts) {
    const recipient = await scalar(
      `INSERT INTO broadcast_recipients(broadcast_id,contact_id,template_params,status)
      VALUES ($1,$2,'["customer"]','pending') RETURNING id`,
      [broadcast, id]
    );
    recipients.push(recipient);
    await sql(
      `INSERT INTO contact_consents(account_id,contact_id,channel,category,status,source,wording_version,consented_at)
      VALUES ($1,$2,'whatsapp','marketing','opted_in','test form','test-v1',now())`,
      [account, id]
    );
  }
  const automation = await scalar(
    `INSERT INTO automations(user_id,account_id,name,trigger_type,is_active)
    VALUES ($1,$2,'Synthetic workflow','message_received',true) RETURNING id`,
    [user, account]
  );
  const step = await scalar(
    `INSERT INTO automation_steps(automation_id,step_type,position,step_config)
    VALUES ($1,'send_message',0,'{"text":"Test reply"}') RETURNING id`,
    [automation]
  );
  const run = await scalar(
    `INSERT INTO automation_logs(user_id,account_id,automation_id,contact_id,trigger_event,status)
    VALUES ($1,$2,$3,$4,'test','failed') RETURNING id`,
    [user, account, automation, contacts[0].id]
  );
  const conversation = await scalar(
    `INSERT INTO conversations(user_id,account_id,contact_id)
    VALUES ($1,$2,$3) RETURNING id`,
    [user, account, contacts[0].id]
  );
  const inbound = await scalar(
    `INSERT INTO messages(conversation_id,sender_type,content_text,message_id,created_at)
    VALUES ($1,'customer','Hello','synthetic-inbound',now()-interval '1 minute') RETURNING id`,
    [conversation]
  );
  return {
    account,
    otherAccount,
    contacts: contacts.map((c) => c.id),
    template,
    broadcast,
    recipients,
    automation,
    step,
    run,
    conversation,
    inbound,
  };
}
const fingerprint = (kind = 'broadcast') =>
  scalar('SELECT messaging_source_fingerprint($1,$2,$3)', [
    state.account,
    kind,
    state[kind],
  ]);
async function approve(kind = 'broadcast') {
  const fp = await fingerprint(kind);
  await db.exec('SET LOCAL ROLE authenticated');
  try {
    await sql('SELECT approve_messaging_source($1,$2,$3,$4)', [
      state.account,
      kind,
      state[kind],
      fp,
    ]);
  } finally {
    // Keep the original SQL error; rejects() rolls an aborted transaction back
    // to its savepoint (which also restores the role).
    await db.exec('RESET ROLE').catch(() => {});
  }
  return fp;
}
async function claim({
  index = 0,
  kind = 'broadcast',
  fp,
  hash = payloadHash,
  account = state.account,
  run = state.run,
} = {}) {
  const current = fp ?? (await fingerprint(kind));
  await db.exec('SET LOCAL ROLE service_role');
  try {
    return await scalar(
      `SELECT claim_messaging_delivery($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        account,
        kind,
        state[kind],
        state.contacts[index],
        current,
        hash,
        kind === 'broadcast' ? state.recipients[index] : null,
        kind === 'automation' ? run : null,
        kind === 'automation' ? state.step : null,
      ]
    );
  } finally {
    await db.exec('RESET ROLE').catch(() => {});
  }
}
// PostgreSQL aborts a transaction after an error. Savepoints let the test
// inspect the unchanged ledger and continue testing the same persisted claim.
async function rejects(action, message) {
  await db.exec('SAVEPOINT expected_failure');
  try {
    await assert.rejects(action, new RegExp(message));
  } finally {
    await db.exec(
      'ROLLBACK TO SAVEPOINT expected_failure; RELEASE SAVEPOINT expected_failure'
    );
  }
}
async function finish(id, outcome, wamid = null) {
  await db.exec('SET LOCAL ROLE service_role');
  try {
    await sql('SELECT finish_messaging_delivery($1,$2,$3,$4)', [
      state.account,
      id,
      outcome,
      wamid,
    ]);
  } finally {
    await db.exec('RESET ROLE').catch(() => {});
  }
}

await test('managed messaging PostgreSQL controls', async (t) => {
  const check = async (name, fn) =>
    t.test(name, async () => {
      await db.exec('BEGIN');
      try {
        state = await fixture();
        await fn();
      } finally {
        await db.exec('ROLLBACK');
      }
    });
  await check(
    'migration replays without resetting policy, approvals or reservations',
    async () => {
      await approve();
      await claim();
      await db.exec(
        await file('supabase/migrations/050_managed_messaging_budget.sql')
      );
      assert.equal(
        await scalar('SELECT count(*)::int FROM messaging_delivery_ledger'),
        1
      );
      assert.equal(
        await scalar(
          'SELECT sum(reserved_paise)::int FROM messaging_delivery_ledger'
        ),
        200
      );
      assert.equal(
        await scalar('SELECT enabled FROM messaging_budget_policies'),
        true
      );
    }
  );
  await check(
    'browser and service role cannot directly mutate protected tables',
    async () => {
      for (const role of ['anon', 'authenticated', 'service_role']) {
        for (const table of [
          'messaging_budget_policies',
          'messaging_source_approvals',
          'messaging_delivery_ledger',
        ]) {
          for (const action of ['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE']) {
            assert.equal(
              await scalar('SELECT has_table_privilege($1,$2,$3)', [
                role,
                table,
                action,
              ]),
              false
            );
          }
        }
      }
      for (const role of ['anon', 'authenticated']) {
        assert.equal(
          await scalar(
            `SELECT has_function_privilege($1,'claim_messaging_delivery(uuid,text,uuid,uuid,text,text,uuid,uuid,uuid)','EXECUTE')`,
            [role]
          ),
          false
        );
      }
    }
  );
  await check(
    'another account cannot read budgets or approve the source',
    async () => {
      await sql(`SELECT set_config('request.jwt.claim.sub',$1,true)`, [
        outsider,
      ]);
      await db.exec('SET LOCAL ROLE authenticated');
      assert.equal(
        await scalar('SELECT count(*)::int FROM messaging_budget_policies'),
        0
      );
      await rejects(
        () =>
          sql('SELECT preview_messaging_approval($1,$2,$3)', [
            state.account,
            'broadcast',
            state.broadcast,
          ]),
        'messaging_admin_required'
      );
      await db.exec('RESET ROLE');
      await rejects(
        () => claim({ account: state.otherAccount }),
        'messaging_managed_disabled'
      );
    }
  );
  await check('agents cannot approve a campaign', async () => {
    await sql(`UPDATE profiles SET account_role='agent' WHERE user_id=$1`, [
      user,
    ]);
    await rejects(() => approve(), 'messaging_admin_required');
  });
  await check('disabled policy and missing approval fail closed', async () => {
    await rejects(() => claim(), 'messaging_approval_required');
    await approve();
    await sql('UPDATE messaging_budget_policies SET enabled=false');
    await rejects(() => claim(), 'messaging_managed_disabled');
    assert.equal(
      await scalar('SELECT count(*)::int FROM messaging_delivery_ledger'),
      0
    );
  });
  await check(
    'missing or expired rate review cannot reserve money',
    async () => {
      await rejects(
        () => sql('UPDATE messaging_budget_policies SET rate_valid_until=NULL'),
        'check constraint'
      );
      await sql(
        `UPDATE messaging_budget_policies SET rate_reviewed_at=now()-interval '2 days',rate_valid_until=now()-interval '1 day'`
      );
      await approve();
      await rejects(() => claim(), 'messaging_rate_review_required');
    }
  );
  await check(
    'approval is stable across time zones and progress updates',
    async () => {
      const fp = await approve();
      await db.exec(`SET LOCAL TIME ZONE 'Asia/Kolkata'`);
      assert.equal(await fingerprint(), fp);
      await sql(
        `UPDATE broadcasts SET status='sending',sent_count=1,updated_at=now()`
      );
      assert.equal(await fingerprint(), fp);
    }
  );
  await check(
    'content or recipient changes invalidate previous approval',
    async () => {
      const fp = await approve();
      await sql(
        `UPDATE broadcast_recipients SET template_params='["changed"]' WHERE id=$1`,
        [state.recipients[0]]
      );
      await rejects(() => claim({ fp }), 'messaging_source_changed');
      await rejects(() => claim(), 'messaging_approval_required');
    }
  );
  await check('demotion and revocation invalidate approval', async () => {
    await approve();
    await sql(`UPDATE profiles SET account_role='agent' WHERE user_id=$1`, [
      user,
    ]);
    await rejects(() => claim(), 'messaging_approver_no_longer_authorized');
    await sql(`UPDATE profiles SET account_role='owner' WHERE user_id=$1`, [
      user,
    ]);
    await sql(`SELECT revoke_messaging_source($1,'broadcast',$2)`, [
      state.account,
      state.broadcast,
    ]);
    await rejects(() => claim(), 'messaging_approval_required');
  });
  await check(
    'recipient replacement cannot bypass permanent deduplication',
    async () => {
      await approve();
      const first = await claim();
      await sql('DELETE FROM broadcast_recipients WHERE id=$1', [
        state.recipients[0],
      ]);
      state.recipients[0] = await scalar(
        `INSERT INTO broadcast_recipients(broadcast_id,contact_id,template_params)
      VALUES ($1,$2,'["customer"]') RETURNING id`,
        [state.broadcast, state.contacts[0]]
      );
      await approve();
      const duplicate = await claim();
      assert.equal(duplicate.claimed, false);
      assert.equal(duplicate.delivery_id, first.delivery_id);
      await rejects(
        () => claim({ hash: 'b'.repeat(64) }),
        'messaging_operation_payload_changed'
      );
      assert.equal(
        await scalar(
          'SELECT sum(reserved_paise)::int FROM messaging_delivery_ledger'
        ),
        200
      );
    }
  );
  await check(
    'unknown outcome retains reservation and cannot be retried',
    async () => {
      await approve();
      const first = await claim();
      await finish(first.delivery_id, 'uncertain');
      const duplicate = await claim();
      assert.equal(duplicate.claimed, false);
      assert.equal(duplicate.outcome, 'uncertain');
      await rejects(
        () => finish(first.delivery_id, 'accepted', 'synthetic-wamid'),
        'messaging_result_already_recorded'
      );
      assert.equal(
        await scalar(
          'SELECT sum(reserved_paise)::int FROM messaging_delivery_ledger'
        ),
        200
      );
    }
  );
  await check(
    'accepted response is idempotent and needs a provider receipt',
    async () => {
      await approve();
      const first = await claim();
      await rejects(
        () => finish(first.delivery_id, 'accepted'),
        'check constraint'
      );
      await finish(first.delivery_id, 'accepted', 'synthetic-wamid');
      await finish(first.delivery_id, 'accepted', 'synthetic-wamid');
      await rejects(
        () => finish(first.delivery_id, 'failed'),
        'messaging_result_already_recorded'
      );
      assert.equal((await claim()).claimed, false);
    }
  );
  await check(
    'monthly cap includes failed attempts and blocks the next reservation',
    async () => {
      await approve();
      for (let index = 0; index < 5; index++) {
        const result = await claim({ index });
        if (index === 0) await finish(result.delivery_id, 'failed');
      }
      await rejects(
        () => claim({ index: 5 }),
        'messaging_monthly_budget_exhausted'
      );
      assert.equal(
        await scalar(
          'SELECT sum(reserved_paise)::int FROM messaging_delivery_ledger'
        ),
        1000
      );
    }
  );
  await check(
    'new calendar month excludes prior month spend but not prior claim identity',
    async () => {
      await approve();
      const first = await claim();
      await sql(
        `UPDATE messaging_delivery_ledger SET budget_month=budget_month-interval '1 month'`
      );
      for (let index = 1; index < 6; index++) await claim({ index });
      assert.equal((await claim()).delivery_id, first.delivery_id);
      assert.equal((await claim()).claimed, false);
      assert.equal(
        await scalar(`SELECT sum(reserved_paise)::int FROM messaging_delivery_ledger
      WHERE budget_month=date_trunc('month',now() AT TIME ZONE 'Asia/Kolkata')::date`),
        1000
      );
      assert.equal(
        await scalar(
          `SELECT date_trunc('month','2026-10-31 20:00:00+00'::timestamptz AT TIME ZONE 'Asia/Kolkata')::date::text`
        ),
        '2026-11-01'
      );
    }
  );
  await check(
    'missing, blank, revoked or future consent is not opt-in evidence',
    async () => {
      await approve();
      for (const update of [
        "source=' '",
        "source=E'\\n\\t'",
        "wording_version=' '",
        "status='unknown'",
        'revoked_at=now()',
        "consented_at=now()+interval '1 day'",
      ]) {
        await db.exec('SAVEPOINT consent_case');
        await sql('UPDATE contact_consents SET ' + update);
        await rejects(() => claim(), 'messaging_documented_opt_in_required');
        await db.exec(
          'ROLLBACK TO SAVEPOINT consent_case; RELEASE SAVEPOINT consent_case'
        );
      }
      await sql('DELETE FROM contact_consents');
      await rejects(() => claim(), 'messaging_documented_opt_in_required');
    }
  );
  await check(
    'suppression, opt-out and latest inbound STOP each block',
    async () => {
      await approve();
      await sql(`UPDATE contacts SET suppressed_at=now() WHERE id=$1`, [
        state.contacts[0],
      ]);
      await rejects(() => claim(), 'messaging_contact_suppressed');
      await sql('UPDATE contacts SET suppressed_at=NULL');
      await sql(`UPDATE contact_consents SET status='opted_out'`);
      await rejects(() => claim(), 'messaging_consent_opted_out');
      await sql(`UPDATE contact_consents SET status='opted_in'`);
      await sql(`UPDATE messages SET content_text=E'\n STOP \n'`);
      await rejects(() => claim(), 'messaging_inbound_opt_out');
    }
  );
  await check(
    'wrong sender, non-India recipient and historical attempt block',
    async () => {
      await approve();
      await sql(`UPDATE whatsapp_config SET phone_number_id='99999'`);
      await rejects(() => claim(), 'messaging_sender_mismatch');
      await sql(`UPDATE whatsapp_config SET phone_number_id='10001'`);
      await sql(`UPDATE contacts SET phone='+447700900000' WHERE id=$1`, [
        state.contacts[0],
      ]);
      await approve();
      await rejects(() => claim(), 'messaging_india_mobile_required');
      await sql(`UPDATE contacts SET phone='919000000001' WHERE id=$1`, [
        state.contacts[0],
      ]);
      await approve();
      await sql(
        `UPDATE broadcast_recipients SET whatsapp_message_id='old-wamid' WHERE id=$1`,
        [state.recipients[0]]
      );
      await rejects(
        () => claim(),
        'messaging_historical_attempt_requires_review'
      );
    }
  );
  await check(
    'pending template and authentication category block',
    async () => {
      await sql(`UPDATE message_templates SET status='PENDING'`);
      await approve();
      await rejects(() => claim(), 'messaging_template_not_approved');
      await sql(
        `UPDATE message_templates SET status='APPROVED',category='Authentication'`
      );
      await approve();
      await rejects(() => claim(), 'messaging_category_unsupported');
    }
  );
  await check(
    'automation shares campaign budget and derives a stable run/step key',
    async () => {
      await approve();
      for (let index = 0; index < 4; index++) await claim({ index });
      await approve('automation');
      const first = await claim({ kind: 'automation' });
      assert.equal(first.claimed, true);
      assert.equal((await claim({ kind: 'automation' })).claimed, false);
      await rejects(
        () => claim({ index: 4 }),
        'messaging_monthly_budget_exhausted'
      );
      await rejects(
        () => claim({ kind: 'automation', run: outsider }),
        'messaging_run_not_found'
      );
    }
  );
  await check(
    'automation edits require new approval and service requires recent provider inbound',
    async () => {
      const fp = await approve('automation');
      await sql(`UPDATE automation_steps SET step_config='{"text":"Changed"}'`);
      await rejects(
        () => claim({ kind: 'automation', fp }),
        'messaging_source_changed'
      );
      await approve('automation');
      await sql(`UPDATE messages SET created_at=now()-interval '24 hours'`);
      await rejects(
        () => claim({ kind: 'automation' }),
        'messaging_service_window_closed'
      );
      await sql(`UPDATE messages SET created_at=now()+interval '1 minute'`);
      await rejects(
        () => claim({ kind: 'automation' }),
        'messaging_service_window_closed'
      );
      await sql(`UPDATE messages SET created_at=now(),message_id=NULL`);
      await rejects(
        () => claim({ kind: 'automation' }),
        'messaging_service_window_closed'
      );
    }
  );
  await check(
    'SQL Editor setup stops on the wrong sender and preserves existing settings',
    async () => {
      const setup = await file('supabase/setup/shalimar-budget-policy.sql');
      await rejects(
        () => db.exec(setup),
        'Setup stopped: expected one saved Shalimar sender connection, found 0'
      );
      assert.equal(
        await scalar('SELECT enabled FROM messaging_budget_policies'),
        true
      );
      await sql(
        `UPDATE whatsapp_config SET phone_number_id='1391671597361924',waba_id='28787952197487898'`
      );
      await rejects(
        () => db.exec(setup),
        'Setup stopped: an existing policy differs'
      );
      assert.equal(
        await scalar(
          'SELECT monthly_limit_paise FROM messaging_budget_policies'
        ),
        1000
      );
    }
  );
  await check(
    'SQL Editor setup installs INR 1000 disabled and can be run again',
    async () => {
      await sql('DELETE FROM messaging_budget_policies');
      await sql(
        `UPDATE whatsapp_config SET phone_number_id='1391671597361924',waba_id='28787952197487898'`
      );
      const setup = await file('supabase/setup/shalimar-budget-policy.sql');
      await db.exec(setup);
      await db.exec(setup);
      const row = (
        await sql(
          'SELECT monthly_limit_paise,enabled,reservation_paise FROM messaging_budget_policies'
        )
      )[0];
      assert.deepEqual(row, {
        monthly_limit_paise: 100000,
        enabled: false,
        reservation_paise: null,
      });
      assert.equal(
        await scalar('SELECT count(*)::int FROM messaging_source_approvals'),
        0
      );
      assert.equal(
        await scalar('SELECT count(*)::int FROM messaging_delivery_ledger'),
        0
      );
      assert.equal(
        await scalar('SELECT access_token FROM whatsapp_config'),
        'test-placeholder'
      );
      assert.equal(await scalar('SELECT count(*)::int FROM contacts'), 6);
    }
  );
  await check(
    'SQL Editor setup refuses an ambiguous matching connection',
    async () => {
      // Simulate an older database missing migration 013's uniqueness repair.
      // This DDL is inside the synthetic test transaction and is rolled back.
      await sql(
        'ALTER TABLE whatsapp_config DROP CONSTRAINT whatsapp_config_phone_number_id_key'
      );
      await sql(
        `UPDATE whatsapp_config SET phone_number_id='1391671597361924',waba_id='28787952197487898'`
      );
      await sql(
        `INSERT INTO whatsapp_config(user_id,account_id,phone_number_id,waba_id,access_token)
      VALUES ($1,$2,'1391671597361924','28787952197487898','test-placeholder')`,
        [outsider, state.otherAccount]
      );
      const setup = await file('supabase/setup/shalimar-budget-policy.sql');
      await rejects(
        () => db.exec(setup),
        'Setup stopped: expected one saved Shalimar sender connection, found 2'
      );
    }
  );
  await t.test(
    'exact copy-paste bundle rolls back on mismatch, then installs and replays safely',
    async () => {
      const bundle = await file('docs/sql/SHALIMAR_RUN_THIS_050.sql');
      assert.ok(
        bundle.includes(
          await file('supabase/migrations/050_managed_messaging_budget.sql')
        )
      );
      assert.ok(
        bundle.includes(await file('supabase/setup/shalimar-budget-policy.sql'))
      );
      await db.exec('BEGIN');
      state = await fixture();
      await db.exec('COMMIT');
      await assert.rejects(() => db.exec(bundle), /Setup stopped/);
      await db.exec('ROLLBACK');
      assert.equal(
        await scalar('SELECT enabled FROM messaging_budget_policies'),
        true
      );
      await sql('DELETE FROM messaging_budget_policies');
      await sql(
        `UPDATE whatsapp_config SET phone_number_id='1391671597361924',waba_id='28787952197487898'`
      );
      await db.exec(bundle);
      await db.exec(bundle);
      assert.equal(
        await scalar(
          'SELECT monthly_limit_paise FROM messaging_budget_policies'
        ),
        100000
      );
      assert.equal(
        await scalar('SELECT enabled FROM messaging_budget_policies'),
        false
      );
      assert.equal(
        await scalar('SELECT count(*)::int FROM messaging_delivery_ledger'),
        0
      );
    }
  );
});
await db.close();

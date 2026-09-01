import { randomUUID } from 'node:crypto';
import { neon } from '@neondatabase/serverless';
import { isAuthenticated } from '../lib/auth.js';

const fields = ['transport', 'stay', 'food', 'activities', 'other'];

function text(value, max = 120) {
  return String(value ?? '').trim().slice(0, max);
}
function amount(value) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : 0;
}
function validDate(value) {
  const s = text(value, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}
function exactJpy(description) {
  const match = String(description ?? '').match(/\bJPY\s*([\d.,]+)/i);
  if (!match) return null;
  const token = match[1].replace(/([.,])00$/, '').replace(/[^\d]/g, '');
  const value = Number(token);
  return Number.isFinite(value) && value > 0 ? value : null;
}

async function getConfig(sql) {
  const rows = await sql`
    SELECT id, COALESCE(extracted_summary, '{}'::jsonb) AS summary
    FROM documents
    WHERE document_type = 'moneyos_config' AND source_name = 'MoneyOS private config'
    ORDER BY document_date DESC NULLS LAST, created_at DESC
    LIMIT 1
  `;
  return rows[0] ?? null;
}

async function withActuals(sql, config, trips) {
  const map = config.summary?.trip_transaction_map && typeof config.summary.trip_transaction_map === 'object'
    ? config.summary.trip_transaction_map
    : {};
  const rate = Number(config.summary?.japan?.budget?.planning_rate?.jpy_nok ?? 0);
  const ids = Object.keys(map);
  let transactionRows = [];
  if (ids.length) {
    transactionRows = await sql`
      SELECT
        t.id::text AS id,
        t.transaction_date,
        ROUND(t.amount::numeric, 2) AS amount_nok,
        t.merchant,
        t.description,
        COALESCE(c.name, 'Annet') AS category,
        a.name AS account
      FROM transactions t
      JOIN accounts a ON a.id = t.account_id
      LEFT JOIN categories c ON c.id = t.category_id
      WHERE t.transaction_type = 'expense'
        AND COALESCE(t.is_pending, false) = false
        AND t.id::text IN (SELECT jsonb_object_keys(${JSON.stringify(map)}::jsonb))
      ORDER BY t.transaction_date DESC, t.id DESC
    `;
  }

  const tx = transactionRows.map(row => {
    const assignment = map[row.id] ?? {};
    const exact = exactJpy(row.description);
    const amountJpy = exact ?? (rate > 0 ? Number(row.amount_nok) / rate : 0);
    return {
      ...row,
      trip_id: assignment.trip_id ?? null,
      bucket: fields.includes(assignment.bucket) ? assignment.bucket : 'other',
      amount_jpy: Math.round(amountJpy),
      jpy_source: exact != null ? 'bank' : 'planning_rate'
    };
  });

  const walletLedger = Array.isArray(config.summary?.japan?.wallets?.ledger) ? config.summary.japan.wallets.ledger : [];
  const walletTripExpenses = walletLedger.filter(entry => entry?.type === 'expense' && entry?.trip_id && fields.includes(entry?.trip_bucket)).map(entry => ({
    id: `wallet:${entry.id}`,
    transaction_date: entry.date,
    amount_nok: null,
    merchant: entry.note || 'Japan-lommebok',
    description: entry.note || '',
    category: 'Japan-lommebok',
    account: entry.wallet === 'icoca' ? 'ICOCA' : 'Kontanter',
    trip_id: entry.trip_id,
    bucket: entry.trip_bucket,
    amount_jpy: Math.round(Number(entry.amount_jpy ?? 0)),
    jpy_source: 'wallet'
  }));
  const allTx = [...tx, ...walletTripExpenses];

  return trips.map(trip => {
    const relevant = allTx.filter(row => String(row.trip_id) === String(trip.id));
    const actuals = Object.fromEntries(fields.map(field => [field, relevant.filter(row => row.bucket === field).reduce((sum, row) => sum + Number(row.amount_jpy || 0), 0)]));
    const budgetTotal = fields.reduce((sum, field) => sum + Number(trip.budgets?.[field] || 0), 0);
    const actualTotal = fields.reduce((sum, field) => sum + Number(actuals[field] || 0), 0);
    return {
      ...trip,
      actuals,
      actual_total_jpy: Math.round(actualTotal),
      budget_total_jpy: Math.round(budgetTotal),
      remaining_jpy: Math.round(budgetTotal - actualTotal),
      transactions: relevant
    };
  });
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  try {
    if (!isAuthenticated(req)) return res.status(401).json({ error: 'Unauthorized' });
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not configured');
    const sql = neon(process.env.DATABASE_URL);
    const config = await getConfig(sql);
    if (!config) return res.status(500).json({ error: 'MoneyOS-konfigurasjonen mangler' });
    const japan = config.summary?.japan ?? {};
    const trips = Array.isArray(japan.trips) ? japan.trips : [];

    if (req.method === 'GET') {
      return res.status(200).json({ trips: await withActuals(sql, config, trips) });
    }

    if (req.method === 'POST') {
      const id = text(req.body?.id, 80) || randomUUID();
      const name = text(req.body?.name, 80);
      const startDate = validDate(req.body?.start_date);
      const endDate = validDate(req.body?.end_date);
      if (!name) return res.status(400).json({ error: 'Gi turen et navn' });
      if (!startDate || !endDate || endDate < startDate) return res.status(400).json({ error: 'Velg gyldige datoer' });
      const budgets = Object.fromEntries(fields.map(key => [key, amount(req.body?.budgets?.[key])]));
      const trip = {
        id,
        name,
        start_date: startDate,
        end_date: endDate,
        currency: 'JPY',
        budgets,
        include_in_plan: req.body?.include_in_plan !== false,
        updated_at: new Date().toISOString()
      };
      const next = [trip, ...trips.filter(item => String(item?.id) !== id)].sort((a, b) => String(a.start_date).localeCompare(String(b.start_date)));
      await sql`
        UPDATE documents
        SET extracted_summary = jsonb_set(COALESCE(extracted_summary, '{}'::jsonb), '{japan,trips}', ${JSON.stringify(next)}::jsonb, true)
        WHERE id = ${config.id}
      `;
      return res.status(200).json({ ok: true, trip, trips: await withActuals(sql, { ...config, summary: { ...config.summary, japan: { ...japan, trips: next } } }, next) });
    }

    if (req.method === 'DELETE') {
      const id = text(req.query?.id, 80);
      if (!id) return res.status(400).json({ error: 'Mangler tur-ID' });
      const next = trips.filter(item => String(item?.id) !== id);
      const oldMap = config.summary?.trip_transaction_map && typeof config.summary.trip_transaction_map === 'object' ? config.summary.trip_transaction_map : {};
      const nextMap = Object.fromEntries(Object.entries(oldMap).filter(([, assignment]) => String(assignment?.trip_id) !== id));
      const nextSummary = { ...config.summary, japan: { ...japan, trips: next }, trip_transaction_map: nextMap };
      await sql`
        UPDATE documents
        SET extracted_summary = ${JSON.stringify(nextSummary)}::jsonb
        WHERE id = ${config.id}
      `;
      return res.status(200).json({ ok: true, trips: await withActuals(sql, { ...config, summary: nextSummary }, next) });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Kunne ikke lagre turbudsjettet' });
  }
}

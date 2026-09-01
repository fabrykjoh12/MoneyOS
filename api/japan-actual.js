import { neon } from '@neondatabase/serverless';
import { isAuthenticated } from '../lib/auth.js';

function monthBounds(month) {
  const [year, mon] = month.split('-').map(Number);
  const start = new Date(Date.UTC(year, mon - 1, 1));
  const end = new Date(Date.UTC(year, mon, 0));
  const iso = d => d.toISOString().slice(0, 10);
  return { start: iso(start), end: iso(end) };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('Pragma', 'no-cache');

  try {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
    if (!isAuthenticated(req)) return res.status(401).json({ error: 'Unauthorized' });
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not configured');

    const month = String(req.query?.month ?? new Date().toISOString().slice(0, 7));
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return res.status(400).json({ error: 'Ugyldig måned' });

    const sql = neon(process.env.DATABASE_URL);
    const configRows = await sql`
      SELECT extracted_summary
      FROM documents
      WHERE document_type = 'moneyos_config' AND source_name = 'MoneyOS private config'
      ORDER BY document_date DESC NULLS LAST, created_at DESC
      LIMIT 1
    `;
    const japan = configRows[0]?.extracted_summary?.japan ?? {};
    const budget = japan.budget ?? {};
    const arrival = String(japan.arrival_date ?? '2026-09-07').slice(0, 10);
    const bounds = monthBounds(month);
    const periodStart = bounds.start < arrival && arrival.slice(0, 7) === month ? arrival : bounds.start;

    const rows = await sql`
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
        AND t.transaction_date >= ${periodStart}
        AND t.transaction_date <= ${bounds.end}
      ORDER BY t.transaction_date DESC, t.id DESC
    `;

    return res.status(200).json({
      month,
      arrival_date: arrival,
      period_start: periodStart,
      period_end: bounds.end,
      planning_rate: budget.planning_rate ?? null,
      living_categories: budget.living_categories ?? [],
      transactions: rows
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Kunne ikke hente Japan-forbruk' });
  }
}

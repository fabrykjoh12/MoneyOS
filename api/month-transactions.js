import { neon } from '@neondatabase/serverless';
import { isAuthenticated } from '../lib/auth.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('Pragma', 'no-cache');

  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    if (!isAuthenticated(req)) return res.status(401).json({ error: 'Unauthorized' });
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not configured');

    const month = String(req.query?.month ?? '');
    const category = String(req.query?.category ?? '').trim();
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || !category || category.length > 120) {
      return res.status(400).json({ error: 'Ugyldig måned eller kategori' });
    }

    const sql = neon(process.env.DATABASE_URL);
    const [transactions, coverage] = await Promise.all([
      sql`
        SELECT
          t.id,
          t.transaction_date,
          ROUND(t.amount::numeric, 2) AS amount,
          t.merchant,
          t.description,
          a.name AS account,
          COALESCE(c.name, 'Annet') AS category
        FROM transactions t
        JOIN accounts a ON a.id = t.account_id
        LEFT JOIN categories c ON c.id = t.category_id
        WHERE t.transaction_type = 'expense'
          AND COALESCE(t.is_pending, false) = false
          AND to_char(t.transaction_date, 'YYYY-MM') = ${month}
          AND COALESCE(c.name, 'Annet') = ${category}
        ORDER BY t.transaction_date DESC, t.id DESC
      `,
      sql`
        SELECT
          MIN(transaction_date) FILTER (WHERE transaction_type='expense' AND COALESCE(is_pending,false)=false) AS min_date,
          MAX(transaction_date) FILTER (WHERE transaction_type='expense' AND COALESCE(is_pending,false)=false) AS max_date
        FROM transactions
      `
    ]);

    const total = transactions.reduce((sum, row) => sum + Number(row.amount ?? 0), 0);
    return res.status(200).json({
      month,
      category,
      available: transactions.length > 0,
      total: Math.round(total * 100) / 100,
      count: transactions.length,
      transactions,
      coverage: coverage[0] ?? { min_date: null, max_date: null }
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Kunne ikke hente kategoridetaljer' });
  }
}

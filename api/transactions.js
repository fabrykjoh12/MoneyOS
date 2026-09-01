import { neon } from '@neondatabase/serverless';
import { isAuthenticated } from '../lib/auth.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('Pragma', 'no-cache');

  try {
    if (!isAuthenticated(req)) return res.status(401).json({ error: 'Unauthorized' });
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not configured');
    const sql = neon(process.env.DATABASE_URL);

    if (req.method === 'GET') {
      const rawLimit = Number(req.query?.limit ?? 80);
      const limit = Number.isFinite(rawLimit) ? Math.max(10, Math.min(200, Math.trunc(rawLimit))) : 80;
      const [transactions, categories] = await Promise.all([
        sql`
          SELECT
            t.id::text AS id,
            t.transaction_date,
            ROUND(t.amount::numeric, 2) AS amount,
            t.merchant,
            t.description,
            t.transaction_type,
            COALESCE(t.is_pending, false) AS is_pending,
            a.name AS account,
            COALESCE(c.name, 'Annet') AS category
          FROM transactions t
          JOIN accounts a ON a.id = t.account_id
          LEFT JOIN categories c ON c.id = t.category_id
          ORDER BY t.transaction_date DESC, t.id DESC
          LIMIT ${limit}
        `,
        sql`SELECT name FROM categories ORDER BY name`
      ]);
      return res.status(200).json({
        transactions,
        categories: categories.map(row => row.name)
      });
    }

    if (req.method === 'PATCH') {
      const id = String(req.body?.id ?? '').trim();
      const merchantInput = req.body?.merchant;
      const merchant = merchantInput == null ? null : String(merchantInput).trim();
      const category = String(req.body?.category ?? '').trim();
      const transactionType = String(req.body?.transaction_type ?? '').trim();

      if (!id || id.length > 128) return res.status(400).json({ error: 'Ugyldig transaksjon' });
      if (merchant && merchant.length > 160) return res.status(400).json({ error: 'Merchant-navnet er for langt' });
      if (!category || category.length > 120) return res.status(400).json({ error: 'Velg en kategori' });
      if (!['expense', 'income', 'transfer'].includes(transactionType)) return res.status(400).json({ error: 'Ugyldig transaksjonstype' });

      const current = await sql`
        SELECT id::text AS id, COALESCE(is_pending, false) AS is_pending
        FROM transactions
        WHERE id::text = ${id}
        LIMIT 1
      `;
      if (!current.length) return res.status(404).json({ error: 'Transaksjonen finnes ikke' });
      if (current[0].is_pending) return res.status(409).json({ error: 'Vent til transaksjonen er bokført før du endrer den' });

      const categoryRows = await sql`SELECT id FROM categories WHERE name = ${category} LIMIT 1`;
      if (!categoryRows.length) return res.status(400).json({ error: 'Kategorien finnes ikke' });

      const updated = await sql`
        UPDATE transactions
        SET merchant = ${merchant || null},
            category_id = ${categoryRows[0].id},
            transaction_type = ${transactionType}
        WHERE id::text = ${id}
        RETURNING id::text AS id, transaction_date, amount, merchant, description, transaction_type, is_pending
      `;
      return res.status(200).json({ ok: true, transaction: updated[0] });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Kunne ikke behandle transaksjonen' });
  }
}

import { neon } from '@neondatabase/serverless';
import { isAuthenticated } from '../lib/auth.js';

const tripBuckets = ['transport', 'stay', 'food', 'activities', 'other'];

function cleanRuleText(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ').slice(0, 120);
}

async function getPrivateConfig(sql) {
  const rows = await sql`
    SELECT id, COALESCE(extracted_summary, '{}'::jsonb) AS summary
    FROM documents
    WHERE document_type = 'moneyos_config' AND source_name = 'MoneyOS private config'
    ORDER BY document_date DESC NULLS LAST, created_at DESC
    LIMIT 1
  `;
  return rows[0] ?? null;
}

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
      const [transactions, categories, config] = await Promise.all([
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
        sql`SELECT name FROM categories ORDER BY name`,
        getPrivateConfig(sql)
      ]);
      const map = config?.summary?.trip_transaction_map ?? {};
      const trips = Array.isArray(config?.summary?.japan?.trips) ? config.summary.japan.trips : [];
      const enriched = transactions.map(row => ({
        ...row,
        trip_id: map?.[row.id]?.trip_id ?? null,
        trip_bucket: map?.[row.id]?.bucket ?? null
      }));
      return res.status(200).json({
        transactions: enriched,
        categories: categories.map(row => row.name),
        merchant_rules: config?.summary?.merchant_rules ?? [],
        trips: trips.map(trip => ({ id: trip.id, name: trip.name, start_date: trip.start_date, end_date: trip.end_date })),
        trip_buckets: tripBuckets
      });
    }

    if (req.method === 'PATCH') {
      const id = String(req.body?.id ?? '').trim();
      const merchantInput = req.body?.merchant;
      const merchant = merchantInput == null ? null : String(merchantInput).trim();
      const category = String(req.body?.category ?? '').trim();
      const transactionType = String(req.body?.transaction_type ?? '').trim();
      const rememberRule = req.body?.remember_rule === true;
      const matchText = cleanRuleText(req.body?.match_text);
      const tripId = req.body?.trip_id == null || req.body.trip_id === '' ? null : String(req.body.trip_id).trim();
      const tripBucket = tripId ? String(req.body?.trip_bucket ?? '').trim() : null;

      if (!id || id.length > 128) return res.status(400).json({ error: 'Ugyldig transaksjon' });
      if (merchant && merchant.length > 160) return res.status(400).json({ error: 'Merchant-navnet er for langt' });
      if (!category || category.length > 120) return res.status(400).json({ error: 'Velg en kategori' });
      if (!['expense', 'income', 'transfer'].includes(transactionType)) return res.status(400).json({ error: 'Ugyldig transaksjonstype' });
      if (rememberRule && matchText.length < 3) return res.status(400).json({ error: 'Match-teksten må være minst 3 tegn' });
      if (tripId && transactionType !== 'expense') return res.status(400).json({ error: 'Bare utgifter kan knyttes til en tur' });
      if (tripId && !tripBuckets.includes(tripBucket)) return res.status(400).json({ error: 'Velg hvilken turpost kjøpet tilhører' });

      const [current, categoryRows, config] = await Promise.all([
        sql`
          SELECT id::text AS id, COALESCE(is_pending, false) AS is_pending, merchant, description
          FROM transactions
          WHERE id::text = ${id}
          LIMIT 1
        `,
        sql`SELECT id FROM categories WHERE name = ${category} LIMIT 1`,
        getPrivateConfig(sql)
      ]);
      if (!current.length) return res.status(404).json({ error: 'Transaksjonen finnes ikke' });
      if (current[0].is_pending) return res.status(409).json({ error: 'Vent til transaksjonen er bokført før du endrer den' });
      if (!categoryRows.length) return res.status(400).json({ error: 'Kategorien finnes ikke' });
      if (!config) return res.status(500).json({ error: 'MoneyOS-konfigurasjonen mangler' });

      const trips = Array.isArray(config.summary?.japan?.trips) ? config.summary.japan.trips : [];
      if (tripId && !trips.some(trip => String(trip?.id) === tripId)) return res.status(400).json({ error: 'Turen finnes ikke' });

      const categoryId = categoryRows[0].id;
      const updated = await sql`
        UPDATE transactions
        SET merchant = ${merchant || null},
            category_id = ${categoryId},
            transaction_type = ${transactionType}
        WHERE id::text = ${id}
        RETURNING id::text AS id, transaction_date, amount, merchant, description, transaction_type, is_pending
      `;

      let matched = 1;
      let summary = config.summary ?? {};

      if (rememberRule) {
        const matchedRows = await sql`
          UPDATE transactions
          SET merchant = ${merchant || null},
              category_id = ${categoryId},
              transaction_type = ${transactionType}
          WHERE COALESCE(is_pending, false) = false
            AND id::text <> ${id}
            AND lower(COALESCE(merchant, '') || ' ' || COALESCE(description, '')) LIKE ${'%' + matchText.toLowerCase() + '%'}
          RETURNING id
        `;
        matched += matchedRows.length;
        const oldRules = Array.isArray(summary?.merchant_rules) ? summary.merchant_rules : [];
        const newRule = {
          match_text: matchText,
          merchant: merchant || null,
          category,
          transaction_type: transactionType,
          created_at: new Date().toISOString()
        };
        summary = {
          ...summary,
          merchant_rules: [newRule, ...oldRules.filter(rule => String(rule?.match_text ?? '').toLowerCase() !== matchText.toLowerCase())].slice(0, 200)
        };
      }

      const oldMap = summary?.trip_transaction_map && typeof summary.trip_transaction_map === 'object' ? summary.trip_transaction_map : {};
      const nextMap = { ...oldMap };
      if (tripId) nextMap[id] = { trip_id: tripId, bucket: tripBucket, updated_at: new Date().toISOString() };
      else delete nextMap[id];
      summary = { ...summary, trip_transaction_map: nextMap };

      await sql`
        UPDATE documents
        SET extracted_summary = ${JSON.stringify(summary)}::jsonb
        WHERE id = ${config.id}
      `;

      return res.status(200).json({
        ok: true,
        transaction: { ...updated[0], trip_id: tripId, trip_bucket: tripBucket },
        rule_saved: rememberRule,
        matched
      });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Kunne ikke behandle transaksjonen' });
  }
}

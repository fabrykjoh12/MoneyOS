import { neon } from '@neondatabase/serverless';
import { isAuthenticated } from '../lib/auth.js';

function cleanRuleText(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ').slice(0, 120);
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
      const [transactions, categories, configRows] = await Promise.all([
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
        sql`
          SELECT COALESCE(extracted_summary->'merchant_rules', '[]'::jsonb) AS merchant_rules
          FROM documents
          WHERE document_type = 'moneyos_config' AND source_name = 'MoneyOS private config'
          ORDER BY document_date DESC NULLS LAST, created_at DESC
          LIMIT 1
        `
      ]);
      return res.status(200).json({
        transactions,
        categories: categories.map(row => row.name),
        merchant_rules: configRows[0]?.merchant_rules ?? []
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

      if (!id || id.length > 128) return res.status(400).json({ error: 'Ugyldig transaksjon' });
      if (merchant && merchant.length > 160) return res.status(400).json({ error: 'Merchant-navnet er for langt' });
      if (!category || category.length > 120) return res.status(400).json({ error: 'Velg en kategori' });
      if (!['expense', 'income', 'transfer'].includes(transactionType)) return res.status(400).json({ error: 'Ugyldig transaksjonstype' });
      if (rememberRule && matchText.length < 3) return res.status(400).json({ error: 'Match-teksten må være minst 3 tegn' });

      const current = await sql`
        SELECT id::text AS id, COALESCE(is_pending, false) AS is_pending, merchant, description
        FROM transactions
        WHERE id::text = ${id}
        LIMIT 1
      `;
      if (!current.length) return res.status(404).json({ error: 'Transaksjonen finnes ikke' });
      if (current[0].is_pending) return res.status(409).json({ error: 'Vent til transaksjonen er bokført før du endrer den' });

      const categoryRows = await sql`SELECT id FROM categories WHERE name = ${category} LIMIT 1`;
      if (!categoryRows.length) return res.status(400).json({ error: 'Kategorien finnes ikke' });
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

        const configRows = await sql`
          SELECT id, COALESCE(extracted_summary, '{}'::jsonb) AS summary
          FROM documents
          WHERE document_type = 'moneyos_config' AND source_name = 'MoneyOS private config'
          ORDER BY document_date DESC NULLS LAST, created_at DESC
          LIMIT 1
        `;
        if (configRows.length) {
          const oldRules = Array.isArray(configRows[0].summary?.merchant_rules) ? configRows[0].summary.merchant_rules : [];
          const newRule = {
            match_text: matchText,
            merchant: merchant || null,
            category,
            transaction_type: transactionType,
            created_at: new Date().toISOString()
          };
          const deduped = oldRules.filter(rule => String(rule?.match_text ?? '').toLowerCase() !== matchText.toLowerCase());
          const rules = [newRule, ...deduped].slice(0, 200);
          await sql`
            UPDATE documents
            SET extracted_summary = jsonb_set(COALESCE(extracted_summary, '{}'::jsonb), '{merchant_rules}', ${JSON.stringify(rules)}::jsonb, true)
            WHERE id = ${configRows[0].id}
          `;
        }
      }

      return res.status(200).json({ ok: true, transaction: updated[0], rule_saved: rememberRule, matched });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Kunne ikke behandle transaksjonen' });
  }
}

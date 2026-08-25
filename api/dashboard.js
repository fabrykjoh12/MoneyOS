import { neon } from '@neondatabase/serverless';
import { isAuthenticated } from '../lib/auth.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('Pragma', 'no-cache');

  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    if (!isAuthenticated(req)) return res.status(401).json({ error: 'Unauthorized' });
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not configured');

    const sql = neon(process.env.DATABASE_URL);
    const rows = await sql`
      WITH history_document AS (
        SELECT extracted_summary
        FROM documents
        WHERE extracted_summary ? 'monthly'
        ORDER BY document_date DESC NULLS LAST, created_at DESC
        LIMIT 1
      ),
      monthly_history AS (
        SELECT
          key AS month,
          COALESCE((value->>'income_total')::numeric, 0) AS income,
          COALESCE((value->>'expense_total')::numeric, 0) AS expenses
        FROM history_document
        CROSS JOIN LATERAL jsonb_each(extracted_summary->'monthly')
      ),
      next_period AS (
        SELECT MIN(period_start) AS period_start
        FROM budgets
        WHERE period_end >= CURRENT_DATE
      ),
      next_budget AS (
        SELECT v.*
        FROM v_budget_status v
        WHERE v.period_start = (SELECT period_start FROM next_period)
      ),
      recurring_normalized AS (
        SELECT
          r.id,
          r.name,
          COALESCE(c.name, 'Annet') AS category,
          r.amount,
          r.cadence,
          r.next_due_date,
          ROUND((CASE r.cadence
            WHEN 'daily' THEN r.amount * 365.25 / 12
            WHEN 'weekly' THEN r.amount * 52 / 12
            WHEN 'biweekly' THEN r.amount * 26 / 12
            WHEN 'monthly' THEN r.amount
            WHEN 'quarterly' THEN r.amount / 3
            WHEN 'yearly' THEN r.amount / 12
            ELSE r.amount
          END)::numeric, 2) AS monthly_amount
        FROM recurring_items r
        LEFT JOIN categories c ON c.id = r.category_id
        WHERE r.item_type = 'expense' AND r.is_active = true
      )
      SELECT
        finance_dashboard() AS dashboard,
        COALESCE((
          SELECT json_agg(row_to_json(category_spend) ORDER BY category_spend.spent DESC)
          FROM (
            SELECT
              COALESCE(c.name, 'Annet') AS category,
              ROUND(SUM(t.amount)::numeric, 2) AS spent,
              COUNT(*)::int AS transactions
            FROM transactions t
            LEFT JOIN categories c ON c.id = t.category_id
            WHERE t.transaction_type = 'expense'
              AND COALESCE(t.is_pending, false) = false
              AND t.transaction_date >= date_trunc('month', CURRENT_DATE)::date
              AND t.transaction_date < (date_trunc('month', CURRENT_DATE) + interval '1 month')::date
            GROUP BY COALESCE(c.name, 'Annet')
          ) category_spend
        ), '[]'::json) AS spending_by_category,
        COALESCE((SELECT json_agg(row_to_json(r) ORDER BY r.monthly_amount DESC, r.name) FROM recurring_normalized r), '[]'::json) AS fixed_costs,
        COALESCE((SELECT ROUND(SUM(monthly_amount)::numeric, 2) FROM recurring_normalized), 0) AS fixed_monthly_total,
        COALESCE((
          SELECT ROUND(percentile_cont(0.5) WITHIN GROUP (ORDER BY core_spend)::numeric, 2)
          FROM (
            SELECT
              (value->>'expense_total')::numeric
              - COALESCE((value->'expenses'->>'Refusjoner og delte utgifter')::numeric, 0)
              - COALESCE((value->'expenses'->>'Bolig')::numeric, 0) AS core_spend
            FROM history_document
            CROSS JOIN LATERAL jsonb_each(extracted_summary->'monthly')
            WHERE key < to_char(date_trunc('month', CURRENT_DATE), 'YYYY-MM')
              AND key >= to_char(date_trunc('month', CURRENT_DATE) - interval '6 months', 'YYYY-MM')
          ) core_months
        ), 0) AS typical_core_month,
        COALESCE((
          SELECT ROUND(SUM(v.budget_amount)::numeric, 2)
          FROM v_budget_status v
          WHERE CURRENT_DATE BETWEEN v.period_start AND v.period_end
        ), 0) AS budget_total,
        COALESCE((
          SELECT ROUND(SUM(v.spent)::numeric, 2)
          FROM v_budget_status v
          WHERE CURRENT_DATE BETWEEN v.period_start AND v.period_end
        ), 0) AS budget_spent,
        COALESCE((
          SELECT ROUND(SUM(v.remaining)::numeric, 2)
          FROM v_budget_status v
          WHERE CURRENT_DATE BETWEEN v.period_start AND v.period_end
        ), 0) AS budget_remaining,
        COALESCE((
          SELECT ROUND(SUM(t.amount)::numeric, 2)
          FROM transactions t
          WHERE t.transaction_type = 'expense'
            AND COALESCE(t.is_pending, false) = true
            AND t.transaction_date >= date_trunc('month', CURRENT_DATE)::date
            AND t.transaction_date < (date_trunc('month', CURRENT_DATE) + interval '1 month')::date
        ), 0) AS pending_expenses,
        COALESCE((SELECT json_agg(to_jsonb(n) ORDER BY n.category) FROM next_budget n), '[]'::json) AS next_budget,
        COALESCE((SELECT ROUND(SUM(budget_amount)::numeric, 2) FROM next_budget), 0) AS next_budget_total,
        (SELECT MIN(period_start) FROM next_budget) AS next_budget_start,
        COALESCE((
          SELECT json_agg(json_build_object(
            'month', month,
            'income', ROUND(income, 2),
            'expenses', ROUND(expenses, 2),
            'net', ROUND(income - expenses, 2)
          ) ORDER BY month)
          FROM monthly_history
        ), '[]'::json) AS monthly_history,
        (SELECT MAX(transaction_date) FROM transactions WHERE COALESCE(is_pending,false)=false) AS latest_transaction_date,
        (SELECT MAX(document_date) FROM documents WHERE document_type = 'account_overview') AS account_snapshot_date,
        (SELECT extracted_summary->'source_range'->>'to' FROM history_document) AS source_through,
        COALESCE((SELECT ROUND(SUM(current_balance)::numeric,2) FROM accounts WHERE is_active=true AND account_type <> 'savings'),0) AS liquid_non_savings
    `;

    const row = rows[0] ?? {};
    const payload = row.dashboard ?? {};
    payload.spending_by_category = row.spending_by_category ?? [];
    payload.fixed_costs = row.fixed_costs ?? [];
    payload.monthly_history = row.monthly_history ?? [];
    payload.next_budget = row.next_budget ?? [];
    payload.cost_summary = {
      fixed_monthly_total: Number(row.fixed_monthly_total ?? 0),
      typical_core_month: Number(row.typical_core_month ?? 0),
      budget_total: Number(row.budget_total ?? 0),
      budget_spent: Number(row.budget_spent ?? 0),
      budget_remaining: Number(row.budget_remaining ?? 0),
      pending_expenses: Number(row.pending_expenses ?? 0),
      next_budget_total: Number(row.next_budget_total ?? 0),
      next_budget_start: row.next_budget_start ?? null,
      liquid_non_savings: Number(row.liquid_non_savings ?? 0)
    };
    payload.data_freshness = {
      latest_transaction_date: row.latest_transaction_date ?? null,
      account_snapshot_date: row.account_snapshot_date ?? null,
      source_through: row.source_through ?? null
    };
    payload.japan_plan = {
      living_budget_monthly: Number(row.next_budget_total ?? 0),
      confirmed_fixed_monthly: Number(row.fixed_monthly_total ?? 0),
      combined_monthly: Number(row.next_budget_total ?? 0) + Number(row.fixed_monthly_total ?? 0)
    };
    payload.review_candidates = [
      { name: 'Telenor', amount: 89, reason: 'Svært tydelig historisk månedstrekk, men status under Japan er ikke bekreftet.' },
      { name: 'Tryg', amount: 68.16, reason: 'Repeterende forsikringstrekk. Holdes utenfor fremtidsbudsjettet til vi vet om den fortsetter.' },
      { name: 'Mage.space', amount: 98.93, reason: 'Bare ett observert trekk i siste import. Ikke nok historikk til å kalle den fast.' }
    ];
    payload.inactive_notes = 'Fremtind, Family Nett og Sporty er ikke regnet som aktive fremover.';

    return res.status(200).json(payload);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Kunne ikke hente økonomidata' });
  }
}

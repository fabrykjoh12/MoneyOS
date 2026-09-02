import { neon } from '@neondatabase/serverless';
import { isAuthenticated } from '../lib/auth.js';

const MAX_AMOUNT = 10_000_000;
const monthPattern = /^\d{4}-(0[1-9]|1[0-2])$/;

function cleanMonth(value) {
  const month = String(value ?? '').trim();
  return monthPattern.test(month) ? month : new Date().toISOString().slice(0, 7);
}
function money(value) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? Math.max(0, Math.min(MAX_AMOUNT, Math.round(n * 100) / 100)) : 0;
}
function nullableMoney(value) {
  if (value === '' || value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.min(MAX_AMOUNT, Math.round(n * 100) / 100)) : null;
}
function text(value, max = 120) {
  return String(value ?? '').trim().slice(0, max);
}
function validDate(value) {
  const s = text(value, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}
function median(values) {
  const list = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!list.length) return 0;
  const middle = Math.floor(list.length / 2);
  return list.length % 2 ? list[middle] : (list[middle - 1] + list[middle]) / 2;
}
function previousMonth(month) {
  const [year, mon] = month.split('-').map(Number);
  const d = new Date(Date.UTC(year, mon - 2, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}
function defaultBucket(name) {
  if (['Refusjoner og delte utgifter', 'Sparing'].includes(name)) return 'excluded';
  if (['Digitale tjenester', 'Mobil og internett', 'Forsikring', 'Bolig'].includes(name)) return 'fixed';
  if (['Dagligvarer', 'Transport', 'Helse', 'Utdanning', 'Bank og gebyrer'].includes(name)) return 'essential';
  return 'flex';
}
function monthlyContribution(fund, month) {
  const saved = money(fund.saved_nok);
  const target = money(fund.target_amount_nok);
  const remaining = Math.max(0, target - saved);
  if (fund.monthly_nok != null && Number(fund.monthly_nok) > 0) return money(fund.monthly_nok);
  const targetDate = validDate(fund.target_date);
  if (!targetDate || remaining <= 0) return 0;
  const [year, mon] = month.split('-').map(Number);
  const [ty, tm] = targetDate.slice(0, 7).split('-').map(Number);
  const months = Math.max(1, (ty - year) * 12 + (tm - mon) + 1);
  return Math.ceil((remaining / months) * 100) / 100;
}
function sanitizeTargets(raw = {}, categories = []) {
  const allowed = new Set(categories);
  const out = {};
  for (const [name, value] of Object.entries(raw ?? {})) {
    if (!allowed.has(name)) continue;
    const bucket = ['fixed', 'essential', 'flex', 'excluded'].includes(value?.bucket) ? value.bucket : defaultBucket(name);
    out[name] = { bucket, target_nok: money(value?.target_nok), rollover: value?.rollover === true };
  }
  return out;
}
function sanitizeFunds(raw = []) {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 50).map((item, index) => ({
    id: text(item?.id, 80) || `fund-${Date.now()}-${index}`,
    name: text(item?.name, 80),
    target_amount_nok: money(item?.target_amount_nok),
    saved_nok: money(item?.saved_nok),
    target_date: validDate(item?.target_date),
    monthly_nok: item?.monthly_nok == null || item?.monthly_nok === '' ? null : money(item.monthly_nok),
    is_active: item?.is_active !== false
  })).filter(item => item.name);
}
function sanitizeTemplate(raw = {}, categories = []) {
  return {
    savings_target_nok: money(raw?.savings_target_nok),
    flex_rollover: raw?.flex_rollover === true,
    category_targets: sanitizeTargets(raw?.category_targets, categories),
    updated_at: text(raw?.updated_at, 40) || null
  };
}
function activeFundingTotal(system) {
  const currentMonth = new Date().toISOString().slice(0, 7);
  return Object.entries(system?.funding?.allocations ?? {})
    .filter(([month]) => monthPattern.test(month) && month >= currentMonth)
    .reduce((sum, [, value]) => sum + money(value?.funded_nok), 0);
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

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  try {
    if (!isAuthenticated(req)) return res.status(401).json({ error: 'Unauthorized' });
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not configured');
    const sql = neon(process.env.DATABASE_URL);
    const month = cleanMonth(req.method === 'GET' ? req.query?.month : req.body?.month);
    const config = await getConfig(sql);
    if (!config) return res.status(500).json({ error: 'MoneyOS-konfigurasjonen mangler' });
    const categoriesRows = await sql`SELECT name FROM categories ORDER BY name`;
    const categories = categoriesRows.map(row => row.name);

    if (req.method === 'POST') {
      const current = config.summary?.budget_system ?? {};
      const monthPlans = { ...(current.month_plans ?? {}) };
      const action = text(req.body?.action, 40) || 'save_plan';
      let template = current.template ? sanitizeTemplate(current.template, categories) : null;

      if (action === 'save_plan') {
        monthPlans[month] = {
          planning_income_nok: nullableMoney(req.body?.planning_income_nok),
          savings_target_nok: money(req.body?.savings_target_nok),
          flex_rollover: req.body?.flex_rollover === true,
          category_targets: sanitizeTargets(req.body?.category_targets, categories),
          updated_at: new Date().toISOString()
        };
      } else if (action === 'save_template') {
        const sourcePlan = current.month_plans?.[month];
        if (!sourcePlan) return res.status(409).json({ error: 'Lagre månedsplanen før du lagrer den som normalmåned' });
        template = {
          savings_target_nok: money(sourcePlan.savings_target_nok),
          flex_rollover: sourcePlan.flex_rollover === true,
          category_targets: sanitizeTargets(sourcePlan.category_targets, categories),
          source_month: month,
          updated_at: new Date().toISOString()
        };
      } else if (action === 'apply_template') {
        if (!current.template) return res.status(409).json({ error: 'Ingen normalmåned er lagret ennå' });
        const clean = sanitizeTemplate(current.template, categories);
        const existing = current.month_plans?.[month] ?? {};
        monthPlans[month] = {
          planning_income_nok: existing.planning_income_nok == null ? null : nullableMoney(existing.planning_income_nok),
          savings_target_nok: clean.savings_target_nok,
          flex_rollover: clean.flex_rollover,
          category_targets: clean.category_targets,
          template_applied_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };
      } else if (action !== 'save_funds') {
        return res.status(400).json({ error: 'Ukjent budsjett-handling' });
      }
      const next = {
        ...current,
        version: Math.max(3, Number(current.version ?? 1)),
        method: 'cash_envelope_flex',
        month_plans: monthPlans,
        template,
        sinking_funds: action === 'save_funds' ? sanitizeFunds(req.body?.sinking_funds) : sanitizeFunds(current.sinking_funds),
        updated_at: new Date().toISOString()
      };
      await sql`
        UPDATE documents
        SET extracted_summary = jsonb_set(COALESCE(extracted_summary, '{}'::jsonb), '{budget_system}', ${JSON.stringify(next)}::jsonb, true)
        WHERE id = ${config.id}
      `;
      return res.status(200).json({ ok: true });
    }
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    const [historyRows, actualRows, recurringRows, dashboardRows] = await Promise.all([
      sql`SELECT extracted_summary->'monthly' AS monthly FROM documents WHERE extracted_summary ? 'monthly' ORDER BY document_date DESC NULLS LAST, created_at DESC LIMIT 1`,
      sql`
        SELECT COALESCE(c.name, 'Annet') AS category, ROUND(SUM(t.amount)::numeric, 2) AS spent
        FROM transactions t LEFT JOIN categories c ON c.id = t.category_id
        WHERE t.transaction_type = 'expense' AND COALESCE(t.is_pending, false) = false
          AND t.transaction_date >= ${month + '-01'}::date
          AND t.transaction_date < (${month + '-01'}::date + interval '1 month')
        GROUP BY COALESCE(c.name, 'Annet')
      `,
      sql`
        SELECT r.name, COALESCE(c.name, 'Annet') AS category, r.amount, r.cadence, r.next_due_date,
          ROUND((CASE r.cadence WHEN 'daily' THEN r.amount * 365.25 / 12 WHEN 'weekly' THEN r.amount * 52 / 12 WHEN 'biweekly' THEN r.amount * 26 / 12 WHEN 'monthly' THEN r.amount WHEN 'quarterly' THEN r.amount / 3 WHEN 'yearly' THEN r.amount / 12 ELSE r.amount END)::numeric, 2) AS monthly_amount
        FROM recurring_items r LEFT JOIN categories c ON c.id = r.category_id
        WHERE r.item_type = 'expense' AND r.is_active = true ORDER BY monthly_amount DESC, r.name
      `,
      sql`SELECT finance_dashboard() AS dashboard`
    ]);

    const historical = historyRows[0]?.monthly ?? {};
    const completeMonths = Object.keys(historical).filter(key => monthPattern.test(key) && key < month).sort().reverse().slice(0, 6);
    const suggestionByCategory = {};
    for (const category of categories) {
      const values = completeMonths.map(key => Number(historical?.[key]?.expenses?.[category] ?? 0));
      suggestionByCategory[category] = Math.round(median(values) * 100) / 100;
    }

    const system = config.summary?.budget_system ?? {};
    const savedPlan = system.month_plans?.[month] ?? null;
    const targets = {};
    for (const category of categories) {
      const saved = savedPlan?.category_targets?.[category];
      const bucket = ['fixed', 'essential', 'flex', 'excluded'].includes(saved?.bucket) ? saved.bucket : defaultBucket(category);
      targets[category] = {
        bucket,
        target_nok: saved ? money(saved.target_nok) : (bucket === 'essential' ? money(suggestionByCategory[category]) : 0),
        suggested_nok: money(suggestionByCategory[category]),
        rollover: saved?.rollover === true
      };
    }

    const actual = Object.fromEntries(actualRows.map(row => [row.category, Number(row.spent ?? 0)]));
    const previous = previousMonth(month);
    const prevPlan = system.month_plans?.[previous] ?? null;
    const prevActual = historical?.[previous]?.expenses ?? {};
    const carry = {};
    for (const category of categories) {
      const prev = prevPlan?.category_targets?.[category];
      carry[category] = prev?.rollover === true ? Math.round((Number(prev.target_nok ?? 0) - Number(prevActual?.[category] ?? 0)) * 100) / 100 : 0;
    }

    const funds = sanitizeFunds(system.sinking_funds).map(fund => ({ ...fund, monthly_contribution_nok: monthlyContribution(fund, month), remaining_to_goal_nok: Math.max(0, money(fund.target_amount_nok) - money(fund.saved_nok)) }));
    const dashboard = dashboardRows[0]?.dashboard ?? {};
    const fixedMonthly = recurringRows.reduce((sum, row) => sum + Number(row.monthly_amount ?? 0), 0);
    const essentialTarget = Object.entries(targets).filter(([, value]) => value.bucket === 'essential').reduce((sum, [, value]) => sum + Number(value.target_nok ?? 0), 0);
    const essentialSpent = Object.entries(targets).filter(([, value]) => value.bucket === 'essential').reduce((sum, [name]) => sum + Number(actual[name] ?? 0), 0);
    const flexSpent = Object.entries(targets).filter(([, value]) => value.bucket === 'flex').reduce((sum, [name]) => sum + Number(actual[name] ?? 0), 0);
    const sinkingMonthly = funds.filter(fund => fund.is_active).reduce((sum, fund) => sum + Number(fund.monthly_contribution_nok ?? 0), 0);
    const planningIncome = savedPlan?.planning_income_nok == null ? null : Number(savedPlan.planning_income_nok);
    const savingsTarget = Number(savedPlan?.savings_target_nok ?? 0);
    const flexBudget = planningIncome == null ? null : Math.max(0, planningIncome - fixedMonthly - essentialTarget - sinkingMonthly - savingsTarget);

    let flexCarry = 0;
    if (savedPlan?.flex_rollover === true && prevPlan?.planning_income_nok != null) {
      const prevEssential = Object.entries(prevPlan.category_targets ?? {}).filter(([, value]) => value?.bucket === 'essential').reduce((sum, [, value]) => sum + Number(value?.target_nok ?? 0), 0);
      const prevFlexSpent = Object.entries(prevPlan.category_targets ?? {}).filter(([, value]) => value?.bucket === 'flex').reduce((sum, [name]) => sum + Number(prevActual?.[name] ?? 0), 0);
      const prevFundMonthly = sanitizeFunds(system.sinking_funds).filter(fund => fund.is_active).reduce((sum, fund) => sum + monthlyContribution(fund, previous), 0);
      const prevFlexBudget = Math.max(0, Number(prevPlan.planning_income_nok) - fixedMonthly - prevEssential - prevFundMonthly - Number(prevPlan.savings_target_nok ?? 0));
      flexCarry = prevFlexBudget - prevFlexSpent;
    }

    const reservedFuture = activeFundingTotal(system);
    const rawOverview = dashboard.overview ?? {};
    const baseSafe = money(rawOverview.safe_to_spend);
    const adjustedSafe = money(Math.max(0, baseSafe - reservedFuture));
    const overview = {
      ...rawOverview,
      safe_to_spend: adjustedSafe,
      daily_safe_to_spend: money(adjustedSafe / Math.max(1, Number(rawOverview.days_to_payday ?? 1)))
    };

    return res.status(200).json({
      month, method: 'cash_envelope_flex', plan_saved: !!savedPlan,
      planning_income_nok: planningIncome, savings_target_nok: savingsTarget, flex_rollover: savedPlan?.flex_rollover === true,
      categories: targets, actual_by_category: actual, carry_by_category: carry,
      fixed_items: recurringRows, fixed_monthly_total: Math.round(fixedMonthly * 100) / 100,
      essential_target_total: Math.round(essentialTarget * 100) / 100, essential_spent_total: Math.round(essentialSpent * 100) / 100,
      flex_budget_nok: flexBudget == null ? null : Math.round(flexBudget * 100) / 100, flex_spent_nok: Math.round(flexSpent * 100) / 100, flex_carry_nok: Math.round(flexCarry * 100) / 100,
      sinking_funds: funds, sinking_monthly_total: Math.round(sinkingMonthly * 100) / 100,
      overview,
      budget_funding: { reserved_future_nok: money(reservedFuture), base_safe_to_spend_nok: baseSafe },
      template_available: !!system.template,
      template: system.template ? sanitizeTemplate(system.template, categories) : null,
      history_months_used: completeMonths
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Kunne ikke hente budsjettet' });
  }
}

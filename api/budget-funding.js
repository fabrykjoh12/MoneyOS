import { neon } from '@neondatabase/serverless';
import { isAuthenticated } from '../lib/auth.js';

const monthPattern = /^\d{4}-(0[1-9]|1[0-2])$/;
const MAX = 10_000_000;
const JOB_KEYS = ['fixed', 'essential', 'true_expenses', 'savings', 'flex'];

function money(value) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? Math.max(0, Math.min(MAX, Math.round(n * 100) / 100)) : 0;
}
function text(value, max = 80) {
  return String(value ?? '').trim().slice(0, max);
}
function monthOr(value, fallback) {
  const s = text(value, 7);
  return monthPattern.test(s) ? s : fallback;
}
function nextMonth(month) {
  const [year, mon] = month.split('-').map(Number);
  const d = new Date(Date.UTC(year, mon, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}
function median(values) {
  const list = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!list.length) return 0;
  const i = Math.floor(list.length / 2);
  return list.length % 2 ? list[i] : (list[i - 1] + list[i]) / 2;
}
function defaultBucket(name) {
  if (['Refusjoner og delte utgifter', 'Sparing'].includes(name)) return 'excluded';
  if (['Digitale tjenester', 'Mobil og internett', 'Forsikring', 'Bolig'].includes(name)) return 'fixed';
  if (['Dagligvarer', 'Transport', 'Helse', 'Utdanning', 'Bank og gebyrer'].includes(name)) return 'essential';
  return 'flex';
}
function validDate(value) {
  const s = text(value, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}
function fundContribution(fund, month, committed = 0) {
  const target = money(fund?.target_amount_nok);
  const saved = money(fund?.saved_nok) + money(committed);
  const remaining = Math.max(0, target - saved);
  if (fund?.is_active === false || remaining <= 0) return 0;
  if (fund?.monthly_nok != null && Number(fund.monthly_nok) > 0) return Math.min(money(fund.monthly_nok), remaining);
  const targetDate = validDate(fund?.target_date);
  if (!targetDate) return 0;
  const [year, mon] = month.split('-').map(Number);
  const [ty, tm] = targetDate.slice(0, 7).split('-').map(Number);
  const months = Math.max(1, (ty - year) * 12 + (tm - mon) + 1);
  return Math.ceil((remaining / months) * 100) / 100;
}
function spentByFund(summary) {
  const out = {};
  for (const link of Object.values(summary?.true_expense_transaction_map ?? {})) {
    const id = String(link?.fund_id ?? '');
    if (!id) continue;
    out[id] = money((out[id] ?? 0) + money(link?.expense_amount_nok));
  }
  return out;
}
function jobGoals(values) {
  return {
    fixed_nok: money(values.fixed_nok),
    essential_nok: money(values.essential_nok),
    true_expenses_nok: money(values.true_expenses_nok),
    savings_nok: money(values.savings_nok),
    flex_nok: money(values.flex_nok)
  };
}
function emptyJobs() {
  return { fixed_nok: 0, essential_nok: 0, true_expenses_nok: 0, savings_nok: 0, flex_nok: 0, unassigned_nok: 0 };
}
function jobsTotal(jobs) {
  return money(Object.values(jobs ?? {}).reduce((sum, value) => sum + money(value), 0));
}
function distributeTotal(total, goals) {
  let left = money(total);
  const out = emptyJobs();
  for (const key of JOB_KEYS) {
    const field = `${key}_nok`;
    const use = Math.min(left, money(goals[field]));
    out[field] = money(use);
    left = money(left - use);
  }
  out.unassigned_nok = money(left);
  return out;
}
function normalizeJobs(entry, goals) {
  const funded = money(entry?.funded_nok);
  const raw = entry?.buckets;
  const hasBuckets = raw && typeof raw === 'object' && JOB_KEYS.some(key => raw[`${key}_nok`] != null);
  if (!hasBuckets) return { jobs: distributeTotal(funded, goals), legacy: funded > 0 };
  const jobs = emptyJobs();
  for (const key of JOB_KEYS) jobs[`${key}_nok`] = money(raw[`${key}_nok`]);
  jobs.unassigned_nok = money(raw.unassigned_nok);
  const sum = jobsTotal(jobs);
  if (funded > sum) jobs.unassigned_nok = money(jobs.unassigned_nok + funded - sum);
  return { jobs, legacy: false };
}
function coveredJobs(jobs, goals) {
  const out = emptyJobs();
  for (const key of JOB_KEYS) {
    const field = `${key}_nok`;
    out[field] = Math.min(money(jobs[field]), money(goals[field]));
  }
  out.unassigned_nok = 0;
  return out;
}
function jobGaps(jobs, goals) {
  const covered = coveredJobs(jobs, goals);
  const out = {};
  for (const key of JOB_KEYS) {
    const field = `${key}_nok`;
    out[field] = money(Math.max(0, money(goals[field]) - money(covered[field])));
  }
  return out;
}
function addPriority(jobs, goals, amount) {
  const next = { ...emptyJobs(), ...jobs };
  let left = money(amount);
  const added = emptyJobs();
  const gaps = jobGaps(next, goals);
  for (const key of JOB_KEYS) {
    const field = `${key}_nok`;
    const use = Math.min(left, money(gaps[field]));
    next[field] = money(next[field] + use);
    added[field] = money(use);
    left = money(left - use);
  }
  return { jobs: next, added, reserved_nok: money(amount - left), left_unassigned_nok: left };
}
function sanitizeRequestedJobs(raw, goals) {
  const jobs = emptyJobs();
  for (const key of JOB_KEYS) {
    const field = `${key}_nok`;
    const requested = money(raw?.[field]);
    const goal = money(goals[field]);
    if (requested > goal + 0.01) {
      const err = new Error(`${field} overstiger månedsmålet`);
      err.status = 400;
      throw err;
    }
    jobs[field] = requested;
  }
  jobs.unassigned_nok = money(raw?.unassigned_nok);
  return jobs;
}

async function configRow(sql) {
  const rows = await sql`
    SELECT id, COALESCE(extracted_summary, '{}'::jsonb) AS summary
    FROM documents
    WHERE document_type='moneyos_config' AND source_name='MoneyOS private config'
    ORDER BY document_date DESC NULLS LAST, created_at DESC
    LIMIT 1
  `;
  return rows[0] ?? null;
}
async function latestSalary(sql) {
  const rows = await sql`
    SELECT t.id::text AS id,t.transaction_date,ROUND(t.amount::numeric,2) AS amount,t.merchant,t.description
    FROM transactions t
    WHERE t.transaction_type='income' AND COALESCE(t.is_pending,false)=false
      AND lower(COALESCE(t.description,'')) LIKE '%lønn%'
    ORDER BY t.transaction_date DESC,t.id DESC LIMIT 1
  `;
  return rows[0] ?? null;
}
async function salaryById(sql, id) {
  const rows = await sql`
    SELECT t.id::text AS id,t.transaction_date,ROUND(t.amount::numeric,2) AS amount,t.merchant,t.description
    FROM transactions t
    WHERE t.id::text=${id} AND t.transaction_type='income' AND COALESCE(t.is_pending,false)=false
      AND lower(COALESCE(t.description,'')) LIKE '%lønn%'
    LIMIT 1
  `;
  return rows[0] ?? null;
}
async function recentIncomes(sql) {
  return sql`
    SELECT t.id::text AS id,t.transaction_date,ROUND(t.amount::numeric,2) AS amount,t.merchant,t.description
    FROM transactions t
    WHERE t.transaction_type='income' AND COALESCE(t.is_pending,false)=false
      AND t.transaction_date>=CURRENT_DATE-interval '120 days'
    ORDER BY t.transaction_date DESC,t.id DESC LIMIT 20
  `;
}

async function buildMonth(sql, config, month) {
  const categoriesRows = await sql`SELECT name FROM categories ORDER BY name`;
  const categories = categoriesRows.map(row => row.name);
  const [historyRows, recurringRows, dashboardRows, salary, incomeRows] = await Promise.all([
    sql`SELECT extracted_summary->'monthly' AS monthly FROM documents WHERE extracted_summary ? 'monthly' ORDER BY document_date DESC NULLS LAST,created_at DESC LIMIT 1`,
    sql`
      SELECT r.name,r.amount,r.cadence,r.next_due_date,
        ROUND((CASE r.cadence
          WHEN 'daily' THEN r.amount*365.25/12 WHEN 'weekly' THEN r.amount*52/12
          WHEN 'biweekly' THEN r.amount*26/12 WHEN 'monthly' THEN r.amount
          WHEN 'quarterly' THEN r.amount/3 WHEN 'yearly' THEN r.amount/12 ELSE r.amount
        END)::numeric,2) AS monthly_amount
      FROM recurring_items r
      WHERE r.item_type='expense' AND r.is_active=true
    `,
    sql`SELECT finance_dashboard() AS dashboard`,
    latestSalary(sql),
    recentIncomes(sql)
  ]);

  const historical = historyRows[0]?.monthly ?? {};
  const historyMonths = Object.keys(historical)
    .filter(key => monthPattern.test(key) && key < month)
    .sort().reverse().slice(0, 6);
  const system = config.summary?.budget_system ?? {};
  const plan = system.month_plans?.[month] ?? null;

  let essential = 0;
  const categoryDetail = [];
  for (const name of categories) {
    const saved = plan?.category_targets?.[name];
    const bucket = ['fixed','essential','flex','excluded'].includes(saved?.bucket) ? saved.bucket : defaultBucket(name);
    const suggestion = Math.round(median(historyMonths.map(key => Number(historical?.[key]?.expenses?.[name] ?? 0))) * 100) / 100;
    const target = saved ? money(saved.target_nok) : (bucket === 'essential' ? money(suggestion) : 0);
    if (bucket === 'essential') essential += target;
    categoryDetail.push({ name, bucket, target_nok: target, suggested_nok: money(suggestion) });
  }

  const fixed = recurringRows.reduce((sum, row) => sum + Number(row.monthly_amount ?? 0), 0);
  const fundingRoot = system.funding ?? {};
  const trueExpenseReserves = fundingRoot.true_expense_reserves ?? {};
  const spentMap = spentByFund(config.summary);
  const rawFunds = Array.isArray(system.sinking_funds) ? system.sinking_funds : [];
  const trueExpenseFunds = rawFunds.filter(fund => fund?.is_active !== false).map(fund => {
    const id = String(fund.id);
    const reserved = money(trueExpenseReserves?.[id]?.reserved_nok);
    const spent = money(spentMap[id]);
    const opening = money(fund.saved_nok);
    const effective = Math.min(money(fund.target_amount_nok), opening + reserved + spent);
    return {
      ...fund,
      reserved_nok: reserved,
      spent_nok: spent,
      effective_saved_nok: effective,
      remaining_to_goal_nok: Math.max(0, money(fund.target_amount_nok) - effective),
      monthly_contribution_nok: fundContribution(fund, month, reserved + spent)
    };
  });

  const sinking = trueExpenseFunds.reduce((sum, fund) => sum + money(fund.monthly_contribution_nok), 0);
  const savings = money(plan?.savings_target_nok);
  const planningIncome = plan?.planning_income_nok == null ? null : money(plan.planning_income_nok);
  const flex = planningIncome == null ? 0 : Math.max(0, planningIncome - fixed - essential - sinking - savings);
  const goals = jobGoals({
    fixed_nok: fixed,
    essential_nok: essential,
    true_expenses_nok: sinking,
    savings_nok: savings,
    flex_nok: flex
  });

  const minimum = money(goals.fixed_nok + goals.essential_nok);
  const robust = money(minimum + goals.true_expenses_nok);
  const full = money(robust + goals.savings_nok + goals.flex_nok);

  const allocations = fundingRoot.allocations ?? {};
  const monthEntry = allocations?.[month] ?? {};
  const normalized = normalizeJobs(monthEntry, goals);
  const jobs = normalized.jobs;
  const covered = coveredJobs(jobs, goals);
  const gaps = jobGaps(jobs, goals);
  const funded = jobsTotal(jobs);
  const coveredTotal = money(JOB_KEYS.reduce((sum, key) => sum + money(covered[`${key}_nok`]), 0));

  const minimumFunded = money(covered.fixed_nok + covered.essential_nok);
  const robustFunded = money(minimumFunded + covered.true_expenses_nok);
  const fullFunded = money(robustFunded + covered.savings_nok + covered.flex_nok);

  const currentMonth = new Date().toISOString().slice(0, 7);
  const activeFunding = Object.entries(allocations)
    .filter(([key, value]) => monthPattern.test(key) && key > currentMonth && money(value?.funded_nok) > 0);
  const allAllocated = activeFunding.reduce((sum, [, value]) => sum + money(value?.funded_nok), 0);
  const trueReservedTotal = Object.values(trueExpenseReserves).reduce((sum, value) => sum + money(value?.reserved_nok), 0);
  const reservedTotal = money(allAllocated + trueReservedTotal);

  const dashboard = dashboardRows[0]?.dashboard ?? {};
  const safe = money(dashboard?.overview?.safe_to_spend);
  const available = money(Math.max(0, safe - reservedTotal));
  const incomeAllocations = fundingRoot.income_allocations ?? {};

  const latestSalaryInfo = salary ? {
    id: String(salary.id),
    transaction_date: salary.transaction_date,
    amount_nok: money(salary.amount),
    merchant: salary.merchant ?? null,
    description: salary.description ?? null,
    already_allocated: !!incomeAllocations[String(salary.id)],
    allocation: incomeAllocations[String(salary.id)] ?? null
  } : null;

  const recentIncome = incomeRows.map(row => {
    const assignment = incomeAllocations[String(row.id)] ?? null;
    return {
      id: String(row.id),
      transaction_date: row.transaction_date,
      amount_nok: money(row.amount),
      merchant: row.merchant ?? null,
      description: row.description ?? null,
      explicit_assignment: assignment ? {
        target_month: assignment.target_month ?? null,
        reserved_nok: money(assignment.reserved_nok),
        left_unassigned_nok: money(assignment.left_unassigned_nok),
        bucket_breakdown: assignment.bucket_breakdown ?? null,
        allocated_at: assignment.allocated_at ?? null
      } : null
    };
  });

  const fundingByMonth = activeFunding.sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => ({
    month: key,
    funded_nok: money(value?.funded_nok),
    buckets: value?.buckets ?? null,
    source: value?.source ?? null,
    updated_at: value?.updated_at ?? null
  }));

  const tiers = {
    minimum: { goal_nok: minimum, funded_nok: minimumFunded },
    true_expenses: { goal_nok: goals.true_expenses_nok, funded_nok: covered.true_expenses_nok },
    savings: { goal_nok: goals.savings_nok, funded_nok: covered.savings_nok },
    flex: { goal_nok: goals.flex_nok, funded_nok: covered.flex_nok }
  };

  return {
    month,
    plan_saved: !!plan,
    planning_income_nok: planningIncome,
    fixed_nok: goals.fixed_nok,
    essential_nok: goals.essential_nok,
    sinking_nok: goals.true_expenses_nok,
    savings_nok: goals.savings_nok,
    flex_nok: goals.flex_nok,
    minimum_month_nok: minimum,
    robust_month_nok: robust,
    full_month_nok: full,
    funded_nok: funded,
    funded_covered_nok: coveredTotal,
    funding_goals: goals,
    funding_buckets: jobs,
    funding_covered_buckets: covered,
    funding_gaps: gaps,
    funding_legacy_derived: normalized.legacy,
    remaining_to_minimum_nok: money(gaps.fixed_nok + gaps.essential_nok),
    remaining_to_robust_nok: money(gaps.fixed_nok + gaps.essential_nok + gaps.true_expenses_nok),
    remaining_to_full_nok: money(gaps.fixed_nok + gaps.essential_nok + gaps.true_expenses_nok + gaps.savings_nok + gaps.flex_nok),
    funded_percent_full: full > 0 ? Math.min(100, Math.round(fullFunded / full * 1000) / 10) : 0,
    tiers,
    available_to_allocate_nok: available,
    ready_to_assign_nok: available,
    safe_to_spend_before_funding_nok: safe,
    base_safe_to_spend_nok: safe,
    total_future_funding_nok: money(allAllocated),
    reserved_future_nok: money(allAllocated),
    reserved_true_expenses_nok: money(trueReservedTotal),
    reserved_total_nok: reservedTotal,
    overcommitted_nok: money(Math.max(0, reservedTotal - safe)),
    funding_by_month: fundingByMonth,
    true_expense_funds: trueExpenseFunds,
    recent_income: recentIncome,
    latest_salary: latestSalaryInfo,
    category_detail: categoryDetail,
    history_months_used: historyMonths
  };
}

function previewAllocation(model, amount) {
  const result = addPriority(model.funding_buckets, model.funding_goals, amount);
  const labels = {
    fixed: 'Faste',
    essential: 'Nødvendig',
    true_expenses: 'True Expenses',
    savings: 'Sparing',
    flex: 'Fri pott'
  };
  const steps = JOB_KEYS.map(key => {
    const field = `${key}_nok`;
    return {
      key,
      label: labels[key],
      needed_nok: money(model.funding_gaps?.[field]),
      allocated_nok: money(result.added[field])
    };
  });
  return {
    amount_nok: money(amount),
    reserved_nok: result.reserved_nok,
    left_unassigned_nok: result.left_unassigned_nok,
    steps,
    resulting_buckets: result.jobs
  };
}
function allocationEntry(jobs, source) {
  return {
    funded_nok: jobsTotal(jobs),
    buckets: { ...emptyJobs(), ...jobs },
    updated_at: new Date().toISOString(),
    source
  };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('Pragma', 'no-cache');

  try {
    if (!isAuthenticated(req)) return res.status(401).json({ error: 'Unauthorized' });
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not configured');

    const sql = neon(process.env.DATABASE_URL);
    const config = await configRow(sql);
    if (!config) return res.status(500).json({ error: 'MoneyOS-konfigurasjonen mangler' });

    const nowMonth = new Date().toISOString().slice(0, 7);
    const month = monthOr(req.method === 'GET' ? req.query?.month : req.body?.month, nextMonth(nowMonth));
    const model = await buildMonth(sql, config, month);

    if (req.method === 'GET') {
      const amount = Math.min(money(req.query?.amount_nok), model.available_to_allocate_nok);
      return res.status(200).json({
        ...model,
        allocation_preview: amount > 0 ? previewAllocation(model, amount) : null
      });
    }
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const action = text(req.body?.action, 30);
    const current = config.summary?.budget_system ?? {};
    const funding = {
      ...(current.funding ?? {}),
      allocations: { ...(current.funding?.allocations ?? {}) },
      income_allocations: { ...(current.funding?.income_allocations ?? {}) },
      true_expense_reserves: { ...(current.funding?.true_expense_reserves ?? {}) }
    };

    const monthAction = ['set_funding', 'allocate_amount', 'allocate_salary', 'set_bucket_funding', 'migrate_month_allocation'].includes(action);
    if (monthAction && month <= nowMonth) {
      return res.status(409).json({ error: 'MoneyOS reserverer bare penger til fremtidige måneder. Inneværende måned er allerede aktiv.' });
    }

    if (action === 'set_funding') {
      const requested = money(req.body?.funded_nok);
      const existing = money(model.funded_nok);
      const maxAllowed = money(existing + model.available_to_allocate_nok);
      if (requested > maxAllowed + 0.01) {
        return res.status(409).json({ error: `Bare ${Math.round(maxAllowed)} kr kan reserveres uten å bruke penger MoneyOS allerede trenger.` });
      }
      const jobs = distributeTotal(requested, model.funding_goals);
      funding.allocations[month] = allocationEntry(jobs, 'manual');
    } else if (action === 'allocate_amount') {
      const amount = money(req.body?.amount_nok);
      if (amount <= 0) return res.status(400).json({ error: 'Beløpet må være større enn 0' });
      const preview = previewAllocation(model, Math.min(amount, model.available_to_allocate_nok));
      if (preview.reserved_nok <= 0) return res.status(409).json({ error: 'Månedsjobbene er allerede fullfinansiert' });
      funding.allocations[month] = allocationEntry(preview.resulting_buckets, 'priority_allocation');
    } else if (action === 'allocate_salary') {
      const transactionId = text(req.body?.transaction_id, 128);
      if (!transactionId) return res.status(400).json({ error: 'Mangler lønnstransaksjon' });
      if (funding.income_allocations[transactionId]) return res.status(409).json({ error: 'Denne lønnen er allerede fordelt i MoneyOS' });
      const salary = await salaryById(sql, transactionId);
      if (!salary) return res.status(404).json({ error: 'Fant ikke en bokført lønnsutbetaling' });
      const amount = Math.min(money(salary.amount), model.available_to_allocate_nok);
      const preview = previewAllocation(model, amount);
      if (preview.reserved_nok <= 0) return res.status(409).json({ error: 'Ingen ledige månedsjobber kan finansieres nå' });
      funding.allocations[month] = allocationEntry(preview.resulting_buckets, 'salary_priority');
      funding.income_allocations[transactionId] = {
        target_month: month,
        salary_amount_nok: money(salary.amount),
        reserved_nok: preview.reserved_nok,
        left_unassigned_nok: money(money(salary.amount) - preview.reserved_nok),
        bucket_breakdown: Object.fromEntries(JOB_KEYS.map(key => [`${key}_nok`, money(preview.steps.find(step => step.key === key)?.allocated_nok)])),
        allocated_at: new Date().toISOString()
      };
    } else if (action === 'set_bucket_funding') {
      const jobs = sanitizeRequestedJobs(req.body?.buckets, model.funding_goals);
      const requestedTotal = jobsTotal(jobs);
      const maxAllowed = money(model.funded_nok + model.available_to_allocate_nok);
      if (requestedTotal > maxAllowed + 0.01) {
        return res.status(409).json({ error: `Jobbfordelingen kan maksimalt bruke ${Math.round(maxAllowed)} kr av trygge penger.` });
      }
      funding.allocations[month] = allocationEntry(jobs, 'explicit_jobs');
    } else if (action === 'migrate_month_allocation') {
      if (!model.funding_legacy_derived) return res.status(409).json({ error: 'Denne månedsreserven har allerede eksplisitt jobbfordeling' });
      funding.allocations[month] = allocationEntry(model.funding_buckets, 'legacy_migrated');
    } else if (action === 'fund_true_expense') {
      const fundId = text(req.body?.fund_id, 80);
      const fund = (current.sinking_funds ?? []).find(item => String(item?.id) === fundId && item?.is_active !== false);
      const modelFund = model.true_expense_funds?.find(item => String(item?.id) === fundId);
      if (!fund || !modelFund) return res.status(404).json({ error: 'Fant ikke True Expense-målet' });
      const existing = money(funding.true_expense_reserves?.[fundId]?.reserved_nok);
      const room = money(modelFund.remaining_to_goal_nok);
      const requested = money(req.body?.amount_nok);
      const add = Math.min(requested, room, model.available_to_allocate_nok);
      if (requested <= 0) return res.status(400).json({ error: 'Beløpet må være større enn 0' });
      if (add <= 0) {
        return res.status(409).json({ error: room <= 0 ? 'Målet er allerede finansiert eller betalt' : 'Ingen ufordelte trygge penger er tilgjengelige' });
      }
      funding.true_expense_reserves[fundId] = {
        reserved_nok: money(existing + add),
        updated_at: new Date().toISOString(),
        source: 'explicit_true_expense'
      };
    } else if (action === 'release_true_expense') {
      const fundId = text(req.body?.fund_id, 80);
      const existing = money(funding.true_expense_reserves?.[fundId]?.reserved_nok);
      if (existing <= 0) return res.status(409).json({ error: 'Dette målet har ingen MoneyOS-reserve å frigi' });
      const requested = money(req.body?.amount_nok);
      const release = requested > 0 ? Math.min(requested, existing) : existing;
      const left = money(existing - release);
      if (left > 0) {
        funding.true_expense_reserves[fundId] = {
          ...(funding.true_expense_reserves[fundId] ?? {}),
          reserved_nok: left,
          updated_at: new Date().toISOString()
        };
      } else {
        delete funding.true_expense_reserves[fundId];
      }
    } else if (action === 'clear_funding') {
      delete funding.allocations[month];
      for (const [id, entry] of Object.entries(funding.income_allocations)) {
        if (entry?.target_month === month) delete funding.income_allocations[id];
      }
    } else {
      return res.status(400).json({ error: 'Ukjent handling' });
    }

    const next = {
      ...current,
      version: Math.max(5, Number(current.version ?? 1)),
      funding,
      updated_at: new Date().toISOString()
    };
    await sql`
      UPDATE documents
      SET extracted_summary=jsonb_set(
        COALESCE(extracted_summary,'{}'::jsonb),
        '{budget_system}',
        ${JSON.stringify(next)}::jsonb,
        true
      )
      WHERE id=${config.id}
    `;

    const updatedConfig = { ...config, summary: { ...config.summary, budget_system: next } };
    const updated = await buildMonth(sql, updatedConfig, month);
    return res.status(200).json({ ok: true, ...updated });
  } catch (error) {
    console.error(error);
    return res.status(error?.status || 500).json({ error: error?.message || 'Kunne ikke oppdatere finansieringen' });
  }
}

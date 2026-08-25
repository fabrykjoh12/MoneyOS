const $ = (id) => document.getElementById(id);
const state = { data: null, view: 'overview' };

const money = new Intl.NumberFormat('nb-NO', { style: 'currency', currency: 'NOK', maximumFractionDigits: 0 });
const moneyPrecise = new Intl.NumberFormat('nb-NO', { style: 'currency', currency: 'NOK', minimumFractionDigits: 0, maximumFractionDigits: 2 });
const dateLong = new Intl.DateTimeFormat('nb-NO', { day: 'numeric', month: 'short' });
const dateFull = new Intl.DateTimeFormat('nb-NO', { day: 'numeric', month: 'long', year: 'numeric' });
const monthFmt = new Intl.DateTimeFormat('nb-NO', { month: 'short' });

function parseDate(value) { if (!value) return null; return new Date(`${String(value).slice(0, 10)}T12:00:00`); }
function formatMoney(value, precise = false) { return (precise ? moneyPrecise : money).format(Number(value ?? 0)); }
function signedMoney(value) { const n = Number(value ?? 0); return `${n > 0 ? '+' : ''}${formatMoney(n)}`; }
function classFor(value) { return Number(value) < 0 ? 'negative' : Number(value) > 0 ? 'positive' : ''; }
function escapeHtml(value) { return String(value ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
function cadenceLabel(value) { return ({ daily:'Daglig', weekly:'Ukentlig', biweekly:'Annenhver uke', monthly:'Månedlig', quarterly:'Kvartalsvis', yearly:'Årlig' })[value] || value || 'Fast'; }
function daysBetween(a, b) { if (!a || !b) return null; return Math.round((b - a) / 86400000); }

async function request(url, options = {}) {
  const response = await fetch(url, { credentials: 'same-origin', ...options });
  let body = null;
  try { body = await response.json(); } catch {}
  return { response, body };
}

async function loadDashboard() {
  $('loading').classList.remove('hidden');
  const { response, body } = await request('/api/dashboard');
  $('loading').classList.add('hidden');
  if (response.status === 401) {
    $('app').classList.add('hidden'); $('login').classList.remove('hidden'); $('password').focus(); return;
  }
  if (!response.ok || !body) { alert(body?.error ?? 'Kunne ikke hente økonomien.'); return; }
  state.data = body;
  $('login').classList.add('hidden'); $('app').classList.remove('hidden');
  render(body);
}

function render(data) {
  const o = data.overview ?? {};
  const c = data.cost_summary ?? {};
  const categories = data.spending_by_category ?? [];
  const fixed = data.fixed_costs ?? [];

  $('as-of').textContent = parseDate(o.as_of) ? `Systemdato ${dateFull.format(parseDate(o.as_of))}` : '';
  renderFreshness(data.data_freshness ?? {});

  $('safe-to-spend').textContent = formatMoney(o.safe_to_spend);
  $('safe-to-spend').className = `hero-value ${classFor(o.safe_to_spend)}`;
  $('safe-caption').textContent = `${formatMoney(o.spendable_balance)} på brukskontoer · ${formatMoney(o.upcoming_expenses_to_payday)} forventet ut før lønn`;
  $('daily-safe').textContent = formatMoney(o.daily_safe_to_spend);
  $('next-payday').textContent = parseDate(o.next_payday) ? dateLong.format(parseDate(o.next_payday)) : 'Ikke satt';
  $('committed-before-payday').textContent = formatMoney(o.upcoming_expenses_to_payday);
  $('buffer-target').textContent = Number(o.emergency_buffer_target ?? 0) > 0 ? formatMoney(o.emergency_buffer_target) : 'Ikke satt';
  $('safe-status').textContent = Number(o.upcoming_expenses_to_payday ?? 0) > 0 ? 'Etter kommende trekk' : 'Ingen kjente trekk';
  const ratio = Number(o.spendable_balance ?? 0) > 0 ? Number(o.safe_to_spend ?? 0) / Number(o.spendable_balance) * 100 : 0;
  $('safe-progress').style.width = `${Math.max(0, Math.min(ratio, 100))}%`;

  $('liquid-balance').textContent = formatMoney(c.liquid_non_savings);
  $('total-balance').textContent = formatMoney(o.total_balance);
  $('fixed-monthly').textContent = formatMoney(c.fixed_monthly_total);
  $('fixed-caption').textContent = `${fixed.length} bekreftede trekk`;
  $('month-expenses').textContent = formatMoney(o.month_expenses);
  $('month-expense-caption').textContent = categories.length ? `${categories.length} kategorier · bokført` : 'Ingen bokførte kjøp';
  $('month-net').textContent = signedMoney(o.month_net);
  $('month-net').className = `metric-value ${classFor(o.month_net)}`;
  $('month-flow').textContent = `${formatMoney(o.month_income)} inn · ${formatMoney(o.month_expenses)} ut`;

  renderSpending(categories, o.month_expenses, 'spending-list');
  renderSpending(categories, o.month_expenses, 'spending-list-2');
  $('spending-total').textContent = formatMoney(o.month_expenses);
  $('spending-total-2').textContent = formatMoney(o.month_expenses);
  renderUpcoming(data.upcoming ?? [], 'upcoming-list', 7);
  renderAccounts(data.accounts ?? []);
  renderHistory(data.monthly_history ?? [], 'history-chart', 7);
  renderHistory(data.monthly_history ?? [], 'history-chart-2', 13);
  renderHistoryCaption(data.monthly_history ?? []);

  $('summary-income').textContent = formatMoney(o.month_income);
  $('summary-expenses').textContent = formatMoney(o.month_expenses);
  $('pending-expenses').textContent = formatMoney(c.pending_expenses);
  $('summary-net').textContent = signedMoney(o.month_net);
  $('summary-net').className = classFor(o.month_net);
  renderMonthInsight(o, c);

  renderFixedCosts(fixed, c.fixed_monthly_total);
  renderReviewCandidates(data.review_candidates ?? [], data.inactive_notes ?? '');
  $('fixed-total').textContent = formatMoney(c.fixed_monthly_total);
  $('annual-monthly').textContent = formatMoney(c.fixed_monthly_total);
  $('annual-japan').textContent = formatMoney(Number(c.fixed_monthly_total) * 5);
  $('annual-year').textContent = formatMoney(Number(c.fixed_monthly_total) * 12);

  renderJapan(data);
  renderTransactions(data.recent_transactions ?? []);
}

function renderFreshness(fresh) {
  const root = $('freshness-banner');
  const latest = parseDate(fresh.latest_transaction_date);
  const snapshot = parseDate(fresh.account_snapshot_date);
  const source = parseDate(fresh.source_through);
  const today = new Date();
  const ages = [latest, snapshot, source].filter(Boolean).map(d => daysBetween(d, today)).filter(v => v !== null);
  const age = ages.length ? Math.max(...ages) : 0;
  if (age <= 2) { root.classList.add('hidden'); return; }
  const through = source || latest || snapshot;
  root.classList.remove('hidden');
  root.innerHTML = `<strong>Saldoen er et øyeblikksbilde</strong><span>Bankdata går til ${through ? dateFull.format(through) : 'siste import'}. Nye kjøp etter dette er ikke med før neste import.</span>`;
}

function renderSpending(items, total, rootId) {
  const root = $(rootId); if (!root) return;
  const totalSpent = Number(total ?? 0);
  if (!items.length) { root.className = 'spending-list empty-state'; root.textContent = 'Ingen bokførte utgifter denne måneden.'; return; }
  const max = Math.max(...items.map(i => Number(i.spent ?? 0)), 1);
  root.className = 'spending-list';
  root.innerHTML = items.map(item => {
    const spent = Number(item.spent ?? 0);
    const share = totalSpent > 0 ? spent / totalSpent * 100 : 0;
    const width = spent / max * 100;
    return `<div class="spending-row"><div class="spending-main"><div><div class="row-title">${escapeHtml(item.category)}</div><div class="row-sub">${item.transactions ?? 0} kjøp · ${Math.round(share)}%</div></div><strong>${formatMoney(spent)}</strong></div><div class="category-bar" style="--width:${Math.max(width,2)}%"><span></span></div></div>`;
  }).join('');
}

function renderUpcoming(items, rootId, limit = 10) {
  const root = $(rootId); if (!root) return;
  const visible = items.slice(0, limit);
  if (!visible.length) { root.className = 'timeline empty-state'; root.textContent = 'Ingen kommende poster.'; return; }
  root.className = 'timeline';
  root.innerHTML = visible.map(item => `<div class="timeline-row"><div class="timeline-date">${parseDate(item.event_date) ? dateLong.format(parseDate(item.event_date)) : '—'}</div><div><div class="row-title">${escapeHtml(item.name)}</div><div class="row-sub">${item.source === 'planned' ? 'Planlagt' : 'Fast trekk'}</div></div><div class="amount expense">−${formatMoney(item.amount)}</div></div>`).join('');
}

function renderAccounts(items) {
  const root = $('account-list');
  if (!items.length) { root.className = 'accounts empty-state'; root.textContent = 'Ingen kontoer.'; return; }
  root.className = 'accounts';
  root.innerHTML = items.map(item => `<div class="account-row"><div><div class="row-title">${escapeHtml(item.name)}</div><div class="row-sub">${item.include_in_safe_to_spend ? 'Tilgjengelig' : 'Holdes utenfor trygt å bruke'}</div></div><strong>${formatMoney(item.current_balance)}</strong></div>`).join('');
}

function renderHistory(items, rootId, limit) {
  const root = $(rootId); if (!root) return;
  const data = items.slice(-limit);
  if (!data.length) { root.innerHTML = '<div class="empty-state">Ingen historikk.</div>'; return; }
  const max = Math.max(...data.map(x => Number(x.expenses ?? 0)), 1);
  root.innerHTML = data.map(item => {
    const pct = Number(item.expenses ?? 0) / max * 100;
    const date = parseDate(`${item.month}-01`);
    return `<div class="history-col" title="${escapeHtml(item.month)}: ${formatMoney(item.expenses)}"><div class="history-value">${formatMoney(item.expenses)}</div><div class="history-bar-wrap"><span class="history-bar" style="height:${Math.max(pct,4)}%"></span></div><div class="history-label">${date ? monthFmt.format(date) : escapeHtml(item.month)}</div></div>`;
  }).join('');
}

function renderHistoryCaption(items) {
  const completed = items.slice(0, -1).slice(-3);
  if (!completed.length) { $('trend-caption').textContent = '—'; return; }
  const avg = completed.reduce((s,x) => s + Number(x.expenses ?? 0), 0) / completed.length;
  $('trend-caption').textContent = `3 mnd snitt ${formatMoney(avg)}`;
}

function renderMonthInsight(o, c) {
  const root = $('month-insight');
  const pending = Number(c.pending_expenses ?? 0);
  const net = Number(o.month_net ?? 0);
  if (pending > 0) {
    root.innerHTML = `<strong>${formatMoney(pending)} er fortsatt pending</strong><span>Det vises separat for å unngå at reserverte kjøp blir dobbeltregnet som bokførte utgifter.</span>`;
  } else {
    root.innerHTML = `<strong>${signedMoney(net)} hittil denne måneden</strong><span>Interne kontooverføringer holdes utenfor vanlig forbruk.</span>`;
  }
}

function renderReviewCandidates(items, inactiveNote) {
  const root = $('review-candidates');
  if (!root) return;
  const rows = items.map(item => `<div class="review-item"><span class="review-dot"></span><div><strong>${escapeHtml(item.name)} · ${formatMoney(item.amount, true)}</strong><p>${escapeHtml(item.reason)}</p></div></div>`).join('');
  root.innerHTML = `${rows}${inactiveNote ? `<div class="review-note">${escapeHtml(inactiveNote)}</div>` : ''}`;
}

function renderFixedCosts(items) {
  const root = $('fixed-cost-list');
  if (!items.length) { root.className = 'fixed-cost-list empty-state'; root.textContent = 'Ingen bekreftede faste kostnader.'; return; }
  root.className = 'fixed-cost-list';
  root.innerHTML = items.map(item => {
    const due = parseDate(item.next_due_date) ? `Neste ${dateLong.format(parseDate(item.next_due_date))}` : 'Neste dato ukjent';
    const original = item.cadence === 'quarterly' ? `${formatMoney(item.amount, true)} hvert kvartal` : `${formatMoney(item.amount, true)} belastning`;
    return `<div class="fixed-row"><div class="fixed-name"><div class="row-title">${escapeHtml(item.name)}</div><div class="row-sub">${escapeHtml(item.category)} · ${cadenceLabel(item.cadence)} · ${due}</div></div><div class="fixed-meta"><strong>${formatMoney(item.monthly_amount, true)}</strong><span>/ mnd</span><small>${original}</small></div></div>`;
  }).join('');
}

function renderJapan(data) {
  const c = data.cost_summary ?? {};
  const p = data.japan_plan ?? {};
  const living = Number(p.living_budget_monthly ?? 0);
  const fixed = Number(p.confirmed_fixed_monthly ?? 0);
  const combined = Number(p.combined_monthly ?? 0);
  const liquid = Number(c.liquid_non_savings ?? 0);
  $('japan-living').textContent = formatMoney(living);
  $('japan-fixed').textContent = formatMoney(fixed);
  $('japan-combined').textContent = formatMoney(combined);
  $('japan-liquid').textContent = formatMoney(liquid);
  $('japan-budget-total').textContent = formatMoney(living);
  const runway = combined > 0 ? liquid / combined : 0;
  $('japan-runway').textContent = runway > 0 ? `${runway.toFixed(1).replace('.', ',')} mnd` : '—';
  renderBudgetList(data.next_budget ?? []);
  renderUpcoming(data.upcoming ?? [], 'japan-upcoming', 10);
}

function renderBudgetList(items) {
  const root = $('japan-budget-list');
  if (!items.length) { root.className = 'budget-list empty-state'; root.textContent = 'Ingen Japan-budsjett registrert.'; return; }
  const total = items.reduce((s,x) => s + Number(x.budget_amount ?? 0), 0) || 1;
  root.className = 'budget-list';
  root.innerHTML = items.sort((a,b) => Number(b.budget_amount)-Number(a.budget_amount)).map(item => {
    const pct = Number(item.budget_amount ?? 0) / total * 100;
    return `<div class="budget-line"><div><div class="row-title">${escapeHtml(item.category)}</div><div class="row-sub">${Math.round(pct)}% av levebudsjettet</div></div><div class="budget-amount">${formatMoney(item.budget_amount)}</div><div class="mini-track"><span style="width:${pct}%"></span></div></div>`;
  }).join('');
}

function renderTransactions(items) {
  const root = $('transaction-list');
  if (!items.length) { root.className = 'transaction-list empty-state'; root.textContent = 'Ingen transaksjoner.'; return; }
  root.className = 'transaction-list';
  root.innerHTML = items.map(item => {
    const income = item.transaction_type === 'income';
    const transfer = item.transaction_type === 'transfer';
    const title = item.merchant || item.description || item.category || 'Transaksjon';
    const sub = [item.category, item.account, parseDate(item.transaction_date) ? dateLong.format(parseDate(item.transaction_date)) : null].filter(Boolean).join(' · ');
    const prefix = income ? '+' : transfer ? '↔ ' : '−';
    return `<div class="transaction-row"><div><div class="row-title">${escapeHtml(title)}</div><div class="row-sub">${escapeHtml(sub)}</div></div><div class="amount ${income?'income':transfer?'transfer':'expense'}">${prefix}${formatMoney(item.amount)}</div></div>`;
  }).join('');
}

function setView(view) {
  state.view = view;
  document.querySelectorAll('.view-tab').forEach(btn => btn.classList.toggle('active', btn.dataset.view === view));
  document.querySelectorAll('[data-view-panel]').forEach(panel => panel.classList.toggle('active', panel.dataset.viewPanel === view));
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

document.querySelectorAll('.view-tab').forEach(btn => btn.addEventListener('click', () => setView(btn.dataset.view)));
$('login-form').addEventListener('submit', async event => {
  event.preventDefault(); $('login-error').textContent = '';
  const { response, body } = await request('/api/login', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({password:$('password').value}) });
  if (!response.ok) { $('login-error').textContent = body?.error ?? 'Kunne ikke logge inn.'; return; }
  $('password').value = ''; await loadDashboard();
});
$('refresh').addEventListener('click', loadDashboard);
$('logout').addEventListener('click', async () => { await request('/api/logout', { method:'POST' }); await loadDashboard(); });
loadDashboard();

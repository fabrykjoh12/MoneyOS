const monthMoney = new Intl.NumberFormat('nb-NO', { maximumFractionDigits: 0 });
const monthMoney2 = new Intl.NumberFormat('nb-NO', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const monthName = new Intl.DateTimeFormat('nb-NO', { month: 'long', year: 'numeric' });
const monthShort = new Intl.DateTimeFormat('nb-NO', { month: 'short' });
const transactionDate = new Intl.DateTimeFormat('nb-NO', { day: 'numeric', month: 'short' });
let monthData = [];
let selectedMonth = null;
let loadingMonths = false;

function nok(value, precise = false) {
  return `${(precise ? monthMoney2 : monthMoney).format(Number(value || 0))} kr`;
}

function monthDate(value) {
  const [year, month] = String(value).split('-').map(Number);
  return new Date(year, month - 1, 1, 12, 0, 0);
}

function titleCase(value) {
  const text = String(value || '');
  return text ? text[0].toUpperCase() + text.slice(1) : text;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
}

function ensureExplorer() {
  if (document.getElementById('month-explorer')) return true;
  const balance = document.querySelector('[data-view-panel="money"] .money-balance');
  if (!balance) return false;

  const explorer = document.createElement('section');
  explorer.id = 'month-explorer';
  explorer.className = 'months-explorer';
  explorer.innerHTML = `
    <div class="months-head">
      <div>
        <p class="panel-kicker">MÅNEDER</p>
        <h2>Hvor gikk pengene?</h2>
        <p>Velg en måned, og trykk deretter på en kategori for å se hva pengene faktisk ble brukt på.</p>
      </div>
      <span id="months-count" class="months-count"></span>
    </div>
    <div id="month-strip" class="month-strip" aria-label="Velg måned"></div>
    <div id="month-detail" class="month-detail">
      <div class="month-detail-head">
        <div>
          <p id="selected-month-kicker" class="panel-kicker">VALGT MÅNED</p>
          <h3 id="selected-month-title">—</h3>
          <p id="selected-month-story" class="month-story">—</p>
        </div>
        <div class="month-detail-stats">
          <div><span>Inn</span><strong id="selected-income">—</strong></div>
          <div><span>Ut</span><strong id="selected-expenses">—</strong></div>
          <div><span>Netto</span><strong id="selected-net">—</strong></div>
        </div>
      </div>
      <div class="category-head">
        <div><span>Kategori</span><span>Andel</span></div>
        <span>Brukt</span>
      </div>
      <div id="selected-categories" class="selected-categories"></div>
      <p id="selected-month-source" class="month-source"></p>
    </div>`;
  balance.insertAdjacentElement('afterend', explorer);
  ensureCategorySheet();
  return true;
}

function ensureCategorySheet() {
  if (document.getElementById('category-sheet-backdrop')) return;
  const backdrop = document.createElement('div');
  backdrop.id = 'category-sheet-backdrop';
  backdrop.className = 'category-sheet-backdrop hidden';
  backdrop.setAttribute('role', 'dialog');
  backdrop.setAttribute('aria-modal', 'true');
  backdrop.innerHTML = `
    <section class="category-sheet" aria-labelledby="category-sheet-title">
      <div class="category-sheet-head">
        <div>
          <p id="category-sheet-month" class="panel-kicker">KATEGORI</p>
          <h2 id="category-sheet-title">—</h2>
          <p id="category-sheet-summary" class="category-sheet-summary">—</p>
        </div>
        <button id="close-category-sheet" class="category-close" type="button">Lukk</button>
      </div>
      <div id="category-transactions" class="category-transactions"></div>
      <p id="category-sheet-note" class="category-sheet-note"></p>
    </section>`;
  document.body.appendChild(backdrop);
  document.getElementById('close-category-sheet')?.addEventListener('click', closeCategorySheet);
  backdrop.addEventListener('click', event => { if (event.target === backdrop) closeCategorySheet(); });
}

async function loadMonths() {
  if (loadingMonths || !ensureExplorer()) return;
  loadingMonths = true;
  try {
    const response = await fetch('/api/dashboard', { credentials: 'same-origin', cache: 'no-store' });
    if (!response.ok) return;
    const body = await response.json();
    monthData = Array.isArray(body.monthly_breakdown) ? body.monthly_breakdown : [];
    if (!monthData.length) return;
    if (!selectedMonth || !monthData.some(item => item.month === selectedMonth)) selectedMonth = monthData[0].month;
    renderMonths();
  } finally {
    loadingMonths = false;
  }
}

function renderMonths() {
  const strip = document.getElementById('month-strip');
  const count = document.getElementById('months-count');
  if (!strip || !monthData.length) return;
  const maxExpense = Math.max(...monthData.map(item => Number(item.expenses || 0)), 1);
  count.textContent = `${monthData.length} måneder`;
  strip.innerHTML = monthData.map(item => {
    const date = monthDate(item.month);
    const active = item.month === selectedMonth;
    const bar = Math.max(5, Math.round(Number(item.expenses || 0) / maxExpense * 100));
    const current = item.source === 'live';
    return `<button class="month-card${active ? ' active' : ''}" data-month="${item.month}" type="button" aria-pressed="${active}">
      <div class="month-card-top"><span>${titleCase(monthShort.format(date))}</span>${current ? '<i>Pågår</i>' : ''}</div>
      <strong>${nok(item.expenses)}</strong>
      <small>${date.getFullYear()}</small>
      <div class="month-mini-track"><span style="width:${bar}%"></span></div>
    </button>`;
  }).join('');

  strip.querySelectorAll('[data-month]').forEach(button => button.addEventListener('click', () => {
    selectedMonth = button.dataset.month;
    renderMonths();
    document.getElementById('month-detail')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }));
  renderMonthDetail();
}

function renderMonthDetail() {
  const index = monthData.findIndex(item => item.month === selectedMonth);
  const item = monthData[index];
  if (!item) return;
  const date = monthDate(item.month);
  const income = Number(item.income || 0);
  const expenses = Number(item.expenses || 0);
  const net = Number(item.net || 0);
  const categories = Object.entries(item.categories || {})
    .map(([category, amount]) => ({ category, amount: Number(amount || 0) }))
    .filter(entry => entry.amount > 0)
    .sort((a, b) => b.amount - a.amount);
  const top = categories[0];
  const previous = monthData[index + 1];

  document.getElementById('selected-month-title').textContent = titleCase(monthName.format(date));
  document.getElementById('selected-income').textContent = nok(income);
  document.getElementById('selected-expenses').textContent = nok(expenses);
  const netElement = document.getElementById('selected-net');
  netElement.textContent = `${net > 0 ? '+' : ''}${nok(net)}`;
  netElement.classList.toggle('positive-net', net >= 0);
  netElement.classList.toggle('negative-net', net < 0);

  let story = top ? `${top.category} var største kategori med ${nok(top.amount)}.` : 'Ingen kategoriserte utgifter.';
  if (previous) {
    const diff = expenses - Number(previous.expenses || 0);
    const pct = Number(previous.expenses || 0) > 0 ? Math.round(Math.abs(diff) / Number(previous.expenses) * 100) : 0;
    if (Math.abs(diff) >= 1) story += ` Det er ${nok(Math.abs(diff))} ${diff > 0 ? 'mer' : 'mindre'} enn måneden før${pct ? ` (${pct}%)` : ''}.`;
  }
  document.getElementById('selected-month-story').textContent = story;

  const categoryRoot = document.getElementById('selected-categories');
  categoryRoot.innerHTML = categories.map((entry, categoryIndex) => {
    const pct = expenses > 0 ? entry.amount / expenses * 100 : 0;
    return `<button class="category-row category-button" data-category="${encodeURIComponent(entry.category)}" type="button" aria-label="Vis kjøp i ${escapeHtml(entry.category)}">
      <div class="category-main">
        <span class="category-rank">${String(categoryIndex + 1).padStart(2, '0')}</span>
        <div class="category-copy"><strong>${escapeHtml(entry.category)}</strong><div class="category-track"><span style="width:${Math.min(pct, 100).toFixed(1)}%"></span></div></div>
        <span class="category-percent">${Math.round(pct)}%</span>
      </div>
      <div class="category-action"><strong class="category-amount">${nok(entry.amount, true)}</strong><span aria-hidden="true">›</span></div>
    </button>`;
  }).join('') || '<p class="month-empty">Ingen kategoriserte utgifter denne måneden.</p>';

  categoryRoot.querySelectorAll('[data-category]').forEach(button => button.addEventListener('click', () => {
    openCategory(decodeURIComponent(button.dataset.category));
  }));

  document.getElementById('selected-month-source').textContent = item.source === 'live'
    ? 'Bokførte banktransaksjoner hittil denne måneden. Reserverte kjøp og interne overføringer er ikke med i forbruket.'
    : 'Historisk månedssammendrag fra bankdata. Trykk på en kategori; enkeltkjøp vises der de er importert på transaksjonsnivå.';
}

async function openCategory(category) {
  ensureCategorySheet();
  const item = monthData.find(row => row.month === selectedMonth);
  if (!item) return;
  const date = monthDate(item.month);
  const expected = Number(item.categories?.[category] || 0);
  const backdrop = document.getElementById('category-sheet-backdrop');
  const root = document.getElementById('category-transactions');
  const note = document.getElementById('category-sheet-note');

  document.getElementById('category-sheet-month').textContent = titleCase(monthName.format(date)).toUpperCase();
  document.getElementById('category-sheet-title').textContent = category;
  document.getElementById('category-sheet-summary').textContent = `${nok(expected, true)} brukt i denne kategorien`;
  root.innerHTML = '<div class="category-loading">Henter kjøp…</div>';
  note.textContent = '';
  backdrop.classList.remove('hidden');
  document.body.classList.add('sheet-open');

  try {
    const params = new URLSearchParams({ month: selectedMonth, category });
    const response = await fetch(`/api/month-transactions?${params.toString()}`, { credentials: 'same-origin', cache: 'no-store' });
    const body = await response.json().catch(() => null);
    if (!response.ok || !body) throw new Error(body?.error || 'Kunne ikke hente kjøpene');

    if (!body.available || !Array.isArray(body.transactions) || !body.transactions.length) {
      root.innerHTML = `<div class="category-unavailable"><strong>Enkeltkjøpene er ikke importert ennå.</strong><p>MoneyOS har den sikre kategorisummen på ${nok(expected, true)}, men denne eldre måneden ligger foreløpig bare som historisk sammendrag. Original bankutskrift finnes og kan etterfylles uten å gjette.</p></div>`;
      note.textContent = 'Ingen transaksjoner er konstruert eller estimert.';
      return;
    }

    root.innerHTML = body.transactions.map(row => {
      const label = row.merchant || row.description || 'Transaksjon';
      const detail = row.merchant && row.description && row.description !== row.merchant ? row.description : row.account;
      return `<div class="category-transaction-row">
        <div class="category-merchant-mark">${escapeHtml((String(label).trim().slice(0,2) || '•').toUpperCase())}</div>
        <div class="category-transaction-copy">
          <strong>${escapeHtml(label)}</strong>
          <span>${escapeHtml(detail || row.account || '')} · ${transactionDate.format(new Date(row.transaction_date))}</span>
        </div>
        <strong class="category-transaction-amount">−${nok(row.amount, true)}</strong>
      </div>`;
    }).join('');

    const actual = Number(body.total || 0);
    const difference = Math.abs(actual - expected);
    note.textContent = difference > 1
      ? `Transaksjonene som er importert summerer ${nok(actual, true)}, mens månedssammendraget viser ${nok(expected, true)}. Forskjellen er synlig fordi MoneyOS ikke skjuler datamismatch.`
      : `${body.count} bokførte kjøp · ${nok(actual, true)} totalt. Reserverte kjøp og interne overføringer er ikke med.`;
  } catch (error) {
    root.innerHTML = `<div class="category-unavailable"><strong>Kunne ikke hente kjøpene.</strong><p>${escapeHtml(error.message)}</p></div>`;
  }
}

function closeCategorySheet() {
  document.getElementById('category-sheet-backdrop')?.classList.add('hidden');
  document.body.classList.remove('sheet-open');
}

function bootMonths() {
  const app = document.getElementById('app');
  if (!app) return;
  const tryLoad = () => { if (!app.classList.contains('hidden')) loadMonths(); };
  tryLoad();
  new MutationObserver(tryLoad).observe(app, { attributes: true, attributeFilter: ['class'] });
  document.getElementById('refresh')?.addEventListener('click', () => setTimeout(loadMonths, 150));
  document.addEventListener('keydown', event => { if (event.key === 'Escape') closeCategorySheet(); });
}

bootMonths();

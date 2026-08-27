const monthMoney = new Intl.NumberFormat('nb-NO', { maximumFractionDigits: 0 });
const monthMoney2 = new Intl.NumberFormat('nb-NO', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const monthName = new Intl.DateTimeFormat('nb-NO', { month: 'long', year: 'numeric' });
const monthShort = new Intl.DateTimeFormat('nb-NO', { month: 'short' });
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
        <p>Velg en måned for å se inn, ut og hvilke kategorier du brukte penger på.</p>
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
  return true;
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
    .filter(item => item.amount > 0)
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
    return `<div class="category-row">
      <div class="category-main">
        <span class="category-rank">${String(categoryIndex + 1).padStart(2, '0')}</span>
        <div class="category-copy"><strong>${entry.category}</strong><div class="category-track"><span style="width:${Math.min(pct, 100).toFixed(1)}%"></span></div></div>
        <span class="category-percent">${Math.round(pct)}%</span>
      </div>
      <strong class="category-amount">${nok(entry.amount, true)}</strong>
    </div>`;
  }).join('') || '<p class="month-empty">Ingen kategoriserte utgifter denne måneden.</p>';

  document.getElementById('selected-month-source').textContent = item.source === 'live'
    ? 'Bokførte banktransaksjoner hittil denne måneden. Reserverte kjøp og interne overføringer er ikke med i forbruket.'
    : 'Historisk månedssammendrag fra bankdata. Interne overføringer er ikke regnet som forbruk.';
}

function bootMonths() {
  const app = document.getElementById('app');
  if (!app) return;
  const tryLoad = () => { if (!app.classList.contains('hidden')) loadMonths(); };
  tryLoad();
  new MutationObserver(tryLoad).observe(app, { attributes: true, attributeFilter: ['class'] });
  document.getElementById('refresh')?.addEventListener('click', () => setTimeout(loadMonths, 150));
}

bootMonths();

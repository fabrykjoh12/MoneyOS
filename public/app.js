const $ = (id) => document.getElementById(id);
const state = { data: null, view: 'today', horizonDays: 30, transactionFilter: '' };
const money0 = new Intl.NumberFormat('nb-NO', { maximumFractionDigits: 0 });
const money2 = new Intl.NumberFormat('nb-NO', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const dateShort = new Intl.DateTimeFormat('nb-NO', { day: 'numeric', month: 'short' });
const dateFull = new Intl.DateTimeFormat('nb-NO', { day: 'numeric', month: 'long', year: 'numeric' });

function n(v){ return Number(v ?? 0); }
function kr(v, precise=false){ return `${(precise?money2:money0).format(n(v))} kr`; }
function signed(v){ const x=n(v); return `${x>0?'+':''}${kr(x)}`; }
function parseDate(v){ if(!v) return null; return new Date(`${String(v).slice(0,10)}T12:00:00`); }
function esc(v){ return String(v ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function daysBetween(a,b){ return Math.round((b-a)/86400000); }
function classFor(v){ return n(v)<0?'negative':n(v)>0?'positive':''; }
function cadenceLabel(v){ return ({daily:'Daglig',weekly:'Ukentlig',biweekly:'Annenhver uke',monthly:'Månedlig',quarterly:'Kvartalsvis',yearly:'Årlig'})[v] || 'Fast'; }

async function request(url, options={}){
  const response=await fetch(url,{credentials:'same-origin',...options});
  let body=null; try{body=await response.json();}catch{}
  return {response,body};
}

async function loadDashboard(){
  $('loading').classList.remove('hidden');
  const {response,body}=await request('/api/dashboard');
  $('loading').classList.add('hidden');
  if(response.status===401){ $('app').classList.add('hidden'); $('login').classList.remove('hidden'); return; }
  if(!response.ok||!body){ alert(body?.error ?? 'Kunne ikke hente økonomidata'); return; }
  state.data=body; $('login').classList.add('hidden'); $('app').classList.remove('hidden'); render();
}

function render(){
  renderHeader(); renderFreshness(); renderToday(); renderHorizon(); renderPlans(); renderMoney();
}

function renderHeader(){
  const o=state.data?.overview??{}; const d=parseDate(o.as_of);
  $('as-of').textContent=d?`System ${dateShort.format(d)}`:'';
  const labels={today:['I DAG','Oversikt'],horizon:['FREMOVER','Horizon'],plans:['PLANER','Japan'],money:['PENGER','Aktivitet']};
  const [k,t]=labels[state.view]||labels.today; $('section-kicker').textContent=k; $('section-title').textContent=t;
}

function renderFreshness(){
  const f=state.data?.data_freshness??{}; const latest=parseDate(f.latest_transaction_date); const snap=parseDate(f.account_snapshot_date); const src=parseDate(f.source_through); const dates=[latest,snap,src].filter(Boolean); const oldest=dates.length?dates.reduce((a,b)=>a<b?a:b):null; const newest=dates.length?dates.reduce((a,b)=>a>b?a:b):null; const age=oldest?daysBetween(oldest,new Date()):0;
  $('sync-chip').textContent=newest?`Data til ${dateShort.format(newest)}`:'Data ukjent';
  const banner=$('freshness-banner'); if(age<=2){banner.classList.add('hidden');return;} banner.classList.remove('hidden'); banner.innerHTML=`<strong>Saldoen er et snapshot.</strong><span>Bankdata går til ${newest?dateFull.format(newest):'siste import'}. Nye kjøp etter dette er ikke med.</span>`;
}

function renderToday(){
  const d=state.data,o=d.overview??{},c=d.cost_summary??{},fixed=d.fixed_costs??[];
  $('safe-to-spend').textContent=money0.format(n(o.safe_to_spend));
  $('safe-caption').textContent=`${kr(o.spendable_balance)} tilgjengelig på brukskontoer, minus ${kr(o.upcoming_expenses_to_payday)} kjente trekk før neste lønn.`;
  $('daily-safe').textContent=kr(o.daily_safe_to_spend); $('days-to-payday').textContent=`${n(o.days_to_payday)} dager`; $('next-payday').textContent=parseDate(o.next_payday)?dateShort.format(parseDate(o.next_payday)):'Ikke satt';
  $('liquid-balance').textContent=kr(c.liquid_non_savings); $('committed-before-payday').textContent=kr(o.upcoming_expenses_to_payday); $('fixed-monthly').textContent=kr(c.fixed_monthly_total); $('fixed-caption').textContent=`${fixed.length} bekreftede`; $('month-net').textContent=signed(o.month_net); $('month-net').className=classFor(o.month_net); $('month-flow').textContent=`${kr(o.month_income)} inn · ${kr(o.month_expenses)} ut`;
  const upcoming=(d.upcoming??[]).filter(x=>parseDate(x.event_date)); const beforePayday=upcoming.filter(x=>parseDate(o.next_payday)&&parseDate(x.event_date)<=parseDate(o.next_payday)); $('committed-count').textContent=`${beforePayday.length} kjente poster`;
  renderUpcoming(upcoming.slice(0,4),'upcoming-list'); $('month-expenses').textContent=kr(o.month_expenses); renderPace(d); renderTopSpending(d.spending_by_category??[]);
  const jp=d.japan_plan??{}; $('cost-life-total').textContent=kr(jp.combined_monthly); $('cost-living').textContent=kr(jp.living_budget_monthly); $('cost-fixed').textContent=kr(jp.confirmed_fixed_monthly);
}

function renderUpcoming(items,id){ const root=$(id); if(!items.length){root.innerHTML='<div class="row-sub">Ingen kjente trekk.</div>';return;} root.innerHTML=items.map(x=>`<div class="clean-row"><div class="clean-date">${dateShort.format(parseDate(x.event_date))}</div><div><div class="row-title">${esc(x.name)}</div><div class="row-sub">${x.source==='planned'?'Planlagt':'Fast trekk'}</div></div><div class="amount ${x.event_type==='income'?'income':'expense'}">${x.event_type==='income'?'+':'−'}${kr(x.amount)}</div></div>`).join(''); }

function renderPace(d){ const o=d.overview??{},c=d.cost_summary??{}; const spent=n(o.month_expenses),typical=n(c.typical_core_month); const ratio=typical>0?spent/typical:0; const pct=Math.min(ratio*100,100); let copy='Ingen normalmåned beregnet ennå.'; if(typical>0){copy=ratio>1.15?`${Math.round((ratio-1)*100)} % over typisk personlig måned.`:ratio<.85?`${Math.round((1-ratio)*100)} % under typisk personlig måned.`:'Nært typisk personlig månedsnivå.';} $('month-pace').innerHTML=`<div class="pace-main"><strong>${typical?`${Math.round(ratio*100)} %`:'—'}</strong><span>av typisk ${typical?kr(typical):'—'}</span></div><div class="pace-track"><span style="width:${pct}%"></span></div><div class="pace-caption">${copy}</div>`; }
function renderTopSpending(items){ $('top-spending').innerHTML=items.slice(0,4).map(x=>`<div class="top-row"><span>${esc(x.category)}</span><strong>${kr(x.spent)}</strong></div>`).join('')||'<div class="row-sub">Ingen bokførte kjøp.</div>'; }

function renderHorizon(){ const d=state.data,o=d.overview??{},all=(d.horizon_events??d.upcoming??[]); const today=parseDate(o.as_of)||new Date(); const end=new Date(today); end.setDate(end.getDate()+state.horizonDays); const events=all.filter(x=>{const dt=parseDate(x.event_date);return dt&&dt>=today&&dt<=end;}); const out=events.filter(x=>x.event_type!=='income').reduce((s,x)=>s+n(x.amount),0); const incoming=events.filter(x=>x.event_type==='income').reduce((s,x)=>s+n(x.amount),0); $('horizon-out').textContent=kr(out); $('horizon-in').textContent=kr(incoming); $('horizon-net').textContent=signed(incoming-out); drawHorizon(events,today,end,n(d.cost_summary?.liquid_non_savings)); $('horizon-note').textContent=`Dette er en kjent-forpliktelse-linje, ikke en komplett saldo-prognose. Vanlig forbruk og ukjent fremtidig lønn er ikke tatt med.`; $('horizon-events').innerHTML=events.map(x=>`<div class="event-row"><div class="event-date">${dateShort.format(parseDate(x.event_date))}</div><div><div class="row-title">${esc(x.name)}</div><div class="row-sub">${x.source==='planned'?'Planlagt':'Fast'}</div></div><div class="amount ${x.event_type==='income'?'income':'expense'}">${x.event_type==='income'?'+':'−'}${kr(x.amount)}</div></div>`).join('')||'<div class="row-sub">Ingen kjente hendelser i perioden.</div>'; }
function drawHorizon(events,start,end,startBalance){ const svg=$('horizon-chart'),W=1000,H=360,pad={l:30,r:25,t:26,b:34}; const sorted=[...events].sort((a,b)=>parseDate(a.event_date)-parseDate(b.event_date)); let balance=startBalance; const pts=[{date:start,balance}]; for(const e of sorted){balance+=e.event_type==='income'?n(e.amount):-n(e.amount); pts.push({date:parseDate(e.event_date),balance,event:e});} pts.push({date:end,balance}); const min=Math.min(...pts.map(p=>p.balance),0),max=Math.max(...pts.map(p=>p.balance),1),span=Math.max(max-min,1),days=Math.max(daysBetween(start,end),1); const x=d=>pad.l+(daysBetween(start,d)/days)*(W-pad.l-pad.r); const y=v=>pad.t+((max-v)/span)*(H-pad.t-pad.b); const path=pts.map((p,i)=>`${i?'L':'M'} ${x(p.date).toFixed(1)} ${y(p.balance).toFixed(1)}`).join(' '); const area=`${path} L ${x(end)} ${H-pad.b} L ${x(start)} ${H-pad.b} Z`; let html=`<line class="chart-grid" x1="${pad.l}" y1="${H-pad.b}" x2="${W-pad.r}" y2="${H-pad.b}"/><path class="chart-area" d="${area}"/><path class="chart-line" d="${path}"/>`; html+=pts.filter(p=>p.event).map(p=>`<circle class="chart-event ${p.event.event_type==='income'?'income':'expense'}" cx="${x(p.date)}" cy="${y(p.balance)}" r="5"><title>${esc(p.event.name)} ${kr(p.event.amount)}</title></circle>`).join(''); html+=`<text class="chart-label" x="${pad.l}" y="${H-8}">${dateShort.format(start)}</text><text class="chart-label" text-anchor="end" x="${W-pad.r}" y="${H-8}">${dateShort.format(end)}</text>`; svg.innerHTML=html; }

function renderPlans(){ const d=state.data,j=d.japan_plan??{},c=d.cost_summary??{}; $('japan-combined').textContent=kr(j.combined_monthly); $('japan-living').textContent=kr(j.living_budget_monthly); $('japan-fixed').textContent=kr(j.confirmed_fixed_monthly); const runway=n(j.combined_monthly)>0?n(c.liquid_non_savings)/n(j.combined_monthly):0; $('japan-runway').textContent=runway?`${runway.toFixed(1).replace('.',',')} mnd`:'—'; $('japan-budget-total').textContent=kr(c.next_budget_total); const items=d.next_budget??[],total=items.reduce((s,x)=>s+n(x.budget_amount),0)||1; $('japan-budget-list').innerHTML=items.slice().sort((a,b)=>n(b.budget_amount)-n(a.budget_amount)).map(x=>`<div class="budget-line"><div><div class="row-title">${esc(x.category)}</div><div class="row-sub">${Math.round(n(x.budget_amount)/total*100)} %</div></div><div class="budget-amount">${kr(x.budget_amount)}</div><div class="mini-track"><span style="width:${n(x.budget_amount)/total*100}%"></span></div></div>`).join('')||'<div class="row-sub">Ingen budsjett registrert.</div>'; }

function renderMoney(){ const d=state.data,o=d.overview??{},c=d.cost_summary??{}; $('total-balance').textContent=kr(o.total_balance); $('spending-total').textContent=kr(o.month_expenses); $('fixed-total').textContent=kr(c.fixed_monthly_total); renderAccounts(d.accounts??[]); renderSpending(d.spending_by_category??[],o.month_expenses); renderFixed(d.fixed_costs??[]); renderTransactions(d.recent_transactions??[]); }
function renderAccounts(items){ $('account-list').innerHTML=items.map(x=>`<div class="account-row"><div><div class="row-title">${esc(x.name)}</div><div class="row-sub">${x.include_in_safe_to_spend?'Tilgjengelig':'Holdes utenfor trygt å bruke'}</div></div><strong>${kr(x.current_balance,true)}</strong></div>`).join('')||'<div class="row-sub">Ingen kontoer.</div>'; }
function renderSpending(items,total){ const max=Math.max(...items.map(x=>n(x.spent)),1); $('spending-list').innerHTML=items.map(x=>`<div class="spending-row"><div class="spending-main"><div><div class="row-title">${esc(x.category)}</div><div class="row-sub">${x.transactions??0} kjøp · ${n(total)>0?Math.round(n(x.spent)/n(total)*100):0}%</div></div><strong>${kr(x.spent)}</strong></div><div class="category-bar"><span style="--width:${Math.max(n(x.spent)/max*100,2)}%"></span></div></div>`).join('')||'<div class="row-sub">Ingen utgifter.</div>'; }
function renderFixed(items){ $('fixed-cost-list').innerHTML=items.map(x=>{const due=parseDate(x.next_due_date)?dateShort.format(parseDate(x.next_due_date)):'Ukjent';return `<div class="subscription-row"><div><div class="row-title">${esc(x.name)}</div><div class="row-sub">${esc(x.category)} · ${cadenceLabel(x.cadence)}</div></div><strong>${kr(x.monthly_amount,true)}/mnd</strong><div class="year">${kr(n(x.monthly_amount)*12)}/år</div><div class="due">Neste ${due}</div></div>`}).join('')||'<div class="row-sub">Ingen bekreftede faste kostnader.</div>'; }
function renderTransactions(items){ const q=state.transactionFilter.trim().toLowerCase(); const filtered=q?items.filter(x=>[x.merchant,x.category,x.description,x.account].some(v=>String(v??'').toLowerCase().includes(q))):items; $('transaction-count').textContent=`${filtered.length} vist`; $('transaction-list').innerHTML=filtered.map(x=>`<div class="transaction-row"><div class="transaction-date">${dateShort.format(parseDate(x.transaction_date))}</div><div><div class="row-title">${esc(x.merchant||x.description||x.category||'Transaksjon')}</div><div class="row-sub">${esc(x.category||'Annet')} · ${esc(x.account||'')}</div></div><div class="amount ${x.transaction_type}">${x.transaction_type==='income'?'+':x.transaction_type==='expense'?'−':'↔ '}${kr(x.amount,true)}</div></div>`).join('')||'<div class="row-sub">Ingen treff.</div>'; }

function showWhy(){ const o=state.data.overview??{}; $('why-safe').textContent=kr(o.safe_to_spend); const rows=[['Tilgjengelig på brukskontoer',o.spendable_balance,'Kontoer markert som tilgjengelige'],['Kjent inn før lønn',o.upcoming_income_to_payday,'Bekreftet fremtidig inntekt'],['Kjente trekk før lønn',-n(o.upcoming_expenses_to_payday),'Faste + planlagte utgifter'],['Sparemål',-n(o.monthly_savings_target),'Månedlig mål'],['Buffer',-n(o.emergency_buffer_target),'Beskyttet minimum']]; $('derivation-list').innerHTML=rows.map(r=>`<div class="derivation-row"><div><span>${r[0]}</span><small>${r[2]}</small></div><strong>${signed(r[1])}</strong></div>`).join('')+`<div class="derivation-row total"><span>Trygt å bruke</span><strong>${kr(o.safe_to_spend)}</strong></div>`; $('why-sheet').classList.remove('hidden'); }
function hideWhy(){ $('why-sheet').classList.add('hidden'); }
function setView(v){ state.view=v; document.querySelectorAll('[data-view-panel]').forEach(el=>el.classList.toggle('active',el.dataset.viewPanel===v)); document.querySelectorAll('[data-view]').forEach(el=>el.classList.toggle('active',el.dataset.view===v)); renderHeader(); window.scrollTo({top:0,behavior:'smooth'}); }
function toggleTheme(){ const root=document.documentElement; const current=root.dataset.theme; const next=current==='dark'?'light':current==='light'?'dark':matchMedia('(prefers-color-scheme: dark)').matches?'light':'dark'; root.dataset.theme=next; localStorage.setItem('moneyos-theme',next); }

$('login-form').addEventListener('submit',async e=>{e.preventDefault();$('login-error').textContent='';const {response,body}=await request('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:$('password').value})});if(!response.ok){$('login-error').textContent=body?.error??'Feil passord';return;}$('password').value='';await loadDashboard();});
$('logout').addEventListener('click',async()=>{await request('/api/logout',{method:'POST'});location.reload();});
$('refresh').addEventListener('click',loadDashboard); $('safe-button').addEventListener('click',showWhy); $('why-button').addEventListener('click',showWhy); $('close-why').addEventListener('click',hideWhy); $('why-sheet').addEventListener('click',e=>{if(e.target===$('why-sheet'))hideWhy();}); $('theme-toggle').addEventListener('click',toggleTheme); $('money-search').addEventListener('input',e=>{state.transactionFilter=e.target.value;renderTransactions(state.data?.recent_transactions??[]);});
document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>setView(b.dataset.view))); document.querySelectorAll('[data-go]').forEach(b=>b.addEventListener('click',()=>setView(b.dataset.go))); document.querySelectorAll('.range').forEach(b=>b.addEventListener('click',()=>{state.horizonDays=Number(b.dataset.days);document.querySelectorAll('.range').forEach(x=>x.classList.toggle('active',x===b));renderHorizon();})); document.addEventListener('keydown',e=>{if(e.key==='Escape')hideWhy();if(e.key==='/'&&state.view==='money'&&document.activeElement?.tagName!=='INPUT'){e.preventDefault();$('money-search').focus();}});
const savedTheme=localStorage.getItem('moneyos-theme'); if(savedTheme)document.documentElement.dataset.theme=savedTheme;
loadDashboard();
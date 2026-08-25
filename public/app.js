const $ = (id) => document.getElementById(id);
const state = { data: null, view: 'today', horizonDays: 30 };
const money0 = new Intl.NumberFormat('nb-NO', { maximumFractionDigits: 0 });
const money2 = new Intl.NumberFormat('nb-NO', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const dateShort = new Intl.DateTimeFormat('nb-NO', { day: 'numeric', month: 'short' });
const dateFull = new Intl.DateTimeFormat('nb-NO', { day: 'numeric', month: 'long', year: 'numeric' });
const weekday = new Intl.DateTimeFormat('nb-NO', { weekday: 'long', day: 'numeric', month: 'long' });

function n(v){ return Number(v ?? 0); }
function kr(v, precise=false){ return `${(precise?money2:money0).format(n(v))} kr`; }
function signed(v){ const x=n(v); return `${x>0?'+':''}${kr(x)}`; }
function parseDate(v){ if(!v) return null; return new Date(`${String(v).slice(0,10)}T12:00:00`); }
function esc(v){ return String(v ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function daysBetween(a,b){ return Math.round((b-a)/86400000); }
function cls(v){ return n(v)<0?'negative':n(v)>0?'positive':''; }

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
  const d=state.data; const o=d.overview??{};
  const asOf=parseDate(o.as_of); const label=asOf?`System ${dateShort.format(asOf)}`:'';
  $('as-of').textContent=label; $('as-of-mobile').textContent=label;
  $('today-date').textContent=weekday.format(new Date()).toUpperCase();
  renderFreshness(d.data_freshness??{});
  renderToday(d); renderHorizon(d); renderPlans(d); renderMoney(d);
}

function renderFreshness(f){
  const dates=[parseDate(f.latest_transaction_date),parseDate(f.account_snapshot_date),parseDate(f.source_through)].filter(Boolean);
  const through=dates.sort((a,b)=>b-a)[0]??null; const age=through?daysBetween(through,new Date()):null;
  $('data-chip').textContent=through?`Data til ${dateShort.format(through)}`:'Siste data ukjent';
  const root=$('freshness-banner');
  if(age===null||age<=2){root.classList.add('hidden');return;}
  root.classList.remove('hidden'); root.innerHTML=`<strong>Saldoen er et snapshot</strong><span>Bankdata går til ${dateFull.format(through)}. Nyere kjøp er ikke med før neste import.</span>`;
}

function renderToday(d){
  const o=d.overview??{}, c=d.cost_summary??{}, fixed=d.fixed_costs??[], cats=d.spending_by_category??[];
  $('safe-to-spend').textContent=money0.format(n(o.safe_to_spend));
  $('safe-to-spend').className=`safe-number ${cls(o.safe_to_spend)}`;
  $('daily-safe').textContent=kr(o.daily_safe_to_spend);
  $('days-to-payday').textContent=`${o.days_to_payday??'—'} dager`;
  $('next-payday').textContent=parseDate(o.next_payday)?dateShort.format(parseDate(o.next_payday)):'Ikke satt';
  $('safe-caption').textContent=`Fra ${kr(o.spendable_balance)} på tilgjengelige kontoer, etter kjente forpliktelser frem til lønn.`;
  $('liquid-balance').textContent=kr(c.liquid_non_savings);
  $('committed-before-payday').textContent=kr(o.upcoming_expenses_to_payday);
  const beforePay=(d.upcoming??[]).filter(x=>parseDate(x.event_date)&&parseDate(o.next_payday)&&parseDate(x.event_date)<=parseDate(o.next_payday));
  $('committed-count').textContent=`${beforePay.length} kjente poster`;
  $('fixed-monthly').textContent=kr(c.fixed_monthly_total);
  $('fixed-caption').textContent=`${fixed.length} bekreftede trekk`;
  $('month-net').textContent=signed(o.month_net); $('month-net').className=cls(o.month_net);
  $('month-flow').textContent=`${kr(o.month_income)} inn · ${kr(o.month_expenses)} ut`;
  $('month-expenses').textContent=kr(o.month_expenses);
  $('safe-status').textContent=n(o.upcoming_expenses_to_payday)>0?'Etter kjente trekk':'Ingen kjente trekk';
  renderBrief(d); renderUpcoming(d.upcoming??[], 'upcoming-list', 5); renderMonthPace(d); renderWhy(d);
  $('top-spending').innerHTML=cats.slice(0,3).map(x=>`<div class="top-row"><span>${esc(x.category)}</span><strong>${kr(x.spent)}</strong></div>`).join('');
}

function renderBrief(d){
  const o=d.overview??{}, c=d.cost_summary??{}; const items=[];
  if(n(o.upcoming_expenses_to_payday)>0) items.push({t:'Før neste lønn',p:'Kjente trekk er allerede trukket fra safe-tallet.',v:kr(o.upcoming_expenses_to_payday)});
  if(n(c.typical_core_month)>0) items.push({t:'Normal personlig måned',p:'Median siste seks hele måneder, ekskl. bolig og delte utgifter.',v:kr(c.typical_core_month)});
  if(n(c.fixed_monthly_total)>0) items.push({t:'Fast baseline',p:'Bekreftede abonnementer og faste trekk.',v:kr(c.fixed_monthly_total)});
  const last=parseDate(d.data_freshness?.latest_transaction_date);
  if(last&&daysBetween(last,new Date())>2) items.push({t:'Data trenger oppdatering',p:`Siste bokførte transaksjon er ${dateShort.format(last)}.`,v:'Snapshot',warn:true});
  $('brief-list').innerHTML=items.slice(0,4).map(i=>`<div class="brief-row"><span class="brief-dot ${i.warn?'warn':''}"></span><div><strong>${i.t}</strong><p>${i.p}</p></div><span class="value">${i.v}</span></div>`).join('');
}

function renderMonthPace(d){
  const o=d.overview??{}, c=d.cost_summary??{}; const spent=n(o.month_expenses), typical=n(c.typical_core_month);
  const pct=typical>0?spent/typical*100:0;
  $('month-pace').innerHTML=`<div class="pace-main"><div><span>Bokført hittil</span><strong>${kr(spent)}</strong></div><span>${typical>0?`${Math.round(pct)}% av typisk personlig måned`:'Ingen referanse'}</span></div><div class="pace-track"><span style="width:${Math.min(100,Math.max(2,pct))}%"></span></div><div class="pace-caption">Typisk personlig måned er ${kr(typical)} og ekskluderer bolig og delte utgifter. August inneholder store engangskjøp, så dette er referanse — ikke et mål.</div>`;
}

function renderWhy(d){
  const o=d.overview??{}; const rows=[
    ['Tilgjengelig på brukskontoer', n(o.spendable_balance), 'Saldoer merket som tilgjengelige'],
    ['+ kjent inn før lønn', n(o.upcoming_income_to_payday), 'Kun registrert/planlagt inntekt'],
    ['− kjente trekk før lønn', -n(o.upcoming_expenses_to_payday), 'Faste og planlagte utgifter'],
    ['− månedlig sparemål', -n(o.monthly_savings_target), 'Finance-innstilling'],
    ['− beskyttet buffer', -n(o.emergency_buffer_target), 'Finance-innstilling']
  ];
  $('why-safe').textContent=kr(o.safe_to_spend);
  $('derivation-list').innerHTML=rows.map(([label,val,note])=>`<div class="derivation-row"><div><span>${label}</span><small>${note}</small></div><strong class="${cls(val)}">${signed(val)}</strong></div>`).join('')+`<div class="derivation-row total"><span>= Trygt å bruke</span><strong>${kr(o.safe_to_spend)}</strong></div>`;
}

function horizonEvents(d){ return (d.horizon_events??[]).map(e=>({...e,date:parseDate(e.event_date)})).filter(e=>e.date).sort((a,b)=>a.date-b.date); }
function renderHorizon(d){
  const days=state.horizonDays, now=new Date(); now.setHours(12,0,0,0); const end=new Date(now); end.setDate(end.getDate()+days);
  const ev=horizonEvents(d).filter(e=>e.date>=now&&e.date<=end);
  const out=ev.filter(e=>e.event_type==='expense').reduce((s,e)=>s+n(e.amount),0), incoming=ev.filter(e=>e.event_type==='income').reduce((s,e)=>s+n(e.amount),0);
  $('horizon-out').textContent=kr(out); $('horizon-in').textContent=kr(incoming); $('horizon-net').textContent=signed(incoming-out); $('horizon-net').className=cls(incoming-out);
  renderHorizonChart(d,ev,days); renderHorizonEvents(ev);
  $('horizon-note').innerHTML=`Startpunktet er siste kjente likvide saldo (${kr(d.cost_summary?.liquid_non_savings)}). Grafen trekker bare fra/legger til registrerte hendelser. Fremtidig Telia-lønn er <strong>ikke</strong> estimert fordi beløpet varierer.`;
}

function renderHorizonChart(d,ev,days){
  const svg=$('horizon-chart'), W=900,H=300,pad={l:54,r:22,t:24,b:38}; const now=new Date(); now.setHours(12,0,0,0); const start=n(d.cost_summary?.liquid_non_savings);
  const points=[{day:0,balance:start,event:null}]; let bal=start;
  ev.forEach(e=>{const day=Math.max(0,daysBetween(now,e.date)); bal+=e.event_type==='income'?n(e.amount):-n(e.amount); points.push({day,balance:bal,event:e});}); points.push({day:days,balance:bal,event:null});
  const vals=points.map(p=>p.balance).concat([0]); let min=Math.min(...vals),max=Math.max(...vals); if(max===min){max+=1;min-=1;} const margin=(max-min)*.12; min-=margin;max+=margin;
  const x=d=>pad.l+(d/days)*(W-pad.l-pad.r), y=v=>pad.t+(max-v)/(max-min)*(H-pad.t-pad.b);
  const path=points.map((p,i)=>`${i?'L':'M'} ${x(p.day).toFixed(1)} ${y(p.balance).toFixed(1)}`).join(' ');
  const area=`M ${x(points[0].day)} ${H-pad.b} `+points.map(p=>`L ${x(p.day).toFixed(1)} ${y(p.balance).toFixed(1)}`).join(' ')+` L ${x(points.at(-1).day)} ${H-pad.b} Z`;
  const grid=[0,.25,.5,.75,1].map(t=>{const v=max-(max-min)*t;return `<line class="chart-grid" x1="${pad.l}" x2="${W-pad.r}" y1="${y(v)}" y2="${y(v)}"/><text class="chart-label" x="4" y="${y(v)+3}">${money0.format(v)}</text>`}).join('');
  const zeros=(min<=0&&max>=0)?`<line class="chart-zero" x1="${pad.l}" x2="${W-pad.r}" y1="${y(0)}" y2="${y(0)}"/>`:'';
  const marks=points.filter(p=>p.event).map(p=>`<circle class="chart-event ${p.event.event_type}" cx="${x(p.day)}" cy="${y(p.balance)}" r="4"><title>${esc(p.event.name)}: ${kr(p.event.amount)}</title></circle>`).join('');
  const xlabels=[0,Math.round(days/2),days].map(day=>{const dt=new Date(now);dt.setDate(dt.getDate()+day);return `<text class="chart-label" x="${x(day)}" y="${H-12}" text-anchor="${day===0?'start':day===days?'end':'middle'}">${dateShort.format(dt)}</text>`}).join('');
  svg.innerHTML=`${grid}${zeros}<path class="chart-area" d="${area}"/><path class="chart-line" d="${path}"/>${marks}${xlabels}`;
}

function renderHorizonEvents(ev){
  const root=$('horizon-events'); if(!ev.length){root.innerHTML='<p class="muted">Ingen kjente hendelser i perioden.</p>';return;}
  root.innerHTML=ev.slice(0,18).map(e=>`<div class="event-row"><span class="event-date">${dateShort.format(e.date)}</span><div><div class="row-title">${esc(e.name)}</div><div class="row-sub">${e.source==='planned'?'Planlagt':'Fast trekk'}${e.projected?' · prognose':''}</div></div><strong class="amount ${e.event_type}">${e.event_type==='income'?'+':'−'}${kr(e.amount)}</strong></div>`).join('');
}

function renderPlans(d){
  const c=d.cost_summary??{}, p=d.japan_plan??{}; const combined=n(p.combined_monthly), liquid=n(c.liquid_non_savings);
  $('japan-combined').textContent=kr(combined); $('japan-living').textContent=kr(p.living_budget_monthly); $('japan-fixed').textContent=kr(p.confirmed_fixed_monthly); $('japan-runway').textContent=combined>0?`${(liquid/combined).toFixed(1).replace('.',',')} mnd`:'—'; $('japan-budget-total').textContent=kr(p.living_budget_monthly);
  const items=d.next_budget??[]; const total=items.reduce((s,x)=>s+n(x.budget_amount),0)||1;
  $('japan-budget-list').innerHTML=items.slice().sort((a,b)=>n(b.budget_amount)-n(a.budget_amount)).map(x=>`<div class="budget-line"><div><div class="row-title">${esc(x.category)}</div><div class="row-sub">${Math.round(n(x.budget_amount)/total*100)}% av levebudsjettet</div></div><div class="budget-amount">${kr(x.budget_amount)}</div><div class="mini-track"><span style="width:${n(x.budget_amount)/total*100}%"></span></div></div>`).join('');
}

function renderMoney(d){
  const o=d.overview??{}, c=d.cost_summary??{}; $('total-balance').textContent=kr(o.total_balance); $('spending-total').textContent=kr(o.month_expenses); $('fixed-total').textContent=kr(c.fixed_monthly_total);
  $('account-list').innerHTML=(d.accounts??[]).map(a=>`<div class="account-row"><div><div class="row-title">${esc(a.name)}</div><div class="row-sub">${a.include_in_safe_to_spend?'Tilgjengelig':'Beskyttet / utenfor safe'}</div></div><strong>${kr(a.current_balance)}</strong></div>`).join('');
  const cats=d.spending_by_category??[], max=Math.max(...cats.map(x=>n(x.spent)),1); $('spending-list').innerHTML=cats.map(x=>`<div class="spending-row"><div class="spending-main"><div><div class="row-title">${esc(x.category)}</div><div class="row-sub">${x.transactions??0} kjøp</div></div><strong>${kr(x.spent)}</strong></div><div class="category-bar"><span style="--width:${n(x.spent)/max*100}%"></span></div></div>`).join('');
  $('fixed-cost-list').innerHTML=(d.fixed_costs??[]).map(x=>`<div class="subscription-card"><div class="sub-top"><strong>${esc(x.name)}</strong><span class="monthly">${kr(x.monthly_amount)}</span></div><p>${esc(x.category)} · ${cadence(x.cadence)}${x.next_due_date?` · neste ${dateShort.format(parseDate(x.next_due_date))}`:''}</p><span class="year">${kr(n(x.monthly_amount)*12)} / år</span></div>`).join('');
  $('transaction-list').innerHTML=(d.recent_transactions??[]).map(t=>`<div class="transaction-row"><div><div class="row-title">${esc(t.merchant||t.description||'Transaksjon')}</div><div class="row-sub">${parseDate(t.transaction_date)?dateShort.format(parseDate(t.transaction_date)):''} · ${esc(t.category||'Uten kategori')}</div></div><strong class="amount ${t.transaction_type}">${t.transaction_type==='income'?'+':t.transaction_type==='expense'?'−':''}${kr(t.amount)}</strong></div>`).join('');
}
function cadence(v){return ({daily:'daglig',weekly:'ukentlig',biweekly:'annenhver uke',monthly:'månedlig',quarterly:'kvartalsvis',yearly:'årlig'})[v]||v||'fast';}
function renderUpcoming(items,id,limit){ const root=$(id), vis=items.slice(0,limit); root.innerHTML=vis.length?vis.map(x=>`<div class="timeline-row"><div class="timeline-date">${parseDate(x.event_date)?dateShort.format(parseDate(x.event_date)):'—'}</div><div><div class="row-title">${esc(x.name)}</div><div class="row-sub">${x.source==='planned'?'Planlagt':'Fast trekk'}</div></div><div class="amount ${x.event_type}">${x.event_type==='income'?'+':'−'}${kr(x.amount)}</div></div>`).join(''):'<p class="muted">Ingen kommende poster.</p>'; }

function switchView(view){ state.view=view; document.querySelectorAll('[data-view-panel]').forEach(el=>el.classList.toggle('active',el.dataset.viewPanel===view)); document.querySelectorAll('[data-view]').forEach(el=>el.classList.toggle('active',el.dataset.view===view)); window.scrollTo({top:0,behavior:'smooth'}); }
document.addEventListener('click',e=>{ const btn=e.target.closest('[data-view]'); if(btn) switchView(btn.dataset.view); const go=e.target.closest('[data-go]'); if(go) switchView(go.dataset.go); });
document.querySelectorAll('.range').forEach(btn=>btn.addEventListener('click',()=>{document.querySelectorAll('.range').forEach(b=>b.classList.remove('active'));btn.classList.add('active');state.horizonDays=n(btn.dataset.days);renderHorizon(state.data);}));
$('safe-button').addEventListener('click',()=>$('why-sheet').classList.remove('hidden')); $('why-button').addEventListener('click',()=>$('why-sheet').classList.remove('hidden')); $('close-why').addEventListener('click',()=>$('why-sheet').classList.add('hidden')); $('why-sheet').addEventListener('click',e=>{if(e.target===$('why-sheet'))$('why-sheet').classList.add('hidden')});
$('refresh').addEventListener('click',loadDashboard);
$('logout').addEventListener('click',async()=>{await request('/api/logout',{method:'POST'});location.reload();});
$('login-form').addEventListener('submit',async e=>{e.preventDefault();$('login-error').textContent='';const password=$('password').value;const {response,body}=await request('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password})});if(!response.ok){$('login-error').textContent=body?.error??'Feil passord';return;}$('password').value='';await loadDashboard();});
loadDashboard();

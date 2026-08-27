const $ = (id) => document.getElementById(id);
const state = { data: null, view: 'today', horizonDays: 30, transactionFilter: '', japanMode: null };
const money0 = new Intl.NumberFormat('nb-NO', { maximumFractionDigits: 0 });
const money2 = new Intl.NumberFormat('nb-NO', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const dateShort = new Intl.DateTimeFormat('nb-NO', { day: 'numeric', month: 'short' });
const dateFull = new Intl.DateTimeFormat('nb-NO', { day: 'numeric', month: 'long', year: 'numeric' });
const weekday = new Intl.DateTimeFormat('nb-NO', { weekday: 'long', day: 'numeric', month: 'long' });
const monthName = new Intl.DateTimeFormat('nb-NO', { month: 'long' });

function n(v){ return Number(v ?? 0); }
function kr(v, precise=false){ return `${(precise ? money2 : money0).format(n(v))} kr`; }
function yen(v){ return `¥${money0.format(n(v))}`; }
function signed(v){ const x=n(v); return `${x>0?'+':''}${kr(x)}`; }
function parseDate(v){ if(!v) return null; return new Date(`${String(v).slice(0,10)}T12:00:00`); }
function esc(v){ return String(v ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function daysBetween(a,b){ return Math.round((b-a)/86400000); }
function daysInclusive(a,b){ return Math.max(1, Math.floor((b-a)/86400000)+1); }
function cadenceLabel(v){ return ({daily:'Daglig',weekly:'Ukentlig',biweekly:'Annenhver uke',monthly:'Månedlig',quarterly:'Kvartalsvis',yearly:'Årlig'})[v] || v || 'Fast'; }
function initials(v){ const parts=String(v||'').trim().split(/\s+/).filter(Boolean); if(!parts.length) return '•'; return (parts.length===1?parts[0].slice(0,2):parts[0][0]+parts[parts.length-1][0]).toUpperCase(); }
function budgetMap(items){ return Object.fromEntries((items??[]).map(x=>[x.category,n(x.budget_amount)])); }
function remainingMap(items){ return Object.fromEntries((items??[]).map(x=>[x.category,n(x.remaining ?? x.budget_amount)])); }
function currentDataDate(){
  const f=state.data?.data_freshness??{};
  const dates=[parseDate(f.latest_transaction_date),parseDate(f.account_snapshot_date)].filter(Boolean);
  return dates.length ? dates.sort((a,b)=>a-b)[0] : null;
}

async function request(url, options={}){
  const response=await fetch(url,{credentials:'same-origin',...options});
  let body=null; try{body=await response.json();}catch{}
  return {response,body};
}

async function loadDashboard(){
  $('loading')?.classList.remove('hidden');
  const {response,body}=await request('/api/dashboard');
  $('loading')?.classList.add('hidden');
  if(response.status===401){ $('app')?.classList.add('hidden'); $('login')?.classList.remove('hidden'); return; }
  if(!response.ok||!body){ alert(body?.error ?? 'Kunne ikke hente økonomidata'); return; }
  state.data=body;
  $('login')?.classList.add('hidden'); $('app')?.classList.remove('hidden');
  renderAll();
}

function renderAll(){ renderFreshness(); renderHome(); renderHorizon(); renderJapan(); renderMoney(); }

function renderFreshness(){
  const freshDate=currentDataDate();
  const o=state.data?.overview??{};
  const text=freshDate?`Bankdata til ${dateShort.format(freshDate)}`:`System ${dateShort.format(parseDate(o.as_of)||new Date())}`;
  if($('sync-chip')) $('sync-chip').textContent=text;
  if($('sync-chip-mobile')) $('sync-chip-mobile').textContent=freshDate?dateShort.format(freshDate):'Live';
  const age=freshDate?daysBetween(freshDate,new Date()):0;
  if($('freshness-banner')){
    if(age>2){
      $('freshness-banner').classList.remove('hidden');
      $('freshness-banner').textContent=`Bankdata er ${age} dager gammel. Nye kjøp etter ${dateFull.format(freshDate)} er ikke med ennå.`;
    } else $('freshness-banner').classList.add('hidden');
  }
}

function renderHome(){
  const d=state.data,o=d.overview??{};
  $('today-date').textContent=weekday.format(new Date());
  $('safe-to-spend').textContent=money0.format(n(o.safe_to_spend));
  const payday=parseDate(o.next_payday);
  const bills=n(o.upcoming_expenses_to_payday);
  $('safe-caption').textContent=bills>0
    ? `${kr(bills)} i kjente regninger fram til ${payday?dateShort.format(payday):'neste lønn'} er allerede satt til side.`
    : 'Ingen kjente regninger før neste lønn er trukket fra dette beløpet.';
  $('daily-safe').textContent=`${kr(o.daily_safe_to_spend)} / dag`;
  $('next-payday').textContent=payday?`${dateShort.format(payday)} · ${o.days_to_payday ?? '—'} dager`:'Ikke satt';
  renderUpcoming((d.upcoming??[]).slice(0,3));
  $('upcoming-summary').textContent=bills>0?`Totalt ${kr(bills)} i kjente regninger før neste lønn.`:'Ingen kjente regninger før neste lønn.';
  renderMonthMeaning(d,o);
  renderAttention(d);
  renderJapanHome(d);
}

function renderUpcoming(items){
  $('upcoming-list').innerHTML=items.map(x=>`<div class="meaning-row"><div class="meaning-date">${dateShort.format(parseDate(x.event_date))}</div><div><strong>${esc(x.name)}</strong><span>${x.source==='planned'?'Planlagt':'Fast trekk'}</span></div><b class="${x.event_type==='income'?'positive':'negative'}">${x.event_type==='income'?'+':'−'}${kr(x.amount)}</b></div>`).join('') || '<div class="empty-meaning">Ingen kjente trekk.</div>';
}

function renderMonthMeaning(d,o){
  const total=n(o.month_expenses), categories=(d.spending_by_category??[]).slice().sort((a,b)=>n(b.spent)-n(a.spent));
  const asOf=parseDate(o.as_of)||new Date();
  $('month-title').textContent=`${monthName.format(asOf)} så langt`;
  $('month-expenses').textContent=`${kr(total)} brukt`;
  const top=categories.slice(0,2), topTotal=top.reduce((s,x)=>s+n(x.spent),0), pct=total>0?Math.round(topTotal/total*100):0;
  if(top.length===2) $('month-story').textContent=`${top[0].category} og ${top[1].category} står for ${pct}% av alt som er bokført denne måneden.`;
  else $('month-story').textContent='Her ser du hva som forklarer månedens forbruk.';
  $('month-breakdown').innerHTML=top.map(x=>`<div class="meaning-row"><div class="meaning-share">${Math.round(n(x.spent)/Math.max(total,1)*100)}%</div><div><strong>${esc(x.category)}</strong><span>av månedens utgifter</span></div><b>${kr(x.spent)}</b></div>`).join('');
}

function renderAttention(d){
  const items=[];
  const tx=d.recent_transactions??[];
  const unknownPending=tx.filter(x=>x.transaction_type==='expense' && x.is_pending && !x.merchant && n(x.amount)>=1000).sort((a,b)=>n(b.amount)-n(a.amount))[0];
  if(unknownPending){
    items.push({tone:'warn',title:`Ukjent reservert betaling på ${kr(unknownPending.amount)}`,copy:'Banken har ikke gitt MoneyOS et tydelig merchant-navn ennå. Vent til den bokføres før du kategoriserer den.'});
  }
  const fresh=currentDataDate();
  const age=fresh?daysBetween(fresh,new Date()):0;
  if(age>2) items.push({tone:'warn',title:`Bankdata er ${age} dager gammel`,copy:`Kjøp etter ${dateFull.format(fresh)} er ikke med i oversikten.`});
  const reviews=d.review_candidates??[];
  if(reviews.length) items.push({tone:'neutral',title:`${reviews.length} faste trekk trenger fortsatt bekreftelse`,copy:`${reviews.map(x=>x.name).join(', ')} er ikke behandlet som sikre fremtidige kostnader.`});
  if(!items.length) items.push({tone:'ok',title:'Ingenting krever handling nå',copy:'MoneyOS ser ingen ukjente store poster eller gammel bankdata akkurat nå.'});
  $('attention-list').innerHTML=items.slice(0,3).map(x=>`<div class="attention-item ${x.tone}"><span class="attention-dot"></span><div><strong>${esc(x.title)}</strong><p>${esc(x.copy)}</p></div></div>`).join('');
}

function renderJapanHome(d){
  const j=d.japan_plan??{};
  const arrival=parseDate(j.arrival_date);
  const today=new Date();
  const before=arrival && today < arrival;
  const dormStart=n(j.deposit_jpy)+n(j.move_in_fee_jpy)+n(j.dorm_monthly_jpy);
  if(before){
    const days=Math.max(0,daysBetween(today,arrival));
    $('japan-home-title').textContent=`${days} dager til Japan`;
    $('japan-home-copy').textContent=`Kjente dorm-kostnader ved oppstart: ${yen(dormStart)} · månedsplan ${kr(j.living_budget_monthly)}.`;
  }else{
    $('japan-home-title').textContent='Japan-modus er aktiv';
    $('japan-home-copy').textContent='Se hva som er igjen denne måneden og hva det tilsvarer per dag.';
  }
}

function renderHorizon(){
  const d=state.data,o=d.overview??{},all=d.horizon_events??d.upcoming??[];
  const today=parseDate(o.as_of)||new Date();
  const end=new Date(today); end.setDate(end.getDate()+state.horizonDays);
  const events=all.filter(x=>{const dt=parseDate(x.event_date); return dt&&dt>=today&&dt<=end;});
  const out=events.filter(x=>x.event_type!=='income').reduce((s,x)=>s+n(x.amount),0);
  const incoming=events.filter(x=>x.event_type==='income').reduce((s,x)=>s+n(x.amount),0);
  if($('horizon-out')) $('horizon-out').textContent=kr(out);
  if($('horizon-in')) $('horizon-in').textContent=kr(incoming);
  if($('horizon-net')) $('horizon-net').textContent=signed(incoming-out);
  const period=state.horizonDays===30?'neste 30 dager':`neste ${state.horizonDays} dager`;
  $('horizon-summary').textContent=incoming>0
    ? `Vi kjenner ${kr(out)} i regninger og ${kr(incoming)} som kommer inn de ${period}.`
    : `Vi kjenner ${kr(out)} i regninger de ${period}. Ingen fremtidig inntekt med kjent beløp er lagt inn.`;
  $('horizon-note').textContent='Dette er en kalender over kjente beløp, ikke en prognose for vanlig hverdagsforbruk eller ukjent lønn.';
  $('horizon-events').innerHTML=events.map(x=>`<div class="meaning-row future-row"><div class="meaning-date">${dateShort.format(parseDate(x.event_date))}</div><div><strong>${esc(x.name)}</strong><span>${x.source==='planned'?'Planlagt':'Fast trekk'}</span></div><b class="${x.event_type==='income'?'positive':'negative'}">${x.event_type==='income'?'+':'−'}${kr(x.amount)}</b></div>`).join('') || '<div class="empty-meaning">Ingen kjente hendelser i perioden.</div>';
}

function groupedBudget(items, field='budget_amount'){
  const m=Object.fromEntries((items??[]).map(x=>[x.category,n(x[field] ?? x.budget_amount)]));
  return [
    {name:'Bolig',amount:n(m['Bolig']),note:'Global House / bolig'},
    {name:'Mat',amount:n(m['Dagligvarer'])+n(m['Restaurant og takeaway']),note:'Dagligvarer + restaurant'},
    {name:'Transport',amount:n(m['Transport']),note:'Lokal transport'},
    {name:'Shopping og fritid',amount:n(m['Shopping'])+n(m['Fritid og gaming']),note:'Fleksibelt forbruk'},
    {name:'Annet',amount:n(m['Mobil og internett'])+n(m['Utdanning'])+n(m['Helse'])+n(m['Bank og gebyrer'])+n(m['Annet']),note:'Mobil, helse, skole og småposter'}
  ].filter(x=>x.amount>0);
}

function renderJapan(){
  const d=state.data,j=d.japan_plan??{},c=d.cost_summary??{},o=d.overview??{},items=d.next_budget??[];
  const arrival=parseDate(j.arrival_date), today=new Date();
  const automaticMode=arrival && today>=arrival?'live':'pre';
  if(!state.japanMode) state.japanMode=automaticMode;
  $('japan-total-funds').textContent=kr(o.total_balance);
  $('plan-living').textContent=`${kr(j.living_budget_monthly||c.next_budget_total)} / mnd`;
  $('japan-fixed').textContent=`${kr(j.confirmed_fixed_monthly)} / mnd`;

  const total=n(j.living_budget_monthly)||n(c.next_budget_total);
  const bmap=budgetMap(items), housing=n(bmap['Bolig']), afterHousing=Math.max(0,total-housing);
  $('plan-after-housing').textContent=kr(afterHousing);
  $('plan-daily').textContent=`${kr(afterHousing/30)} / dag`;
  $('japan-budget-list').innerHTML=groupedBudget(items).map(x=>`<div class="meaning-row"><div class="meaning-icon"></div><div><strong>${esc(x.name)}</strong><span>${esc(x.note)}</span></div><b>${kr(x.amount)}</b></div>`).join('');

  const deposit=n(j.deposit_jpy), fee=n(j.move_in_fee_jpy), dorm=n(j.dorm_monthly_jpy), startup=deposit+fee+dorm;
  $('japan-startup-total').textContent=yen(startup);
  $('japan-startup-list').innerHTML=[
    ['Depositum',deposit,'Likviditetsbehov; brukes mot siste dormmåned hvis alt er oppgjort'],
    ['Innflyttingsavgift',fee,'Engangsbeløp'],
    ['Månedlig dormavgift',dorm,'Strøm, vann, internett og sengetøy inkludert']
  ].map(x=>`<div class="meaning-row"><div class="meaning-icon"></div><div><strong>${esc(x[0])}</strong><span>${esc(x[2])}</span></div><b>${yen(x[1])}</b></div>`).join('');

  renderJapanLive(items, arrival);
  setJapanMode(state.japanMode, false);
}

function renderJapanLive(items, arrival){
  const today=new Date();
  const first=items[0]??{};
  const start=parseDate(first.period_start), end=parseDate(first.period_end);
  let daysLeft=30;
  if(start&&end){
    const effective=today<start?start:today;
    daysLeft=daysInclusive(effective,end);
  }
  const groups=groupedBudget(items,'remaining');
  const remainingTotal=groups.reduce((s,x)=>s+x.amount,0);
  const housing=groups.find(x=>x.name==='Bolig')?.amount??0;
  const flexible=Math.max(0,remainingTotal-housing);
  const daily=flexible/Math.max(daysLeft,1);
  $('japan-live-daily').textContent=kr(daily);
  $('japan-live-month').textContent=kr(remainingTotal);
  $('japan-live-days').textContent=`${daysLeft} dager`;
  const before=arrival&&today<arrival;
  $('japan-live-story').textContent=before
    ? 'Dette er en forhåndsvisning basert på september-planen. Etter ankomst oppdateres «brukt» og «igjen» fra bokførte kjøp.'
    : 'Dette er beløpet som er igjen i budsjettkategoriene, basert på bokførte kjøp.';
  $('japan-live-budget-list').innerHTML=groups.map(x=>`<div class="meaning-row"><div class="meaning-icon"></div><div><strong>${esc(x.name)}</strong><span>${esc(x.note)}</span></div><b>${kr(x.amount)} igjen</b></div>`).join('') || '<div class="empty-meaning">Ingen Japan-budsjettdata ennå.</div>';
  $('japan-live-note').textContent='Bolig holdes utenfor dagsbeløpet. Interne overføringer skal ikke regnes som forbruk.';
}

function setJapanMode(mode, scroll=true){
  state.japanMode=mode;
  document.querySelectorAll('.japan-mode').forEach(b=>b.classList.toggle('active',b.dataset.japanMode===mode));
  $('japan-pre')?.classList.toggle('hidden',mode!=='pre');
  $('japan-live')?.classList.toggle('hidden',mode!=='live');
  const j=state.data?.japan_plan??{};
  const arrival=parseDate(j.arrival_date), today=new Date();
  if(mode==='pre'){
    const days=arrival?Math.max(0,daysBetween(today,arrival)):null;
    $('japan-phase-kicker').textContent='FØR AVREISE';
    $('japan-phase-title').textContent=days===null?'Gjør oppstarten forutsigbar':days>0?`${days} dager til ankomst`:'Ankomstdagen er her';
    $('japan-phase-copy').textContent='Her skiller MoneyOS mellom penger du har, kjente oppstartskostnader i yen og det månedlige levebudsjettet.';
  }else{
    $('japan-phase-kicker').textContent='I JAPAN';
    $('japan-phase-title').textContent='Hva kan du bruke nå?';
    $('japan-phase-copy').textContent=arrival&&today<arrival?'Forhåndsvisning av den daglige Japan-visningen.':'Budsjettet vises som penger igjen og omtrent hvor mye det tilsvarer per dag.';
  }
  if(scroll) document.querySelector('.japan-answer')?.scrollIntoView({behavior:'smooth',block:'start'});
}

function renderMoney(){
  const d=state.data,o=d.overview??{},c=d.cost_summary??{};
  $('total-balance').textContent=kr(o.total_balance);
  $('spending-total').textContent=kr(o.month_expenses);
  $('fixed-total').textContent=`${kr(c.fixed_monthly_total)} / mnd`;
  renderAccounts(d.accounts??[]); renderFixed(d.fixed_costs??[]); renderTransactions(d.recent_transactions??[]);
}

function renderAccounts(items){
  $('account-list').innerHTML=items.map(x=>`<div class="account-row"><div><div class="row-title">${esc(x.name)}</div><div class="row-sub">${x.include_in_safe_to_spend?'Kan brukes nå':'Holdes utenfor daglig forbruk'}</div></div><strong>${kr(x.current_balance,true)}</strong></div>`).join('') || '<div class="row-sub">Ingen kontoer.</div>';
}

function renderFixed(items){
  $('fixed-cost-list').innerHTML=items.slice(0,7).map(x=>{const due=parseDate(x.next_due_date)?dateShort.format(parseDate(x.next_due_date)):'Ukjent'; return `<div class="subscription-row"><div><div class="row-title">${esc(x.name)}</div><div class="row-sub">${esc(x.category)} · ${cadenceLabel(x.cadence)}</div></div><strong>${kr(x.monthly_amount,true)}</strong><div class="year">${kr(n(x.monthly_amount)*12)}/år · neste ${due}</div></div>`}).join('') || '<div class="row-sub">Ingen bekreftede faste kostnader.</div>';
}

function renderTransactions(items){
  const q=state.transactionFilter.trim().toLowerCase();
  const filtered=q?items.filter(x=>[x.merchant,x.category,x.description,x.account].some(v=>String(v??'').toLowerCase().includes(q))):items;
  $('transaction-count').textContent=`${filtered.length} vist`;
  $('transaction-list').innerHTML=filtered.map(x=>{const label=x.merchant||x.description||x.category||'Transaksjon'; return `<div class="transaction-row"><div class="transaction-date">${dateShort.format(parseDate(x.transaction_date))}</div><div class="merchant-mark">${esc(initials(label))}</div><div><div class="row-title">${esc(label)}</div><div class="row-sub">${esc(x.category||'Annet')} · ${esc(x.account||'')}</div></div><div class="amount ${x.transaction_type}">${x.transaction_type==='income'?'+':x.transaction_type==='expense'?'−':'↔ '}${kr(x.amount,true)}</div></div>`}).join('') || '<div class="row-sub">Ingen treff.</div>';
}

function showWhy(){
  const o=state.data.overview??{};
  $('why-safe').textContent=kr(o.safe_to_spend);
  const rows=[['Penger på kontoer du kan bruke',o.spendable_balance,'Startpunkt'],['Bekreftet inn før lønn',o.upcoming_income_to_payday,'Bare hvis beløpet er kjent'],['Regninger før lønn',-n(o.upcoming_expenses_to_payday),'Settes av først'],['Sparemål',-n(o.monthly_savings_target),'Beskyttes'],['Buffer',-n(o.emergency_buffer_target),'Beskyttes']];
  $('derivation-list').innerHTML=rows.map(r=>`<div class="derivation-row"><div><span>${r[0]}</span><small>${r[2]}</small></div><strong>${signed(r[1])}</strong></div>`).join('');
  $('why-sheet').classList.remove('hidden');
}
function hideWhy(){ $('why-sheet').classList.add('hidden'); }

function setView(v){
  state.view=v;
  document.querySelectorAll('[data-view-panel]').forEach(el=>el.classList.toggle('active',el.dataset.viewPanel===v));
  document.querySelectorAll('[data-view]').forEach(el=>el.classList.toggle('active',el.dataset.view===v));
  window.scrollTo({top:0,behavior:'instant'});
}

$('login-form')?.addEventListener('submit',async e=>{e.preventDefault(); $('login-error').textContent=''; const {response,body}=await request('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:$('password').value})}); if(!response.ok){$('login-error').textContent=body?.error??'Feil passord';return;} $('password').value=''; await loadDashboard();});
$('logout')?.addEventListener('click',async()=>{await request('/api/logout',{method:'POST'});location.reload();});
$('refresh')?.addEventListener('click',loadDashboard);
$('safe-button')?.addEventListener('click',showWhy); $('why-button')?.addEventListener('click',showWhy); $('close-why')?.addEventListener('click',hideWhy);
$('why-sheet')?.addEventListener('click',e=>{if(e.target===$('why-sheet'))hideWhy();});
$('money-search')?.addEventListener('input',e=>{state.transactionFilter=e.target.value;renderTransactions(state.data?.recent_transactions??[]);});
document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>setView(b.dataset.view)));
document.querySelectorAll('[data-go]').forEach(b=>b.addEventListener('click',()=>setView(b.dataset.go)));
document.querySelectorAll('.range').forEach(b=>b.addEventListener('click',()=>{state.horizonDays=Number(b.dataset.days);document.querySelectorAll('.range').forEach(x=>x.classList.toggle('active',x===b));renderHorizon();}));
document.querySelectorAll('.japan-mode').forEach(b=>b.addEventListener('click',()=>setJapanMode(b.dataset.japanMode)));
document.addEventListener('keydown',e=>{if(e.key==='Escape')hideWhy();if(e.key==='/'&&state.view==='money'&&document.activeElement?.tagName!=='INPUT'){e.preventDefault();$('money-search')?.focus();}});

loadDashboard();

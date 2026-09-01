const tbMoney = new Intl.NumberFormat('nb-NO', { maximumFractionDigits: 0 });
const tbDate = new Intl.DateTimeFormat('nb-NO', { day: 'numeric', month: 'short' });
let tbTrips = [];
let tbDashboard = null;
let tbEditing = null;
let tbLoading = false;
const tbLabels={transport:'Transport',stay:'Overnatting',food:'Mat',activities:'Aktiviteter',other:'Shopping / annet'};

function tbYen(v){ return `¥${tbMoney.format(Number(v||0))}`; }
function tbKr(v){ return `${tbMoney.format(Number(v||0))} kr`; }
function tbEsc(v){ return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function tbParse(v){ return v?new Date(`${String(v).slice(0,10)}T12:00:00`):null; }
function tbTotal(trip){ return Object.values(trip?.budgets??{}).reduce((s,v)=>s+Number(v||0),0); }
function tbDays(trip){ const a=tbParse(trip.start_date),b=tbParse(trip.end_date); return a&&b?Math.max(1,Math.round((b-a)/86400000)+1):0; }
function tbMonthKey(d){ return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; }
function tbMonthDate(key){ const [y,m]=String(key).split('-').map(Number); return new Date(y,m-1,1,12,0,0); }
function tbMonthDiff(a,b){ return (b.getFullYear()-a.getFullYear())*12+(b.getMonth()-a.getMonth()); }
function tbMonths(cfg){ const start=tbParse(cfg?.period_start),end=tbParse(cfg?.period_end);if(!start||!end)return[];const out=[];let d=new Date(start.getFullYear(),start.getMonth(),1,12);while(d<=end){out.push(tbMonthKey(d));d=new Date(d.getFullYear(),d.getMonth()+1,1,12);}return out; }
function tbRecurringForMonth(items,key){ const target=tbMonthDate(key);return(items??[]).filter(item=>{const due=tbParse(item.next_due_date);if(!due)return false;const diff=tbMonthDiff(new Date(due.getFullYear(),due.getMonth(),1,12),target);if(diff<0)return false;if(item.cadence==='monthly')return true;if(item.cadence==='quarterly')return diff%3===0;if(item.cadence==='yearly')return diff%12===0;return false;}).reduce((s,x)=>s+Number(x.amount||0),0); }
function tbOneTimeNok(j,rate){return(Array.isArray(j?.one_time_costs)?j.one_time_costs:[]).filter(x=>['budget','confirmed'].includes(x?.status)).reduce((s,x)=>s+Number(x.amount||0)*(x.currency==='JPY'?rate:1),0)}
function tbBaseRemaining(d){
  const j=d?.japan_plan??{},cfg=j.budget??{},rate=Number(cfg.planning_rate?.jpy_nok||0),cats=cfg.living_categories??[];
  if(!rate||!cats.length)return null;
  const living=cats.reduce((s,x)=>s+Number(x.amount_jpy||0),0),dorm=Number(cfg.known_jpy?.dorm_monthly||j.dorm_monthly_jpy||0),entrance=Number(cfg.known_jpy?.entrance_fee||j.move_in_fee_jpy||0),deposit=Number(cfg.known_jpy?.deposit||j.deposit_jpy||0),months=tbMonths(cfg);
  const japanCash=months.reduce((s,key,i)=>s+living+(i===months.length-1?0:dorm)+(i===0?entrance+deposit:0),0);
  const recurring=months.reduce((s,key)=>s+tbRecurringForMonth(d.fixed_costs,key),0);
  const arrival=tbParse(j.arrival_date);const beforeArrival=(d.upcoming??[]).filter(x=>x.event_type!=='income'&&arrival&&tbParse(x.event_date)&&tbParse(x.event_date)<arrival).reduce((s,x)=>s+Number(x.amount||0),0);
  return Number(d.cost_summary?.liquid_non_savings||0)-beforeArrival-japanCash*rate-recurring-tbOneTimeNok(j,rate);
}
function tbApplyBuffer(){
  if(!tbDashboard)return;
  const included=tbTrips.filter(x=>x.include_in_plan!==false),reserved=included.reduce((s,x)=>s+tbTotal(x),0),rate=Number(tbDashboard.japan_plan?.budget?.planning_rate?.jpy_nok||0),base=tbBaseRemaining(tbDashboard);
  if(base===null||!rate)return;
  const adjusted=base-reserved*rate;
  const value=document.getElementById('jb-remaining'),copy=document.getElementById('jb-remaining-copy');
  if(value)value.textContent=tbKr(adjusted);
  if(copy)copy.textContent=`Konservativ rest etter hele prisede baseplanen${reserved?`, ${tbYen(reserved)} reservert til egne turer`:''} og norske faste trekk. Ingen framtidig lønn er antatt, og poster uten kjent pris er fortsatt ikke trukket fra.`;
}

function tbEnsure(){
  const root=document.getElementById('japan-budget-v2');
  if(!root || document.getElementById('trip-budgets')) return !!root;
  const section=document.createElement('section');
  section.id='trip-budgets'; section.className='tb-section';
  section.innerHTML=`
    <div class="tb-head"><div><p class="panel-kicker">TURER UTENFOR HVERDAGSBUDSJETTET</p><h2>Egne turbudsjetter</h2><p>Hotell, tog og aktiviteter på en tur holdes separat fra vanlig mat og shopping.</p></div><button id="tb-new" type="button">+ Ny tur</button></div>
    <div id="tb-summary" class="tb-summary"></div>
    <div id="tb-list" class="tb-list"></div>`;
  const method=root.querySelector('.jb-method');
  if(method) method.insertAdjacentElement('beforebegin',section); else root.appendChild(section);
  document.getElementById('tb-new')?.addEventListener('click',()=>tbOpenEdit());
  tbEnsureModal(); tbEnsureDetail(); return true;
}
function tbEnsureModal(){
  if(document.getElementById('tb-backdrop')) return;
  const el=document.createElement('div'); el.id='tb-backdrop'; el.className='tb-backdrop hidden';
  el.innerHTML=`<section class="tb-modal" role="dialog" aria-modal="true"><div class="tb-modal-head"><div><p class="panel-kicker">TURBUDSJETT</p><h2 id="tb-modal-title">Ny tur</h2></div><button id="tb-close" type="button">Lukk</button></div>
    <form id="tb-form">
      <label>Navn<input id="tb-name" maxlength="80" placeholder="F.eks. Tokyo-helg" required></label>
      <div class="tb-dates"><label>Fra<input id="tb-start" type="date" required></label><label>Til<input id="tb-end" type="date" required></label></div>
      <div class="tb-budget-grid">
        <label>Transport <span>¥</span><input id="tb-transport" type="number" min="0" step="100"></label>
        <label>Overnatting <span>¥</span><input id="tb-stay" type="number" min="0" step="100"></label>
        <label>Mat <span>¥</span><input id="tb-food" type="number" min="0" step="100"></label>
        <label>Aktiviteter <span>¥</span><input id="tb-activities" type="number" min="0" step="100"></label>
        <label>Shopping / annet <span>¥</span><input id="tb-other" type="number" min="0" step="100"></label>
      </div>
      <label class="tb-check"><input id="tb-include" type="checkbox" checked><span><strong>Reserver i Japan-planen</strong><small>Trekk turbudsjettet fra den konservative sluttbufferen.</small></span></label>
      <div class="tb-live-total"><span>Totalt budsjett</span><strong id="tb-form-total">¥0</strong></div>
      <div class="tb-actions"><button id="tb-delete" class="danger hidden" type="button">Slett tur</button><span></span><button id="tb-cancel" type="button">Avbryt</button><button type="submit">Lagre</button></div>
      <p id="tb-error"></p>
    </form></section>`;
  document.body.appendChild(el);
  ['tb-close','tb-cancel'].forEach(id=>document.getElementById(id)?.addEventListener('click',tbCloseEdit));
  el.addEventListener('click',e=>{if(e.target===el)tbCloseEdit();});
  document.getElementById('tb-form')?.addEventListener('submit',tbSave);
  document.getElementById('tb-delete')?.addEventListener('click',tbDelete);
  ['tb-transport','tb-stay','tb-food','tb-activities','tb-other'].forEach(id=>document.getElementById(id)?.addEventListener('input',tbFormTotal));
}
function tbEnsureDetail(){
  if(document.getElementById('tb-detail-backdrop'))return;
  const el=document.createElement('div');el.id='tb-detail-backdrop';el.className='tb-backdrop hidden';
  el.innerHTML=`<section class="tb-modal tb-detail"><div class="tb-modal-head"><div><p class="panel-kicker">TURREGNSKAP</p><h2 id="tb-detail-title">—</h2><p id="tb-detail-dates">—</p></div><button id="tb-detail-close" type="button">Lukk</button></div><div id="tb-detail-body"></div><div class="tb-detail-actions"><button id="tb-detail-edit" type="button">Rediger budsjett</button></div></section>`;
  document.body.appendChild(el);
  document.getElementById('tb-detail-close')?.addEventListener('click',tbCloseDetail);
  el.addEventListener('click',e=>{if(e.target===el)tbCloseDetail();});
}
function tbFormTotal(){ const ids=['transport','stay','food','activities','other']; const total=ids.reduce((s,k)=>s+Number(document.getElementById(`tb-${k}`)?.value||0),0); document.getElementById('tb-form-total').textContent=tbYen(total); }

function tbRender(){
  const list=document.getElementById('tb-list'), summary=document.getElementById('tb-summary'); if(!list||!summary)return;
  const included=tbTrips.filter(x=>x.include_in_plan!==false); const reserved=included.reduce((s,x)=>s+tbTotal(x),0);
  summary.innerHTML=tbTrips.length?`<div><span>${tbTrips.length} tur${tbTrips.length===1?'':'er'}</span><strong>${tbYen(reserved)}</strong><small>reservert utenfor vanlig månedsbudsjett</small></div>`:'<p>Ingen turer er satt opp ennå.</p>';
  list.innerHTML=tbTrips.map(trip=>{
    const total=Number(trip.budget_total_jpy??tbTotal(trip)),used=Number(trip.actual_total_jpy||0),remaining=total-used,days=tbDays(trip),pct=total>0?Math.min(100,used/total*100):0;
    return `<button class="tb-card" data-trip="${tbEsc(trip.id)}" type="button">
      <div class="tb-card-top"><div><span>${tbDate.format(tbParse(trip.start_date))} – ${tbDate.format(tbParse(trip.end_date))}</span><h3>${tbEsc(trip.name)}</h3></div><strong>${tbYen(total)}</strong></div>
      <div class="tb-actual"><div><span>Brukt</span><strong>${tbYen(used)}</strong></div><div><span>Igjen</span><strong class="${remaining<0?'over':''}">${tbYen(remaining)}</strong></div></div>
      <div class="tb-progress"><span style="width:${pct.toFixed(1)}%"></span></div>
      <div class="tb-card-meta"><span>${days} dager</span><span>${tbYen(days?total/days:0)} / dag</span><span>${trip.include_in_plan===false?'Ikke reservert':'Reservert i planen'}</span></div>
    </button>`;
  }).join('');
  list.querySelectorAll('[data-trip]').forEach(b=>b.addEventListener('click',()=>tbOpenDetail(b.dataset.trip)));
  setTimeout(tbApplyBuffer,120);
}
function tbOpenDetail(id){
  const trip=tbTrips.find(x=>String(x.id)===String(id));if(!trip)return;
  document.getElementById('tb-detail-title').textContent=trip.name;
  document.getElementById('tb-detail-dates').textContent=`${tbDate.format(tbParse(trip.start_date))} – ${tbDate.format(tbParse(trip.end_date))}`;
  const total=Number(trip.budget_total_jpy??tbTotal(trip)),used=Number(trip.actual_total_jpy||0),remaining=total-used;
  const rows=Object.keys(tbLabels).map(key=>{const budget=Number(trip.budgets?.[key]||0),actual=Number(trip.actuals?.[key]||0),left=budget-actual;return `<div class="tb-detail-row"><div><strong>${tbLabels[key]}</strong><span>${tbYen(actual)} brukt av ${tbYen(budget)}</span></div><b class="${left<0?'over':''}">${tbYen(left)} igjen</b></div>`}).join('');
  const tx=(trip.transactions??[]).map(x=>`<button class="tb-tx" data-tb-tx="${tbEsc(x.id)}" type="button"><div><strong>${tbEsc(x.merchant||x.description||'Transaksjon')}</strong><span>${tbDate.format(tbParse(x.transaction_date))} · ${tbLabels[x.bucket]||'Annet'} · ${tbEsc(x.account||'')}</span></div><b>${tbYen(x.amount_jpy)}${x.jpy_source==='planning_rate'?'<small>estimert</small>':''}</b></button>`).join('')||'<p class="tb-empty">Ingen kjøp er knyttet til denne turen ennå. Åpne en transaksjon i Penger og velg turen.</p>';
  document.getElementById('tb-detail-body').innerHTML=`<div class="tb-detail-summary"><div><span>Budsjett</span><strong>${tbYen(total)}</strong></div><div><span>Brukt</span><strong>${tbYen(used)}</strong></div><div><span>Igjen</span><strong class="${remaining<0?'over':''}">${tbYen(remaining)}</strong></div></div><div class="tb-detail-rows">${rows}</div><div class="tb-detail-transactions"><h3>Kjøp på turen</h3>${tx}</div>`;
  document.getElementById('tb-detail-edit').onclick=()=>{tbCloseDetail();tbOpenEdit(id)};
  document.querySelectorAll('[data-tb-tx]').forEach(btn=>btn.addEventListener('click',()=>{const raw=btn.dataset.tbTx;if(raw.startsWith('wallet:'))return;tbCloseDetail();document.querySelector('[data-view="money"]')?.click();setTimeout(()=>document.dispatchEvent(new CustomEvent('moneyos:open-transaction',{detail:{id:raw}})),150)}));
  document.getElementById('tb-detail-backdrop').classList.remove('hidden');document.body.classList.add('sheet-open');
}
function tbCloseDetail(){document.getElementById('tb-detail-backdrop')?.classList.add('hidden');document.body.classList.remove('sheet-open')}
function tbOpenEdit(id=null){
  tbEditing=id?tbTrips.find(x=>String(x.id)===String(id)):null;
  const t=tbEditing??{budgets:{},include_in_plan:true};
  document.getElementById('tb-modal-title').textContent=tbEditing?'Rediger tur':'Ny tur';
  document.getElementById('tb-name').value=t.name||''; document.getElementById('tb-start').value=t.start_date||''; document.getElementById('tb-end').value=t.end_date||'';
  ['transport','stay','food','activities','other'].forEach(k=>document.getElementById(`tb-${k}`).value=Number(t.budgets?.[k]||0)||'');
  document.getElementById('tb-include').checked=t.include_in_plan!==false; document.getElementById('tb-delete').classList.toggle('hidden',!tbEditing); document.getElementById('tb-error').textContent=''; tbFormTotal();
  document.getElementById('tb-backdrop').classList.remove('hidden'); document.body.classList.add('sheet-open');
}
function tbCloseEdit(){ document.getElementById('tb-backdrop')?.classList.add('hidden');document.body.classList.remove('sheet-open');tbEditing=null; }
async function tbSave(e){
  e.preventDefault(); const error=document.getElementById('tb-error'); error.textContent='';
  const budgets=Object.fromEntries(['transport','stay','food','activities','other'].map(k=>[k,Number(document.getElementById(`tb-${k}`).value||0)]));
  const payload={id:tbEditing?.id,name:document.getElementById('tb-name').value,start_date:document.getElementById('tb-start').value,end_date:document.getElementById('tb-end').value,budgets,include_in_plan:document.getElementById('tb-include').checked};
  try{const r=await fetch('/api/trips',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});const body=await r.json();if(!r.ok)throw new Error(body.error||'Kunne ikke lagre');tbTrips=body.trips??[];tbCloseEdit();await tbLoad();document.getElementById('refresh')?.click();}
  catch(err){error.textContent=err.message;}
}
async function tbDelete(){ if(!tbEditing)return; if(!confirm(`Slette ${tbEditing.name}?`))return; const r=await fetch(`/api/trips?id=${encodeURIComponent(tbEditing.id)}`,{method:'DELETE',credentials:'same-origin'});const body=await r.json().catch(()=>({}));if(r.ok){tbTrips=body.trips??[];tbCloseEdit();await tbLoad();document.getElementById('refresh')?.click();}else document.getElementById('tb-error').textContent=body.error||'Kunne ikke slette'; }
async function tbLoad(){
  if(tbLoading||!tbEnsure())return;const app=document.getElementById('app');if(!app||app.classList.contains('hidden'))return;tbLoading=true;
  try{const [tr,dr]=await Promise.all([fetch('/api/trips',{credentials:'same-origin',cache:'no-store'}),fetch('/api/dashboard',{credentials:'same-origin',cache:'no-store'})]);if(tr.ok)tbTrips=(await tr.json()).trips??[];if(dr.ok)tbDashboard=await dr.json();tbRender();}
  finally{tbLoading=false;}
}
function tbBoot(){const app=document.getElementById('app');const run=()=>{if(app&&!app.classList.contains('hidden'))setTimeout(tbLoad,350)};run();if(app)new MutationObserver(run).observe(app,{attributes:true,attributeFilter:['class']});document.getElementById('refresh')?.addEventListener('click',()=>setTimeout(tbLoad,850));setTimeout(tbLoad,1200);}
tbBoot();

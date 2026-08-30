const pcMoney = new Intl.NumberFormat('nb-NO', { maximumFractionDigits: 0 });
let pcData = null;
let pcLoading = false;

function pcN(v){ return Number(v ?? 0); }
function pcKr(v){ return `${pcMoney.format(pcN(v))} kr`; }
function pcParse(v){ if(!v) return null; return new Date(`${String(v).slice(0,10)}T12:00:00`); }
function pcMonthDate(key){ const [y,m]=String(key).split('-').map(Number); return new Date(y,m-1,1,12,0,0); }
function pcMonthDiff(a,b){ return (b.getFullYear()-a.getFullYear())*12+(b.getMonth()-a.getMonth()); }

function pcEnsure(){
  const anchor=document.querySelector('[data-view-panel="today"] .home-answer');
  if(!anchor || document.getElementById('purchase-check')) return !!anchor;
  const el=document.createElement('section');
  el.id='purchase-check';
  el.className='purchase-check';
  el.innerHTML=`
    <div class="pc-copy">
      <p class="panel-kicker">SIMULER ET KJØP</p>
      <h2>Kan jeg kjøpe dette?</h2>
      <p>Se hva et kjøp gjør med pengene frem til lønn og Japan-planen. Ingenting lagres.</p>
    </div>
    <form id="pc-form" class="pc-form">
      <input id="pc-name" type="text" maxlength="60" placeholder="Hva vurderer du? (valgfritt)" autocomplete="off" />
      <div class="pc-amount-wrap"><input id="pc-amount" type="number" min="1" step="1" inputmode="decimal" placeholder="Beløp" required /><span>kr</span></div>
      <button type="submit">Sjekk</button>
    </form>
    <div id="pc-result" class="pc-result hidden"></div>`;
  anchor.insertAdjacentElement('afterend',el);
  document.getElementById('pc-form')?.addEventListener('submit',e=>{e.preventDefault();pcCalculate();});
  return true;
}

function pcRecurringForMonth(items,key){
  const target=pcMonthDate(key);
  return (items??[]).filter(item=>{
    const due=pcParse(item.next_due_date); if(!due) return false;
    const origin=new Date(due.getFullYear(),due.getMonth(),1,12,0,0);
    const diff=pcMonthDiff(origin,target); if(diff<0) return false;
    if(item.cadence==='monthly') return true;
    if(item.cadence==='quarterly') return diff%3===0;
    if(item.cadence==='yearly') return diff%12===0;
    return false;
  }).reduce((s,x)=>s+pcN(x.amount),0);
}

function pcJapanRemaining(d){
  const j=d?.japan_plan??{}, cfg=j.budget??{}, rate=pcN(cfg.planning_rate?.jpy_nok);
  const cats=cfg.living_categories??[];
  if(!rate || !cats.length) return null;
  const living=cats.reduce((s,x)=>s+pcN(x.amount_jpy),0);
  const dorm=pcN(cfg.known_jpy?.dorm_monthly || j.dorm_monthly_jpy);
  const entrance=pcN(cfg.known_jpy?.entrance_fee || j.move_in_fee_jpy);
  const deposit=pcN(cfg.known_jpy?.deposit || j.deposit_jpy);
  const months=['2026-09','2026-10','2026-11','2026-12','2027-01'];
  const japanCash=months.reduce((s,key,i)=>s+living+(i===months.length-1?0:dorm)+(i===0?entrance+deposit:0),0);
  const recurring=months.reduce((s,key)=>s+pcRecurringForMonth(d.fixed_costs,key),0);
  const arrival=pcParse(j.arrival_date);
  const beforeArrival=(d.upcoming??[]).filter(x=>x.event_type!=='income' && arrival && pcParse(x.event_date) && pcParse(x.event_date)<arrival).reduce((s,x)=>s+pcN(x.amount),0);
  return pcN(d.cost_summary?.liquid_non_savings)-beforeArrival-japanCash*rate-recurring;
}

function pcCalculate(){
  if(!pcData) return;
  const amount=pcN(document.getElementById('pc-amount')?.value);
  if(!(amount>0)) return;
  const label=(document.getElementById('pc-name')?.value||'Dette kjøpet').trim();
  const o=pcData.overview??{};
  const safe=pcN(o.safe_to_spend), days=Math.max(1,pcN(o.days_to_payday));
  const safeAfter=safe-amount, dailyAfter=Math.max(0,safeAfter)/days;
  const japanBefore=pcJapanRemaining(pcData), japanAfter=japanBefore===null?null:japanBefore-amount;
  const share=safe>0?Math.round(amount/safe*100):null;
  let tone='ok',title='Innenfor planen.';
  if(safeAfter<0){tone='bad';title=`Kjøpet går ${pcKr(Math.abs(safeAfter))} over det MoneyOS regner som trygt frem til lønn.`;}
  else if(japanAfter!==null && japanAfter<0){tone='warn';title='Innenfor frem til lønn, men ikke innenfor den konservative Japan-baseplanen.';}
  else if(share!==null && share>=50){tone='warn';title=`Innenfor planen, men bruker ${share}% av det som er trygt frem til lønn.`;}
  const root=document.getElementById('pc-result');
  root.className=`pc-result ${tone}`;
  root.innerHTML=`
    <div class="pc-result-head"><div><span>${label}</span><strong>${pcKr(amount)}</strong></div><h3>${title}</h3></div>
    <div class="pc-result-grid">
      <div><span>Trygt frem til lønn</span><strong>${pcKr(Math.max(0,safeAfter))}</strong><small>fra ${pcKr(safe)}</small></div>
      <div><span>Per dag etter kjøpet</span><strong>${pcKr(dailyAfter)}</strong><small>${days} dager i beregningen</small></div>
      <div><span>Japan-basebuffer etter kjøpet</span><strong>${japanAfter===null?'—':pcKr(japanAfter)}</strong><small>${japanBefore===null?'Japan-plan mangler data':`fra ${pcKr(japanBefore)}`}</small></div>
    </div>
    <p>Simulering basert på MoneyOS-data akkurat nå. Kjøpet opprettes ikke og fremtidig lønn med ukjent beløp antas ikke.</p>`;
  root.classList.remove('hidden');
}

async function pcLoad(){
  if(pcLoading || !pcEnsure()) return;
  const app=document.getElementById('app'); if(!app || app.classList.contains('hidden')) return;
  pcLoading=true;
  try{
    const r=await fetch('/api/dashboard',{credentials:'same-origin',cache:'no-store'}); if(!r.ok) return;
    pcData=await r.json();
  }finally{pcLoading=false;}
}

function pcBoot(){
  const app=document.getElementById('app'); if(!app) return;
  const run=()=>{if(!app.classList.contains('hidden'))pcLoad();};
  run(); new MutationObserver(run).observe(app,{attributes:true,attributeFilter:['class']});
  document.getElementById('refresh')?.addEventListener('click',()=>setTimeout(pcLoad,180));
}

pcBoot();

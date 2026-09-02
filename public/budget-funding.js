const bfMoney = new Intl.NumberFormat('nb-NO', { maximumFractionDigits: 0 });
const bfMonthFmt = new Intl.DateTimeFormat('nb-NO', { month: 'long', year: 'numeric' });
const bfDateFmt = new Intl.DateTimeFormat('nb-NO', { day: 'numeric', month: 'short' });
let bfData = null;
let bfLoading = false;
let bfTarget = null;
let bfPreview = null;

function bfN(v){ return Number(v ?? 0); }
function bfKr(v){ return `${bfMoney.format(bfN(v))} kr`; }
function bfEsc(v){ return String(v ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function bfMonthKey(d){ return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; }
function bfNextMonth(){ const d=new Date(); return bfMonthKey(new Date(d.getFullYear(),d.getMonth()+1,1,12)); }
function bfMonthDate(key){ const[y,m]=String(key).split('-').map(Number); return new Date(y,m-1,1,12); }
function bfDate(v){ return v ? new Date(`${String(v).slice(0,10)}T12:00:00`) : null; }
function bfTitle(s){ return s ? s[0].toUpperCase()+s.slice(1) : s; }

function bfEnsure(){
  const budget=document.getElementById('budget-system');
  if(!budget||document.getElementById('budget-funding')) return !!budget;
  const el=document.createElement('section');
  el.id='budget-funding'; el.className='bf-section';
  el.innerHTML=`
    <div class="bf-head"><div><p class="panel-kicker">FINANSIER NESTE MÅNED</p><h2>Gjør neste måned ferdig før den starter</h2><p>Reserver penger som allerede finnes. Dette reduserer automatisk «trygt tilgjengelig» på Hjem.</p></div><input id="bf-month" type="month"></div>
    <div class="bf-hero">
      <div class="bf-ring-wrap"><div id="bf-ring" class="bf-ring"><div><strong id="bf-pct">0%</strong><span>jobber dekket</span></div></div></div>
      <div class="bf-hero-copy"><span id="bf-month-label">NESTE MÅNED</span><h3><span id="bf-funded">—</span> reservert · <span id="bf-full">—</span> full plan</h3><p id="bf-story">—</p><div class="bf-progress"><span id="bf-progress"></span></div></div>
      <div class="bf-available"><span>Kan reserveres nå</span><strong id="bf-available">—</strong><small>etter andre budsjettreserver</small></div>
    </div>
    <div class="bf-levels">
      <div class="bf-level"><span>1 · MINIMUM</span><strong id="bf-minimum">—</strong><p>Faste regninger + nødvendig hverdag.</p><small id="bf-min-status">—</small></div>
      <div class="bf-level"><span>2 · ROBUST</span><strong id="bf-robust">—</strong><p>Minimum + true expenses.</p><small id="bf-robust-status">—</small></div>
      <div class="bf-level full"><span>3 · FULL PLAN</span><strong id="bf-full-level">—</strong><p>Robust + sparing + fri pott.</p><small id="bf-full-status">—</small></div>
    </div>
    <div class="bf-quick"><div><span>HURTIGFINANSIER</span><p>MoneyOS fyller manglende jobber i prioritert rekkefølge og bruker aldri mer enn det som er ufordelt.</p></div><button data-bf-cover="minimum" type="button">Dekk minimum</button><button data-bf-cover="robust" type="button">Dekk robust</button><button data-bf-cover="full" type="button">Dekk full måned</button></div>
    <div class="bf-split">
      <article class="bf-card bf-min-card"><div><p class="panel-kicker">MINIMUMSMÅNED</p><h3>Hvor lite trenger måneden egentlig?</h3><p>Dette er gulvet: ingen shopping-/restaurantpott, men faste regninger og nødvendige kategorier er dekket.</p></div><div class="bf-min-breakdown"><div><span>Faste</span><strong id="bf-min-fixed">—</strong></div><div><span>Nødvendig</span><strong id="bf-min-essential">—</strong></div><div class="total"><span>Minimum</span><strong id="bf-min-total">—</strong></div></div></article>
      <article class="bf-card"><div class="bf-card-head"><div><p class="panel-kicker">FORDEL PENGER</p><h3>Hva skal neste inntekt gjøre?</h3><p>Bokført lønn kan fordeles direkte. Andre beløp kan testes manuelt før du reserverer dem.</p></div></div><div id="bf-salary" class="bf-salary hidden"></div><form id="bf-form" class="bf-form"><div class="bf-amount"><input id="bf-amount" type="number" min="1" step="100" placeholder="F.eks. 25000"><span>kr</span></div><button type="submit">Vis fordeling</button></form><div id="bf-preview" class="bf-preview hidden"></div></article>
    </div>
    <div class="bf-actions"><button id="bf-clear" type="button">Frigi reservering</button><p>Reservering er regnskapsmessig i MoneyOS. Ingen bankoverføring opprettes.</p></div>`;
  budget.insertAdjacentElement('afterend',el);
  const month=document.getElementById('bf-month');
  month.value=bfTarget||bfNextMonth(); month.min=bfNextMonth();
  month.addEventListener('change',e=>{const next=bfNextMonth();bfTarget=e.target.value&&e.target.value>=next?e.target.value:next;e.target.value=bfTarget;bfLoad(true);});
  document.getElementById('bf-form')?.addEventListener('submit',e=>{e.preventDefault();bfPreviewAmount();});
  document.getElementById('bf-clear')?.addEventListener('click',bfClear);
  document.querySelectorAll('[data-bf-cover]').forEach(b=>b.addEventListener('click',()=>bfCover(b.dataset.bfCover)));
  return true;
}
function bfEnsureHome(){
  const shell=document.querySelector('[data-view-panel="today"] .home-shell');
  if(!shell||document.getElementById('bf-home')) return !!shell;
  const anchor=document.getElementById('monthly-margin-home')||shell.querySelector('.japan-home-strip');
  if(!anchor) return false;
  const el=document.createElement('section');
  el.id='bf-home'; el.className='bf-home';
  el.innerHTML=`<div><p class="panel-kicker">NESTE MÅNED</p><h2 id="bf-home-title">—</h2><p id="bf-home-copy">—</p></div><button type="button">Finansier →</button>`;
  anchor.insertAdjacentElement('beforebegin',el);
  el.querySelector('button').addEventListener('click',()=>{document.querySelector('[data-view="money"]')?.click();setTimeout(()=>document.getElementById('budget-funding')?.scrollIntoView({behavior:'smooth',block:'start'}),150);});
  return true;
}
function bfGapStatus(gap){ return bfN(gap)<=.01 ? 'Fullfinansiert' : `${bfKr(gap)} mangler`; }

function bfRenderSalary(d){
  const root=document.getElementById('bf-salary');
  if(!root) return;
  const s=d.latest_salary;
  if(!s){root.classList.add('hidden');return;}
  root.classList.remove('hidden');
  const when=bfDate(s.transaction_date),date=when?bfDateFmt.format(when):'';
  if(s.already_allocated){
    root.innerHTML=`<div><span>SISTE BOKFØRTE LØNN · ${bfEsc(date)}</span><strong>${bfKr(s.amount_nok)}</strong><small>Allerede fordelt til ${bfTitle(bfMonthFmt.format(bfMonthDate(s.allocation?.target_month||d.month)))}.</small></div><b>Fordelt</b>`;
    return;
  }
  const disabled=d.available_to_allocate_nok<=0||d.remaining_to_full_nok<=0;
  root.innerHTML=`<div><span>SISTE BOKFØRTE LØNN · ${bfEsc(date)}</span><strong>${bfKr(s.amount_nok)}</strong><small>${bfEsc(s.merchant||'Lønn')} · fyller jobbene i prioritert rekkefølge med penger som faktisk er ledige.</small></div><button id="bf-use-salary" type="button"${disabled?' disabled':''}>${d.remaining_to_full_nok<=0?'Månedsjobbene er fullfinansiert':'Fordel lønnen'}</button>`;
  document.getElementById('bf-use-salary')?.addEventListener('click',()=>bfAllocateSalary(s.id));
}
function bfRenderQuick(d){
  const defs={
    minimum:['Dekk minimum',d.remaining_to_minimum_nok],
    robust:['Dekk robust',d.remaining_to_robust_nok],
    full:['Dekk full måned',d.remaining_to_full_nok]
  };
  document.querySelectorAll('[data-bf-cover]').forEach(btn=>{
    const[label,need]=defs[btn.dataset.bfCover]||['Dekk',0];
    const usable=Math.min(Math.max(0,bfN(need)),Math.max(0,bfN(d.available_to_allocate_nok)));
    btn.disabled=need<=0||d.available_to_allocate_nok<=0;
    btn.textContent=need<=0?`${label} ✓`:usable<need?`Reserver ${bfKr(usable)}`:`${label} · ${bfKr(need)}`;
  });
}
function bfRender(){
  if(!bfData||!bfEnsure()) return;
  bfEnsureHome();
  const d=bfData,pct=Math.max(0,Math.min(100,bfN(d.funded_percent_full)));
  document.getElementById('bf-month').value=d.month;
  document.getElementById('bf-month-label').textContent=bfTitle(bfMonthFmt.format(bfMonthDate(d.month))).toUpperCase();
  document.getElementById('bf-funded').textContent=bfKr(d.funded_nok);
  document.getElementById('bf-full').textContent=bfKr(d.full_month_nok);
  document.getElementById('bf-pct').textContent=`${Math.round(pct)}%`;
  document.getElementById('bf-progress').style.width=`${pct}%`;
  document.getElementById('bf-ring').style.setProperty('--bf-progress',`${pct*3.6}deg`);
  document.getElementById('bf-available').textContent=bfKr(d.available_to_allocate_nok);

  let story='Ingen penger er reservert til måneden ennå.';
  if(d.remaining_to_full_nok<=.01&&d.full_month_nok>0&&d.plan_saved) story='Alle planjobbene er finansiert med penger som finnes.';
  else if(d.remaining_to_robust_nok<=.01&&d.robust_month_nok>0) story='Faste, nødvendig og True Expenses er dekket. Nå gjenstår sparing og fri pott.';
  else if(d.remaining_to_minimum_nok<=.01&&d.minimum_month_nok>0) story='Faste og nødvendig er finansiert. Neste prioritet er True Expenses.';
  else if(d.funded_covered_nok>0) story=`${bfKr(d.remaining_to_minimum_nok)} mangler i Faste/Nødvendig før minimum er dekket.`;
  else if(d.funded_nok>0) story=`${bfKr(d.funded_nok)} er reservert, men mangler en gyldig jobb. Omfordel reserven.`;
  document.getElementById('bf-story').textContent=story;

  document.getElementById('bf-minimum').textContent=bfKr(d.minimum_month_nok);
  document.getElementById('bf-robust').textContent=bfKr(d.robust_month_nok);
  document.getElementById('bf-full-level').textContent=bfKr(d.full_month_nok);
  document.getElementById('bf-min-status').textContent=bfGapStatus(d.remaining_to_minimum_nok);
  document.getElementById('bf-robust-status').textContent=bfGapStatus(d.remaining_to_robust_nok);
  document.getElementById('bf-full-status').textContent=bfGapStatus(d.remaining_to_full_nok);
  document.getElementById('bf-min-fixed').textContent=bfKr(d.fixed_nok);
  document.getElementById('bf-min-essential').textContent=bfKr(d.essential_nok);
  document.getElementById('bf-min-total').textContent=bfKr(d.minimum_month_nok);

  const clear=document.getElementById('bf-clear');
  if(clear) clear.disabled=d.funded_nok<=0;
  bfRenderSalary(d); bfRenderQuick(d);

  const ht=document.getElementById('bf-home-title'),hc=document.getElementById('bf-home-copy');
  if(ht) ht.textContent=d.full_month_nok>0?`${Math.round(pct)}% av månedsjobbene finansiert`:`${bfTitle(bfMonthFmt.format(bfMonthDate(d.month)))} er ikke planlagt ennå`;
  if(hc) hc.textContent=d.remaining_to_minimum_nok<=.01&&d.minimum_month_nok>0?`Minimumsjobbene på ${bfKr(d.minimum_month_nok)} er dekket. ${bfKr(d.remaining_to_full_nok)} gjenstår til full plan.`:`${bfKr(d.remaining_to_minimum_nok)} mangler i Faste/Nødvendig for å dekke minimum.`;

  if(bfPreview) bfRenderPreview(bfPreview);
}
function bfRenderPreview(preview){
  const root=document.getElementById('bf-preview');
  if(!root) return;
  root.classList.remove('hidden');
  const used=preview.reserved_nok;
  root.innerHTML=`<div class="bf-preview-head"><div><span>JOBBFORDELING</span><strong>${bfKr(used)} reserveres</strong></div>${preview.left_unassigned_nok>0?`<p>${bfKr(preview.left_unassigned_nok)} kan ikke brukes på flere månedsjobber.</p>`:''}</div><div class="bf-preview-steps">${preview.steps.map((s,i)=>`<div class="bf-preview-step ${s.allocated_nok>0?'active':''}"><span>${i+1}</span><div><strong>${bfEsc(s.label)}</strong><small>${bfKr(s.needed_nok)} mangler før fordelingen</small></div><b>${s.allocated_nok>0?`+${bfKr(s.allocated_nok)}`:'—'}</b></div>`).join('')}</div><button id="bf-apply" type="button"${used<=0?' disabled':''}>Reserver ${bfKr(used)}</button>`;
  document.getElementById('bf-apply')?.addEventListener('click',()=>bfApply(preview.amount_nok));
}
async function bfPreviewAmount(){
  const amount=bfN(document.getElementById('bf-amount').value);
  if(amount<=0)return;
  const r=await fetch(`/api/budget-funding?month=${encodeURIComponent(bfTarget||bfNextMonth())}&amount_nok=${encodeURIComponent(amount)}`,{credentials:'same-origin',cache:'no-store'});
  if(!r.ok)return;
  const body=await r.json(); bfData=body; bfPreview=body.allocation_preview; bfRender();
}
async function bfCover(level){
  if(!bfData)return;
  const need=level==='minimum'?bfData.remaining_to_minimum_nok:level==='robust'?bfData.remaining_to_robust_nok:bfData.remaining_to_full_nok;
  const amount=Math.min(Math.max(0,bfN(need)),Math.max(0,bfN(bfData.available_to_allocate_nok)));
  if(amount<=0)return;
  await bfApply(amount);
}
async function bfApply(amount){
  const btn=document.getElementById('bf-apply');
  if(btn){btn.disabled=true;btn.textContent='Reserverer…';}
  try{
    const r=await fetch('/api/budget-funding',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'allocate_amount',month:bfTarget||bfNextMonth(),amount_nok:amount})});
    const body=await r.json();
    if(!r.ok)throw new Error(body.error||'Kunne ikke reservere');
    bfData=body;bfPreview=null;
    document.getElementById('bf-amount').value='';
    document.getElementById('bf-preview').classList.add('hidden');
    bfRender();
    document.dispatchEvent(new CustomEvent('moneyos:budget-updated'));
    document.getElementById('refresh')?.click();
    setTimeout(()=>bfLoad(true),650);
  }catch(err){
    if(btn){btn.disabled=false;btn.textContent=err.message;}else alert(err.message);
  }
}
async function bfAllocateSalary(id){
  const btn=document.getElementById('bf-use-salary');
  if(btn){btn.disabled=true;btn.textContent='Fordeler…';}
  try{
    const r=await fetch('/api/budget-funding',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'allocate_salary',month:bfTarget||bfNextMonth(),transaction_id:id})});
    const body=await r.json();
    if(!r.ok)throw new Error(body.error||'Kunne ikke fordele lønnen');
    bfData=body;bfPreview=null;bfRender();
    document.dispatchEvent(new CustomEvent('moneyos:budget-updated'));
    document.getElementById('refresh')?.click();
    setTimeout(()=>bfLoad(true),650);
  }catch(err){if(btn){btn.disabled=false;btn.textContent=err.message;}}
}
async function bfClear(){
  if(!bfData||bfData.funded_nok<=0)return;
  if(!confirm(`Frigi ${bfKr(bfData.funded_nok)} som er reservert til ${bfTitle(bfMonthFmt.format(bfMonthDate(bfData.month)))}?`))return;
  const r=await fetch('/api/budget-funding',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'clear_funding',month:bfData.month})});
  if(r.ok){
    bfData=await r.json();bfPreview=null;bfRender();
    document.dispatchEvent(new CustomEvent('moneyos:budget-updated'));
    document.getElementById('refresh')?.click();
    setTimeout(()=>bfLoad(true),650);
  }
}
async function bfLoad(force=false){
  if(bfLoading)return;
  const app=document.getElementById('app');
  if(!app||app.classList.contains('hidden'))return;
  if(!bfTarget)bfTarget=bfNextMonth();
  if(bfTarget<bfNextMonth())bfTarget=bfNextMonth();
  bfLoading=true;
  try{
    for(let i=0;i<20&&!bfEnsure();i++)await new Promise(r=>setTimeout(r,80));
    const r=await fetch(`/api/budget-funding?month=${encodeURIComponent(bfTarget)}`,{credentials:'same-origin',cache:'no-store'});
    if(!r.ok)return;
    bfData=await r.json();bfPreview=null;bfRender();
  }finally{bfLoading=false;}
}
function bfBoot(){
  const app=document.getElementById('app');
  const run=()=>{if(app&&!app.classList.contains('hidden'))setTimeout(()=>bfLoad(),500);};
  run();
  if(app)new MutationObserver(run).observe(app,{attributes:true,attributeFilter:['class']});
  document.getElementById('refresh')?.addEventListener('click',()=>setTimeout(()=>bfLoad(true),900));
  document.addEventListener('moneyos:budget-updated',()=>setTimeout(()=>bfLoad(true),450));
  setTimeout(()=>bfLoad(),1600);
}
bfBoot();

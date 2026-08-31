const mmMoney = new Intl.NumberFormat('nb-NO', { maximumFractionDigits: 0 });
const mmMonth = new Intl.DateTimeFormat('nb-NO', { month: 'long' });
let mmBusy = false;

function mmN(v){ return Number(v ?? 0); }
function mmKr(v){ return `${mmMoney.format(mmN(v))} kr`; }
function mmYen(v){ return `¥${mmMoney.format(mmN(v))}`; }
function mmDate(v){ return v ? new Date(`${String(v).slice(0,10)}T12:00:00`) : null; }
function mmKey(d){ return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; }
function mmMonthDate(key){ const [y,m]=key.split('-').map(Number); return new Date(y,m-1,1,12); }
function mmTitle(v){ return v ? v[0].toUpperCase()+v.slice(1) : v; }
function mmDiffMonths(a,b){ return (b.getFullYear()-a.getFullYear())*12 + b.getMonth()-a.getMonth(); }

function mmRecurring(items,key){
  const target=mmMonthDate(key);
  return (items??[]).map(item=>{
    const due=mmDate(item.next_due_date); if(!due) return null;
    const diff=mmDiffMonths(new Date(due.getFullYear(),due.getMonth(),1,12),target);
    if(diff<0) return null;
    const cadence=item.cadence;
    const match=cadence==='monthly' || (cadence==='quarterly' && diff%3===0) || (cadence==='yearly' && diff%12===0);
    return match ? mmN(item.amount) : null;
  }).filter(v=>v!==null).reduce((a,b)=>a+b,0);
}

function mmModel(d){
  const j=d.japan_plan??{}, cfg=j.budget??{};
  const rate=mmN(cfg.planning_rate?.jpy_nok);
  const cats=cfg.living_categories??[];
  const essential=cats.filter(x=>x.kind==='essential').reduce((s,x)=>s+mmN(x.amount_jpy),0);
  const flexible=cats.filter(x=>x.kind==='flexible').reduce((s,x)=>s+mmN(x.amount_jpy),0);
  const dorm=mmN(cfg.known_jpy?.dorm_monthly || j.dorm_monthly_jpy);
  const entrance=mmN(cfg.known_jpy?.entrance_fee || j.move_in_fee_jpy);
  const deposit=mmN(cfg.known_jpy?.deposit || j.deposit_jpy);
  const start=mmDate(cfg.period_start), end=mmDate(cfg.period_end);
  if(!rate || !start || !end) return null;

  const months=[]; let cursor=new Date(start);
  while(cursor<=end){ months.push(mmKey(cursor)); cursor=new Date(cursor.getFullYear(),cursor.getMonth()+1,1,12); }

  const arrival=mmDate(j.arrival_date);
  const beforeArrival=(d.upcoming??[]).filter(x=>x.event_type!=='income' && arrival && mmDate(x.event_date) && mmDate(x.event_date)<arrival).reduce((s,x)=>s+mmN(x.amount),0);
  let running=mmN(d.cost_summary?.liquid_non_savings)-beforeArrival;

  const rows=months.map((key,index)=>{
    const first=index===0, last=index===months.length-1;
    const norway=mmRecurring(d.fixed_costs,key);
    const requiredJpy=essential + (last?0:dorm) + (first?entrance+deposit:0);
    const totalJpy=requiredJpy+flexible;
    const totalNok=totalJpy*rate+norway;
    running-=totalNok;
    return {key,first,last,norway,requiredJpy,totalJpy,totalNok,endBalance:running};
  });

  return {rate,essential,flexible,dorm,entrance,deposit,beforeArrival,rows,finalBalance:running,unpriced:(cfg.unpriced??[]).length};
}

function mmEnsureJapan(){
  const root=document.getElementById('japan-budget-v2');
  if(!root || document.getElementById('monthly-margin')) return !!root;
  const normal=root.querySelector('.jb-normal-month');
  if(!normal) return false;
  const section=document.createElement('section');
  section.id='monthly-margin';
  section.className='mm-section';
  section.innerHTML=`
    <div class="mm-head">
      <div><p class="panel-kicker">MÅNEDLIG SPILLEROM</p><h2>Hvor mye har du til andre ting?</h2><p>Ingen framtidig lønn antas. «Fri pott» er penger planen setter av til sosialt, spise ute, shopping og småturer.</p></div>
      <div class="mm-free"><span>Fri pott i en vanlig måned</span><strong id="mm-free-yen">—</strong><small id="mm-free-nok">—</small></div>
    </div>
    <div class="mm-table-head"><span>Måned</span><span>Må dekkes</span><span>Fri pott</span><span>Saldo etter måneden</span></div>
    <div id="mm-rows" class="mm-rows"></div>
    <div class="mm-footer"><div><span>Ekstra reserve etter hele baseplanen</span><strong id="mm-final">—</strong></div><p id="mm-warning">—</p></div>`;
  normal.insertAdjacentElement('afterend',section);
  return true;
}

function mmEnsureHome(){
  const shell=document.querySelector('[data-view-panel="today"] .home-shell');
  if(!shell || document.getElementById('monthly-margin-home')) return !!shell;
  const japan=shell.querySelector('.japan-home-strip');
  if(!japan) return false;
  const card=document.createElement('section');
  card.id='monthly-margin-home';
  card.className='mm-home';
  card.innerHTML=`<div><p class="panel-kicker">MÅNEDLIG SPILLEROM I JAPAN</p><h2 id="mm-home-title">—</h2><p id="mm-home-copy">—</p></div><button data-go="plans" type="button">Se månedsplan →</button>`;
  japan.insertAdjacentElement('beforebegin',card);
  card.querySelector('button')?.addEventListener('click',()=>document.querySelector('[data-view="plans"]')?.click());
  return true;
}

function mmRender(d){
  const model=mmModel(d); if(!model) return;
  mmEnsureJapan(); mmEnsureHome();
  const flexNok=model.flexible*model.rate;
  const freeYen=document.getElementById('mm-free-yen'); if(freeYen) freeYen.textContent=mmYen(model.flexible);
  const freeNok=document.getElementById('mm-free-nok'); if(freeNok) freeNok.textContent=`≈ ${mmKr(flexNok)} per måned`;
  const rows=document.getElementById('mm-rows');
  if(rows) rows.innerHTML=model.rows.map(row=>`<div class="mm-row">
    <div><strong>${mmTitle(mmMonth.format(mmMonthDate(row.key)))}</strong><small>${row.first?'Oppstart + depositum':row.last?'Dorm dekkes av depositum':'Vanlig måned'}</small></div>
    <div><span>Må dekkes</span><strong>≈ ${mmKr(row.requiredJpy*model.rate+row.norway)}</strong><small>${mmYen(row.requiredJpy)} Japan + ${mmKr(row.norway)} Norge</small></div>
    <div class="mm-row-free"><span>Til andre ting</span><strong>${mmYen(model.flexible)}</strong><small>≈ ${mmKr(flexNok)}</small></div>
    <div><span>Ingen ny inntekt</span><strong>${mmKr(row.endBalance)}</strong><small>total saldo igjen etter måneden</small></div>
  </div>`).join('');
  const final=document.getElementById('mm-final'); if(final) final.textContent=mmKr(model.finalBalance);
  const warning=document.getElementById('mm-warning'); if(warning) warning.textContent=model.unpriced?`${model.unpriced} poster mangler fortsatt pris. Reserven er derfor ikke det samme som ekstra penger du bør bruke.`:'Alle kjente baseposter er priset.';
  const homeTitle=document.getElementById('mm-home-title'); if(homeTitle) homeTitle.textContent=`${mmYen(model.flexible)} til andre ting per vanlig måned`;
  const homeCopy=document.getElementById('mm-home-copy'); if(homeCopy) homeCopy.textContent=`≈ ${mmKr(flexNok)} til sosialt, spise ute, shopping og småturer. Etter hele baseplanen står ${mmKr(model.finalBalance)} igjen som reserve før poster som mangler pris.`;
}

async function mmLoad(){
  if(mmBusy) return;
  const app=document.getElementById('app'); if(!app || app.classList.contains('hidden')) return;
  mmBusy=true;
  try{
    const r=await fetch('/api/dashboard',{credentials:'same-origin',cache:'no-store'}); if(!r.ok) return;
    const d=await r.json();
    for(let i=0;i<20;i++){
      if(mmEnsureJapan()) break;
      await new Promise(resolve=>setTimeout(resolve,75));
    }
    mmRender(d);
  }finally{mmBusy=false;}
}

function mmBoot(){
  const app=document.getElementById('app'); if(!app) return;
  const run=()=>{ if(!app.classList.contains('hidden')) setTimeout(mmLoad,250); };
  run();
  new MutationObserver(run).observe(app,{attributes:true,attributeFilter:['class']});
  document.getElementById('refresh')?.addEventListener('click',()=>setTimeout(mmLoad,300));
}

mmBoot();

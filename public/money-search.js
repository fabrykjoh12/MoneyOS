const msMoney=new Intl.NumberFormat('nb-NO',{maximumFractionDigits:0});
const msMonthFmt=new Intl.DateTimeFormat('nb-NO',{month:'long',year:'numeric'});
const msDateFmt=new Intl.DateTimeFormat('nb-NO',{day:'numeric',month:'short'});
let msData=null,msLoading=false;
function msN(v){return Number(v??0)}
function msKr(v){return `${msMoney.format(msN(v))} kr`}
function msY(v){return `¥${msMoney.format(msN(v))}`}
function msEsc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function msMonthDate(key){const [y,m]=String(key).split('-').map(Number);return new Date(y,m-1,1,12)}
function msParse(v){return v?new Date(`${String(v).slice(0,10)}T12:00:00`):null}
const monthNames={januar:1,februar:2,mars:3,april:4,mai:5,juni:6,juli:7,august:8,september:9,oktober:10,november:11,desember:12};
const categoryAliases=[
  {keys:['mat','dagligvarer'],names:['Dagligvarer']},
  {keys:['restaurant','spise ute','takeaway'],names:['Restaurant og takeaway']},
  {keys:['transport','parkering'],names:['Transport']},
  {keys:['shopping','klær'],names:['Shopping']},
  {keys:['bolig','husleie'],names:['Bolig']},
  {keys:['digital','digitale tjenester','abonnement'],names:['Digitale tjenester']},
  {keys:['helse'],names:['Helse']},
  {keys:['utdanning','skole'],names:['Utdanning']},
  {keys:['bank','gebyr'],names:['Bank og gebyrer']},
  {keys:['fritid','gaming'],names:['Fritid og gaming']}
];
function ensureSearch(){
  if(document.getElementById('moneyos-command'))return true;
  const home=document.querySelector('.home-shell');if(!home)return false;
  const heading=home.querySelector('.home-heading');
  const box=document.createElement('section');box.id='moneyos-command';box.className='ms-command';
  box.innerHTML=`<div class="ms-label"><span>SPØR MONEYOS</span><small>Data, ikke gjetting</small></div><form id="ms-form"><input id="ms-input" type="search" autocomplete="off" placeholder="F.eks. hvor mye kan jeg bruke i Japan?"/><button type="submit">Søk</button></form><div id="ms-result" class="ms-result hidden"></div><div class="ms-chips"><button type="button" data-ms="Hvor mye kan jeg bruke i Japan?">Japan</button><button type="button" data-ms="Hvor mye kan jeg bruke frem til lønn?">Til lønn</button><button type="button" data-ms="Hva er min dyreste måned?">Dyreste måned</button><button type="button" data-ms="Hva er mitt dyreste abonnement?">Dyreste abonnement</button><button type="button" data-ms="Hvor mye har jeg i faste kostnader?">Faste kostnader</button></div>`;
  heading?.insertAdjacentElement('afterend',box);
  document.getElementById('ms-form')?.addEventListener('submit',e=>{e.preventDefault();runSearch(document.getElementById('ms-input').value)});
  box.querySelectorAll('[data-ms]').forEach(b=>b.addEventListener('click',()=>{document.getElementById('ms-input').value=b.dataset.ms;runSearch(b.dataset.ms)}));
  return true;
}
function findMonth(q){
  const months=msData?.monthly_breakdown??[];if(!months.length)return null;
  if(/forrige måned/i.test(q))return months[1]??months[0];
  if(/denne måned|denne måneden/i.test(q))return months[0];
  for(const [name,num] of Object.entries(monthNames)){
    if(q.includes(name)){
      const explicitYear=(q.match(/20\d{2}/)||[])[0];
      const matches=months.filter(x=>Number(String(x.month).slice(5,7))===num&&(!explicitYear||String(x.month).startsWith(explicitYear)));
      return matches[0]??null;
    }
  }
  return null;
}
function findCategory(q){for(const group of categoryAliases){if(group.keys.some(k=>q.includes(k)))return group.names}return null}
function categoryTotal(names){return(msData?.monthly_breakdown??[]).reduce((sum,m)=>sum+names.reduce((s,name)=>s+msN(m.categories?.[name]),0),0)}
function topCategory(month){const entries=Object.entries(month?.categories??{}).map(([name,value])=>({name,value:msN(value)})).filter(x=>x.value>0).sort((a,b)=>b.value-a.value);return entries[0]??null}
function result(title,value,copy){const root=document.getElementById('ms-result');root.classList.remove('hidden');root.innerHTML=`<div><span>${msEsc(title)}</span><strong>${msEsc(value)}</strong><p>${msEsc(copy)}</p></div>`}
async function msGetRunway(){for(let i=0;i<40&&!window.MoneyOSJapanRunway;i++)await new Promise(r=>setTimeout(r,100));try{return await window.MoneyOSJapanRunway?.get?.()}catch{return null}}
async function runSearch(raw){
  const q=String(raw??'').trim().toLowerCase();if(!q||!msData)return;
  const fixed=[...(msData.fixed_costs??[])].sort((a,b)=>msN(b.monthly_amount)-msN(a.monthly_amount));
  const months=msData.monthly_breakdown??[];

  if(/japan/.test(q)&&(/kan.*bruke|fri|fleksibel|andre ting|sosial|per dag|per uke|per måned|per mnd|budsjett/i.test(q))){
    const r=await msGetRunway();if(!r){result('Japan · fri pott','—','Japan-runwayen kunne ikke lastes. MoneyOS viser ikke et alternativt estimat.');return}
    const warning=r.missing_costs>0?` Foreløpig: ${r.missing_costs} kostnad${r.missing_costs===1?'':'er'} mangler pris.`:'';
    if(/per dag|daglig/.test(q)){result('Japan · fri grense per dag',msY(Math.max(0,r.daily_jpy)),`${msY(Math.max(0,r.free_jpy))} fri pott fordelt over ${r.days_remaining} dager.${warning}`);return}
    if(/per uke|ukentlig/.test(q)){result('Japan · fri grense per uke',msY(Math.max(0,r.weekly_jpy)),`${msY(Math.max(0,r.free_jpy))} fri pott over resten av oppholdet.${warning}`);return}
    if(/per måned|per mnd|månedlig/.test(q)){result('Japan · fri grense per 30 dager',msY(Math.max(0,r.month30_jpy)),`${msY(Math.max(0,r.free_jpy))} fri pott over resten av oppholdet.${warning}`);return}
    result('Japan · fri pott resten av oppholdet',msY(Math.max(0,r.free_jpy)),`${msY(Math.max(0,r.month30_jpy))} per 30 dager · ${msY(Math.max(0,r.weekly_jpy))} per uke · ${msY(Math.max(0,r.daily_jpy))} per dag. ${r.days_remaining} dager igjen.${warning}`);return;
  }
  if(/kan jeg bruke|kan jeg bruke.*lønn|frem til lønn|fram til lønn|trygt.*bruke/i.test(q)){
    const o=msData.overview??{};result('Trygt frem til neste lønn',msKr(o.safe_to_spend),`${msKr(o.daily_safe_to_spend)} per dag i MoneyOS-beregningen. Kjente regninger før lønn er allerede satt av.`);return;
  }
  if(/neste regning|neste trekk/i.test(q)){
    const x=(msData.upcoming??[]).filter(v=>v.event_type!=='income').sort((a,b)=>String(a.event_date).localeCompare(String(b.event_date)))[0];
    if(x){result('Neste kjente trekk',`${x.name} · ${msKr(x.amount)}`,`${msDateFmt.format(msParse(x.event_date))}. Bare registrerte/planlagte beløp brukes.`);return}
  }
  if(/neste 30 dager|30 dager.*regning|regninger.*30/i.test(q)){
    const now=msParse(msData.overview?.as_of)||new Date(),end=new Date(now);end.setDate(end.getDate()+30);
    const events=(msData.horizon_events??[]).filter(x=>x.event_type!=='income'&&msParse(x.event_date)>=now&&msParse(x.event_date)<=end);const total=events.reduce((s,x)=>s+msN(x.amount),0);
    result('Kjente regninger neste 30 dager',msKr(total),`${events.length} registrerte trekk. Ukjent lønn og vanlig hverdagsforbruk er ikke estimert.`);return;
  }
  if(/dyrest.*abonnement|dyreste abonnement|største.*fast/i.test(q)){
    const x=fixed[0];if(x){result('Dyreste faste kostnad',`${x.name} · ${msKr(x.monthly_amount)}/mnd`,`${msKr(msN(x.monthly_amount)*12)} per år hvis kostnaden fortsetter.`);return}
  }
  if(/faste kostnader|abonnement.*totalt|fast.*per måned/i.test(q)){
    const total=fixed.reduce((s,x)=>s+msN(x.monthly_amount),0);result('Bekreftede faste kostnader',`${msKr(total)} / mnd`,`${msKr(total*12)} per år. Kun bekreftede faste kostnader er med.`);return;
  }
  if(/dyreste måned|mest.*måned|måned.*mest brukt/i.test(q)&&months.length){
    const x=[...months].sort((a,b)=>msN(b.expenses)-msN(a.expenses))[0];result('Dyreste måned i historikken',msMonthFmt.format(msMonthDate(x.month)),`${msKr(x.expenses)} i utgifter. Største kategori: ${topCategory(x)?.name??'ukjent'}.`);return;
  }
  if(/billigste måned|minst.*måned|måned.*minst brukt/i.test(q)&&months.length){
    const x=[...months].filter(m=>msN(m.expenses)>0).sort((a,b)=>msN(a.expenses)-msN(b.expenses))[0];if(x){result('Laveste måned i historikken',msMonthFmt.format(msMonthDate(x.month)),`${msKr(x.expenses)} i utgifter.`);return}
  }
  if(/snitt.*måned|gjennomsnitt.*måned|gjennomsnittlig.*forbruk/i.test(q)&&months.length){
    const total=months.reduce((s,m)=>s+msN(m.expenses),0);result('Gjennomsnittlig månedsforbruk',`${msKr(total/months.length)} / mnd`,`Basert på ${months.length} måneder i MoneyOS-historikken. Store engangskjøp er ikke fjernet.`);return;
  }
  if(/hvor mye.*har jeg|saldo|penger totalt/i.test(q)&&!/brukt/i.test(q)){
    result('Penger totalt nå',msKr(msData.overview?.total_balance),'Alle aktive kontoer i MoneyOS, inkludert penger som holdes utenfor daglig forbruk.');return;
  }
  const cats=findCategory(q);
  const month=findMonth(q);
  if(month){
    if(cats){
      const amount=cats.reduce((s,name)=>s+msN(month.categories?.[name]),0);result(`${msMonthFmt.format(msMonthDate(month.month))} · ${cats.join(' + ')}`,msKr(amount),'Beløpet kommer fra månedens kategorisammendrag. Interne overføringer er ikke ment å telle som forbruk.');return;
    }
    if(/største kategori|mest.*kategori|hva.*mest/i.test(q)){
      const top=topCategory(month);if(top){result(`${msMonthFmt.format(msMonthDate(month.month))} · største kategori`,top.name,`${msKr(top.value)} brukt i kategorien.`);return}
    }
    if(/brukt|utgifter|forbruk/i.test(q)){result(msMonthFmt.format(msMonthDate(month.month)),msKr(month.expenses),`Bokførte utgifter. Inntekter samme måned: ${msKr(month.income)}.`);return}
    if(/inntekt|fikk inn|penger inn/i.test(q)){result(`${msMonthFmt.format(msMonthDate(month.month))} · inn`,msKr(month.income),`Netto den måneden var ${msKr(month.net)}.`);return}
  }
  if(cats&&/totalt|historikk|alle måned/i.test(q)){
    const total=categoryTotal(cats);result(`${cats.join(' + ')} · hele historikken`,msKr(total),`Summert over ${months.length} måneder med tilgjengelige kategorisammendrag.`);return;
  }
  result('Fant ikke et sikkert svar','—','Prøv «hvor mye kan jeg bruke i Japan?», «Japan per dag», «dyreste måned», «hvor mye brukte jeg på mat i juli?», «neste regning» eller «hvor mye kan jeg bruke frem til lønn?». MoneyOS svarer ikke når spørsmålet ikke kan beregnes sikkert.');
}
async function loadMoneySearch(){if(msLoading)return;const app=document.getElementById('app');if(!app||app.classList.contains('hidden'))return;msLoading=true;try{const r=await fetch('/api/dashboard',{credentials:'same-origin',cache:'no-store'});if(!r.ok)return;msData=await r.json();ensureSearch()}finally{msLoading=false}}
function bootMoneySearch(){const app=document.getElementById('app');if(!app)return;const run=()=>{if(!app.classList.contains('hidden'))loadMoneySearch()};run();new MutationObserver(run).observe(app,{attributes:true,attributeFilter:['class']});document.getElementById('refresh')?.addEventListener('click',()=>setTimeout(loadMoneySearch,550));document.addEventListener('moneyos:japan-wallet-updated',()=>setTimeout(loadMoneySearch,350));document.addEventListener('moneyos:transaction-updated',()=>setTimeout(loadMoneySearch,350));document.addEventListener('keydown',e=>{if(e.key==='k'&&(e.ctrlKey||e.metaKey)){e.preventDefault();document.getElementById('ms-input')?.focus()}})}
bootMoneySearch();

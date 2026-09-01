const msMoney=new Intl.NumberFormat('nb-NO',{maximumFractionDigits:0});
const msMonthFmt=new Intl.DateTimeFormat('nb-NO',{month:'long',year:'numeric'});
let msData=null,msLoading=false;
function msN(v){return Number(v??0)}
function msKr(v){return `${msMoney.format(msN(v))} kr`}
function msEsc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function msMonthDate(key){const [y,m]=String(key).split('-').map(Number);return new Date(y,m-1,1,12)}
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
  {keys:['bank','gebyr'],names:['Bank og gebyrer']}
];
function ensureSearch(){
  if(document.getElementById('moneyos-command'))return true;
  const home=document.querySelector('.home-shell');if(!home)return false;
  const heading=home.querySelector('.home-heading');
  const box=document.createElement('section');box.id='moneyos-command';box.className='ms-command';
  box.innerHTML=`<div class="ms-label"><span>SPØR MONEYOS</span><small>Data, ikke gjetting</small></div><form id="ms-form"><input id="ms-input" type="search" autocomplete="off" placeholder="F.eks. hvor mye brukte jeg på mat i juli?"/><button type="submit">Søk</button></form><div id="ms-result" class="ms-result hidden"></div><div class="ms-chips"><button type="button" data-ms="Hva er mitt dyreste abonnement?">Dyreste abonnement</button><button type="button" data-ms="Hvor mye har jeg i faste kostnader?">Faste kostnader</button><button type="button" data-ms="Hvor mye brukte jeg forrige måned?">Forrige måned</button></div>`;
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
      const matches=months.filter(x=>Number(String(x.month).slice(5,7))===num && (!explicitYear||String(x.month).startsWith(explicitYear)));
      return matches[0]??null;
    }
  }
  return null;
}
function findCategory(q){for(const group of categoryAliases){if(group.keys.some(k=>q.includes(k)))return group.names}return null}
function result(title,value,copy){const root=document.getElementById('ms-result');root.classList.remove('hidden');root.innerHTML=`<div><span>${msEsc(title)}</span><strong>${msEsc(value)}</strong><p>${msEsc(copy)}</p></div>`}
function runSearch(raw){
  const q=String(raw??'').trim().toLowerCase();if(!q||!msData)return;
  const fixed=[...(msData.fixed_costs??[])].sort((a,b)=>msN(b.monthly_amount)-msN(a.monthly_amount));
  if(/dyrest.*abonnement|dyreste abonnement|største.*fast/i.test(q)){
    const x=fixed[0];if(x){result('Dyreste faste kostnad',`${x.name} · ${msKr(x.monthly_amount)}/mnd`,`${msKr(msN(x.monthly_amount)*12)} per år hvis kostnaden fortsetter.`);return}
  }
  if(/faste kostnader|abonnement.*totalt|fast.*per måned/i.test(q)){
    const total=fixed.reduce((s,x)=>s+msN(x.monthly_amount),0);result('Bekreftede faste kostnader',`${msKr(total)} / mnd`,`${msKr(total*12)} per år. Kun bekreftede faste kostnader er med.`);return;
  }
  if(/hvor mye.*har jeg|saldo|penger totalt/i.test(q) && !/brukt/i.test(q)){
    result('Penger totalt nå',msKr(msData.overview?.total_balance),'Alle aktive kontoer i MoneyOS, inkludert penger som holdes utenfor daglig forbruk.');return;
  }
  if(/japan/.test(q)&&/fri|fleksibel|andre ting|sosial/i.test(q)){
    const cats=msData.japan_plan?.budget?.living_categories??[];const flex=cats.filter(x=>x.kind==='flexible').reduce((s,x)=>s+msN(x.amount_jpy),0);const f=new Intl.NumberFormat('nb-NO',{maximumFractionDigits:0});result('Japan · fri pott',`¥${f.format(flex)} / mnd`,`Omtrent ¥${f.format(flex/30*7)} per uke i den nåværende planen.`);return;
  }
  const month=findMonth(q);
  if(month){
    const cats=findCategory(q);
    if(cats){
      const amount=cats.reduce((s,name)=>s+msN(month.categories?.[name]),0);result(`${msMonthFmt.format(msMonthDate(month.month))} · ${cats.join(' + ')}`,msKr(amount),'Beløpet kommer fra månedens kategorisammendrag. Interne overføringer er ikke ment å telle som forbruk.');return;
    }
    if(/brukt|utgifter|forbruk/i.test(q)){result(msMonthFmt.format(msMonthDate(month.month)),msKr(month.expenses),`Bokførte utgifter. Inntekter samme måned: ${msKr(month.income)}.`);return}
    if(/inntekt|fikk inn|penger inn/i.test(q)){result(`${msMonthFmt.format(msMonthDate(month.month))} · inn`,msKr(month.income),`Netto den måneden var ${msKr(month.net)}.`);return}
  }
  result('Fant ikke et sikkert svar','—','Prøv for eksempel «hvor mye brukte jeg på mat i juli?», «hva er mitt dyreste abonnement?» eller «hvor mye har jeg i faste kostnader?». MoneyOS svarer ikke når spørsmålet ikke kan beregnes sikkert fra dataene som er tilgjengelige.');
}
async function loadMoneySearch(){if(msLoading)return;const app=document.getElementById('app');if(!app||app.classList.contains('hidden'))return;msLoading=true;try{const r=await fetch('/api/dashboard',{credentials:'same-origin',cache:'no-store'});if(!r.ok)return;msData=await r.json();ensureSearch()}finally{msLoading=false}}
function bootMoneySearch(){const app=document.getElementById('app');if(!app)return;const run=()=>{if(!app.classList.contains('hidden'))loadMoneySearch()};run();new MutationObserver(run).observe(app,{attributes:true,attributeFilter:['class']});document.addEventListener('keydown',e=>{if(e.key==='k'&&(e.ctrlKey||e.metaKey)){e.preventDefault();document.getElementById('ms-input')?.focus()}})}
bootMoneySearch();

import { neon } from '@neondatabase/serverless';
import { isAuthenticated } from '../lib/auth.js';

const monthPattern=/^\d{4}-(0[1-9]|1[0-2])$/;
const MAX=10_000_000;
function money(v){const n=Number(v??0);return Number.isFinite(n)?Math.max(0,Math.min(MAX,Math.round(n*100)/100)):0;}
function text(v,max=80){return String(v??'').trim().slice(0,max);}
function monthOr(v,fallback){const s=text(v,7);return monthPattern.test(s)?s:fallback;}
function nextMonth(month){const[y,m]=month.split('-').map(Number);const d=new Date(Date.UTC(y,m,1));return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}`;}
function median(values){const a=values.filter(Number.isFinite).sort((x,y)=>x-y);if(!a.length)return 0;const i=Math.floor(a.length/2);return a.length%2?a[i]:(a[i-1]+a[i])/2;}
function defaultBucket(name){if(['Refusjoner og delte utgifter','Sparing'].includes(name))return'excluded';if(['Digitale tjenester','Mobil og internett','Forsikring','Bolig'].includes(name))return'fixed';if(['Dagligvarer','Transport','Helse','Utdanning','Bank og gebyrer'].includes(name))return'essential';return'flex';}
function validDate(v){const s=text(v,10);return /^\d{4}-\d{2}-\d{2}$/.test(s)?s:null;}
function fundContribution(fund,month){const target=money(fund?.target_amount_nok),saved=money(fund?.saved_nok),remaining=Math.max(0,target-saved);if(fund?.is_active===false||remaining<=0)return 0;if(fund?.monthly_nok!=null&&Number(fund.monthly_nok)>0)return money(fund.monthly_nok);const td=validDate(fund?.target_date);if(!td)return 0;const[y,m]=month.split('-').map(Number),[ty,tm]=td.slice(0,7).split('-').map(Number);const months=Math.max(1,(ty-y)*12+(tm-m)+1);return Math.ceil(remaining/months*100)/100;}
async function configRow(sql){const rows=await sql`SELECT id,COALESCE(extracted_summary,'{}'::jsonb) AS summary FROM documents WHERE document_type='moneyos_config' AND source_name='MoneyOS private config' ORDER BY document_date DESC NULLS LAST,created_at DESC LIMIT 1`;return rows[0]??null;}
async function latestSalary(sql){const rows=await sql`SELECT t.id::text AS id,t.transaction_date,ROUND(t.amount::numeric,2) AS amount,t.merchant,t.description FROM transactions t WHERE t.transaction_type='income' AND COALESCE(t.is_pending,false)=false AND lower(COALESCE(t.description,'')) LIKE '%lønn%' ORDER BY t.transaction_date DESC,t.id DESC LIMIT 1`;return rows[0]??null;}
async function salaryById(sql,id){const rows=await sql`SELECT t.id::text AS id,t.transaction_date,ROUND(t.amount::numeric,2) AS amount,t.merchant,t.description FROM transactions t WHERE t.id::text=${id} AND t.transaction_type='income' AND COALESCE(t.is_pending,false)=false AND lower(COALESCE(t.description,'')) LIKE '%lønn%' LIMIT 1`;return rows[0]??null;}
async function recentIncomes(sql){return sql`SELECT t.id::text AS id,t.transaction_date,ROUND(t.amount::numeric,2) AS amount,t.merchant,t.description FROM transactions t WHERE t.transaction_type='income' AND COALESCE(t.is_pending,false)=false AND t.transaction_date>=CURRENT_DATE-interval '120 days' ORDER BY t.transaction_date DESC,t.id DESC LIMIT 20`;}

async function buildMonth(sql,config,month){
  const categoriesRows=await sql`SELECT name FROM categories ORDER BY name`;
  const categories=categoriesRows.map(x=>x.name);
  const [historyRows,recurringRows,dashboardRows,salary,incomeRows]=await Promise.all([
    sql`SELECT extracted_summary->'monthly' AS monthly FROM documents WHERE extracted_summary ? 'monthly' ORDER BY document_date DESC NULLS LAST,created_at DESC LIMIT 1`,
    sql`SELECT r.name,r.amount,r.cadence,r.next_due_date,ROUND((CASE r.cadence WHEN 'daily' THEN r.amount*365.25/12 WHEN 'weekly' THEN r.amount*52/12 WHEN 'biweekly' THEN r.amount*26/12 WHEN 'monthly' THEN r.amount WHEN 'quarterly' THEN r.amount/3 WHEN 'yearly' THEN r.amount/12 ELSE r.amount END)::numeric,2) AS monthly_amount FROM recurring_items r WHERE r.item_type='expense' AND r.is_active=true`,
    sql`SELECT finance_dashboard() AS dashboard`,
    latestSalary(sql),
    recentIncomes(sql)
  ]);
  const historical=historyRows[0]?.monthly??{};
  const historyMonths=Object.keys(historical).filter(k=>monthPattern.test(k)&&k<month).sort().reverse().slice(0,6);
  const system=config.summary?.budget_system??{};
  const plan=system.month_plans?.[month]??null;
  let essential=0;
  const categoryDetail=[];
  for(const name of categories){
    const saved=plan?.category_targets?.[name];
    const bucket=['fixed','essential','flex','excluded'].includes(saved?.bucket)?saved.bucket:defaultBucket(name);
    const suggestion=Math.round(median(historyMonths.map(k=>Number(historical?.[k]?.expenses?.[name]??0)))*100)/100;
    const target=saved?money(saved.target_nok):(bucket==='essential'?money(suggestion):0);
    if(bucket==='essential')essential+=target;
    categoryDetail.push({name,bucket,target_nok:target,suggested_nok:money(suggestion)});
  }
  const fixed=recurringRows.reduce((s,x)=>s+Number(x.monthly_amount??0),0);
  const funds=Array.isArray(system.sinking_funds)?system.sinking_funds:[];
  const sinking=funds.reduce((s,f)=>s+fundContribution(f,month),0);
  const savings=money(plan?.savings_target_nok);
  const planningIncome=plan?.planning_income_nok==null?null:money(plan.planning_income_nok);
  const flex=planningIncome==null?0:Math.max(0,planningIncome-fixed-essential-sinking-savings);
  const minimum=fixed+essential;
  const robust=minimum+sinking;
  const full=robust+savings+flex;
  const funding=system.funding?.allocations??{};
  const funded=money(funding?.[month]?.funded_nok);
  const currentMonth=new Date().toISOString().slice(0,7);
  const activeFunding=Object.entries(funding).filter(([key,value])=>monthPattern.test(key)&&key>currentMonth&&money(value?.funded_nok)>0);
  const allAllocated=activeFunding.reduce((s,[,x])=>s+money(x?.funded_nok),0);
  const dashboard=dashboardRows[0]?.dashboard??{};
  const safe=money(dashboard?.overview?.safe_to_spend);
  const available=Math.max(0,safe-allAllocated);
  const incomeAllocations=system.funding?.income_allocations??{};
  const latestSalaryInfo=salary?{id:String(salary.id),transaction_date:salary.transaction_date,amount_nok:money(salary.amount),merchant:salary.merchant??null,description:salary.description??null,already_allocated:!!incomeAllocations[String(salary.id)],allocation:incomeAllocations[String(salary.id)]??null}:null;
  const recentIncome=incomeRows.map(row=>{const assignment=incomeAllocations[String(row.id)]??null;return{id:String(row.id),transaction_date:row.transaction_date,amount_nok:money(row.amount),merchant:row.merchant??null,description:row.description??null,explicit_assignment:assignment?{target_month:assignment.target_month??null,reserved_nok:money(assignment.reserved_nok),left_unassigned_nok:money(assignment.left_unassigned_nok),allocated_at:assignment.allocated_at??null}:null};});
  const fundingByMonth=activeFunding.sort(([a],[b])=>a.localeCompare(b)).map(([key,value])=>({month:key,funded_nok:money(value?.funded_nok),source:value?.source??null,updated_at:value?.updated_at??null}));
  const tiers={
    minimum:{goal_nok:money(minimum),funded_nok:Math.min(funded,minimum)},
    true_expenses:{goal_nok:money(sinking),funded_nok:Math.min(Math.max(0,funded-minimum),sinking)},
    savings:{goal_nok:money(savings),funded_nok:Math.min(Math.max(0,funded-robust),savings)},
    flex:{goal_nok:money(flex),funded_nok:Math.min(Math.max(0,funded-robust-savings),flex)}
  };
  return{month,plan_saved:!!plan,planning_income_nok:planningIncome,fixed_nok:money(fixed),essential_nok:money(essential),sinking_nok:money(sinking),savings_nok:savings,flex_nok:money(flex),minimum_month_nok:money(minimum),robust_month_nok:money(robust),full_month_nok:money(full),funded_nok:funded,remaining_to_minimum_nok:money(Math.max(0,minimum-funded)),remaining_to_robust_nok:money(Math.max(0,robust-funded)),remaining_to_full_nok:money(Math.max(0,full-funded)),funded_percent_full:full>0?Math.min(100,Math.round(funded/full*1000)/10):0,tiers,available_to_allocate_nok:available,ready_to_assign_nok:money(available),safe_to_spend_before_funding_nok:safe,base_safe_to_spend_nok:safe,total_future_funding_nok:money(allAllocated),reserved_future_nok:money(allAllocated),overcommitted_nok:money(Math.max(0,allAllocated-safe)),funding_by_month:fundingByMonth,recent_income:recentIncome,latest_salary:latestSalaryInfo,category_detail,history_months_used:historyMonths};
}
function previewAllocation(model,amount){
  let left=money(amount);const steps=[];
  const defs=[['minimum','Minimum måned',model.remaining_to_minimum_nok],['true_expenses','True expenses',Math.max(0,model.remaining_to_robust_nok-model.remaining_to_minimum_nok)],['savings','Spare-/reserve-mål',Math.max(0,model.savings_nok-model.tiers.savings.funded_nok)],['flex','Fri pott',Math.max(0,model.flex_nok-model.tiers.flex.funded_nok)]];
  for(const[key,label,needRaw]of defs){const need=money(needRaw);const use=Math.min(left,need);steps.push({key,label,needed_nok:need,allocated_nok:money(use)});left-=use;}
  return{amount_nok:money(amount),reserved_nok:money(amount-left),left_unassigned_nok:money(left),steps};
}

export default async function handler(req,res){
  res.setHeader('Cache-Control','private, no-store, max-age=0');res.setHeader('Pragma','no-cache');
  try{
    if(!isAuthenticated(req))return res.status(401).json({error:'Unauthorized'});
    if(!process.env.DATABASE_URL)throw new Error('DATABASE_URL is not configured');
    const sql=neon(process.env.DATABASE_URL);const config=await configRow(sql);if(!config)return res.status(500).json({error:'MoneyOS-konfigurasjonen mangler'});
    const nowMonth=new Date().toISOString().slice(0,7);const month=monthOr(req.method==='GET'?req.query?.month:req.body?.month,nextMonth(nowMonth));
    const model=await buildMonth(sql,config,month);
    if(req.method==='GET'){
      const amount=Math.min(money(req.query?.amount_nok),model.available_to_allocate_nok);return res.status(200).json({...model,allocation_preview:amount>0?previewAllocation(model,amount):null});
    }
    if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
    const action=text(req.body?.action,30);
    const current=config.summary?.budget_system??{};const funding={...(current.funding??{}),allocations:{...(current.funding?.allocations??{})},income_allocations:{...(current.funding?.income_allocations??{})}};
    if(action!=='clear_funding'&&month<=nowMonth)return res.status(409).json({error:'MoneyOS reserverer bare penger til fremtidige måneder. Inneværende måned er allerede aktiv.'});
    if(action==='set_funding'){
      const requested=money(req.body?.funded_nok);const existing=money(funding.allocations?.[month]?.funded_nok);const otherTotal=Object.entries(funding.allocations).filter(([k])=>k!==month&&monthPattern.test(k)&&k>nowMonth).reduce((s,[,x])=>s+money(x?.funded_nok),0);const safe=money(model.safe_to_spend_before_funding_nok);const maxAllowed=Math.max(existing,Math.max(0,safe-otherTotal));if(requested>maxAllowed+0.01)return res.status(409).json({error:`Bare ${Math.round(maxAllowed)} kr kan reserveres uten å bruke penger MoneyOS allerede trenger.`});
      funding.allocations[month]={funded_nok:requested,updated_at:new Date().toISOString(),source:'manual'};
    }else if(action==='allocate_amount'){
      const amount=money(req.body?.amount_nok);if(amount<=0)return res.status(400).json({error:'Beløpet må være større enn 0'});const preview=previewAllocation(model,Math.min(amount,model.available_to_allocate_nok));const existing=money(funding.allocations?.[month]?.funded_nok);funding.allocations[month]={funded_nok:money(existing+preview.reserved_nok),updated_at:new Date().toISOString(),source:'priority_allocation'};
    }else if(action==='allocate_salary'){
      const transactionId=text(req.body?.transaction_id,128);if(!transactionId)return res.status(400).json({error:'Mangler lønnstransaksjon'});if(funding.income_allocations[transactionId])return res.status(409).json({error:'Denne lønnen er allerede fordelt i MoneyOS'});const salary=await salaryById(sql,transactionId);if(!salary)return res.status(404).json({error:'Fant ikke en bokført lønnsutbetaling'});const amount=Math.min(money(salary.amount),model.available_to_allocate_nok);const preview=previewAllocation(model,amount);if(preview.reserved_nok<=0)return res.status(409).json({error:'Ingen ledige penger kan reserveres til denne måneden nå'});const existing=money(funding.allocations?.[month]?.funded_nok);funding.allocations[month]={funded_nok:money(existing+preview.reserved_nok),updated_at:new Date().toISOString(),source:'salary_priority'};funding.income_allocations[transactionId]={target_month:month,salary_amount_nok:money(salary.amount),reserved_nok:preview.reserved_nok,left_unassigned_nok:money(money(salary.amount)-preview.reserved_nok),allocated_at:new Date().toISOString()};
    }else if(action==='clear_funding'){
      delete funding.allocations[month];for(const[id,entry]of Object.entries(funding.income_allocations)){if(entry?.target_month===month)delete funding.income_allocations[id];}
    }else return res.status(400).json({error:'Ukjent handling'});
    const next={...current,version:Math.max(3,Number(current.version??1)),funding,updated_at:new Date().toISOString()};
    await sql`UPDATE documents SET extracted_summary=jsonb_set(COALESCE(extracted_summary,'{}'::jsonb),'{budget_system}',${JSON.stringify(next)}::jsonb,true) WHERE id=${config.id}`;
    const updatedConfig={...config,summary:{...config.summary,budget_system:next}};const updated=await buildMonth(sql,updatedConfig,month);return res.status(200).json({ok:true,...updated});
  }catch(error){console.error(error);return res.status(500).json({error:'Kunne ikke oppdatere finansieringen'});}
}

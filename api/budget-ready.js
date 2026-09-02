import { neon } from '@neondatabase/serverless';
import { isAuthenticated } from '../lib/auth.js';

const monthPattern=/^\d{4}-(0[1-9]|1[0-2])$/;
function money(v){const n=Number(v??0);return Number.isFinite(n)?Math.max(0,Math.round(n*100)/100):0;}
async function configRow(sql){const rows=await sql`SELECT COALESCE(extracted_summary,'{}'::jsonb) AS summary FROM documents WHERE document_type='moneyos_config' AND source_name='MoneyOS private config' ORDER BY document_date DESC NULLS LAST,created_at DESC LIMIT 1`;return rows[0]?.summary??{};}

export default async function handler(req,res){
  res.setHeader('Cache-Control','private, no-store, max-age=0');
  res.setHeader('Pragma','no-cache');
  try{
    if(!isAuthenticated(req))return res.status(401).json({error:'Unauthorized'});
    if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
    if(!process.env.DATABASE_URL)throw new Error('DATABASE_URL is not configured');
    const sql=neon(process.env.DATABASE_URL);
    const [dashboardRows,config,incomeRows]=await Promise.all([
      sql`SELECT finance_dashboard() AS dashboard`,
      configRow(sql),
      sql`
        SELECT t.id::text AS id,t.transaction_date,ROUND(t.amount::numeric,2) AS amount,t.merchant,t.description
        FROM transactions t
        WHERE t.transaction_type='income' AND COALESCE(t.is_pending,false)=false
          AND t.transaction_date>=CURRENT_DATE-interval '120 days'
        ORDER BY t.transaction_date DESC,t.id DESC
        LIMIT 20
      `
    ]);
    const dashboard=dashboardRows[0]?.dashboard??{};
    const baseSafe=money(dashboard?.overview?.safe_to_spend);
    const currentMonth=new Date().toISOString().slice(0,7);
    const system=config?.budget_system??{};
    const allocations=system?.funding?.allocations??{};
    const reservedFuture=Object.entries(allocations)
      .filter(([month])=>monthPattern.test(month)&&month>=currentMonth)
      .reduce((sum,[,value])=>sum+money(value?.funded_nok),0);
    const ready=Math.max(0,baseSafe-reservedFuture);
    const incomeAllocations=system?.funding?.income_allocations??{};
    const recentIncome=incomeRows.map(row=>{
      const assignment=incomeAllocations[String(row.id)]??null;
      return{
        id:String(row.id),
        transaction_date:row.transaction_date,
        amount_nok:money(row.amount),
        merchant:row.merchant??null,
        description:row.description??null,
        explicit_assignment:assignment?{
          target_month:assignment.target_month??null,
          reserved_nok:money(assignment.reserved_nok),
          left_unassigned_nok:money(assignment.left_unassigned_nok),
          allocated_at:assignment.allocated_at??null
        }:null
      };
    });
    const futureMonths=Object.entries(allocations)
      .filter(([month])=>monthPattern.test(month)&&month>=currentMonth&&money(arguments[1]?.funded_nok)>0);
    const fundingByMonth=Object.entries(allocations)
      .filter(([month,value])=>monthPattern.test(month)&&month>=currentMonth&&money(value?.funded_nok)>0)
      .sort(([a],[b])=>a.localeCompare(b))
      .map(([month,value])=>({month,funded_nok:money(value?.funded_nok),source:value?.source??null,updated_at:value?.updated_at??null}));
    return res.status(200).json({
      ready_to_assign_nok:money(ready),
      base_safe_to_spend_nok:baseSafe,
      reserved_future_nok:money(reservedFuture),
      overcommitted_nok:money(Math.max(0,reservedFuture-baseSafe)),
      definition:'safe_to_spend_after_future_budget_reservations',
      funding_by_month:fundingByMonth,
      recent_income:recentIncome
    });
  }catch(error){console.error(error);return res.status(500).json({error:'Kunne ikke hente ufordelte penger'});}
}

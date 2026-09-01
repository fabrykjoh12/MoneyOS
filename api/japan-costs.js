import { randomUUID } from 'node:crypto';
import { neon } from '@neondatabase/serverless';
import { isAuthenticated } from '../lib/auth.js';

const statuses=['missing','budget','confirmed','paid'];
const currencies=['NOK','JPY'];
function text(v,max=160){return String(v??'').trim().slice(0,max)}
function date(v){const s=text(v,10);return /^\d{4}-\d{2}-\d{2}$/.test(s)?s:null}
function amount(v){const n=Number(v);return Number.isFinite(n)&&n>=0?Math.round(n*100)/100:0}
async function configRow(sql){const rows=await sql`SELECT id,COALESCE(extracted_summary,'{}'::jsonb) AS summary FROM documents WHERE document_type='moneyos_config' AND source_name='MoneyOS private config' ORDER BY document_date DESC NULLS LAST,created_at DESC LIMIT 1`;return rows[0]??null}
function mergedCosts(summary){
  const japan=summary?.japan??{},saved=Array.isArray(japan.one_time_costs)?japan.one_time_costs:[],legacy=Array.isArray(japan.budget?.unpriced)?japan.budget.unpriced:[];
  const byName=new Map(saved.map(x=>[text(x?.name).toLowerCase(),x]));
  const out=[...saved];
  for(const name of legacy){if(!byName.has(text(name).toLowerCase()))out.push({id:`legacy:${text(name).toLowerCase().replace(/[^a-z0-9æøå]+/gi,'-').slice(0,80)}`,name,status:'missing',amount:0,currency:'NOK',due_date:null,legacy:true})}
  return out;
}
export default async function handler(req,res){
  res.setHeader('Cache-Control','private, no-store, max-age=0');res.setHeader('Pragma','no-cache');
  try{
    if(!isAuthenticated(req))return res.status(401).json({error:'Unauthorized'});if(!process.env.DATABASE_URL)throw new Error('DATABASE_URL is not configured');
    const sql=neon(process.env.DATABASE_URL),config=await configRow(sql);if(!config)return res.status(500).json({error:'MoneyOS-konfigurasjonen mangler'});
    if(req.method==='GET')return res.status(200).json({costs:mergedCosts(config.summary)});
    if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
    const id=text(req.body?.id,100);const name=text(req.body?.name,160);const status=text(req.body?.status,20);const currency=text(req.body?.currency,3);const value=amount(req.body?.amount);const due=date(req.body?.due_date);
    if(!name)return res.status(400).json({error:'Kostnaden må ha et navn'});if(!statuses.includes(status))return res.status(400).json({error:'Ugyldig status'});if(!currencies.includes(currency))return res.status(400).json({error:'Ugyldig valuta'});
    if(['budget','confirmed','paid'].includes(status)&&value<=0)return res.status(400).json({error:'Legg inn beløpet'});if(['budget','confirmed'].includes(status)&&!due)return res.status(400).json({error:'Velg når kostnaden skal betales'});
    const japan=config.summary?.japan??{},old=Array.isArray(japan.one_time_costs)?japan.one_time_costs:[];
    const realId=id&&!id.startsWith('legacy:')?id:randomUUID();
    const item={id:realId,name,status,amount:value,currency,due_date:due,updated_at:new Date().toISOString()};
    const next=[item,...old.filter(x=>String(x?.id)!==realId&&text(x?.name).toLowerCase()!==name.toLowerCase())];
    const nextSummary={...config.summary,japan:{...japan,one_time_costs:next}};
    await sql`UPDATE documents SET extracted_summary=${JSON.stringify(nextSummary)}::jsonb WHERE id=${config.id}`;
    return res.status(200).json({ok:true,costs:mergedCosts(nextSummary)});
  }catch(error){console.error(error);return res.status(500).json({error:'Kunne ikke lagre Japan-kostnaden'})}
}

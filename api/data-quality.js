import { neon } from '@neondatabase/serverless';
import { isAuthenticated } from '../lib/auth.js';

async function configRow(sql) {
  const rows = await sql`
    SELECT id, COALESCE(extracted_summary, '{}'::jsonb) AS summary
    FROM documents
    WHERE document_type = 'moneyos_config' AND source_name = 'MoneyOS private config'
    ORDER BY document_date DESC NULLS LAST, created_at DESC
    LIMIT 1
  `;
  return rows[0] ?? null;
}

function text(v){ return String(v ?? '').trim(); }
function matchesRule(row, rule){
  const needle=text(rule?.match_text).toLowerCase();
  if(needle.length < 3) return false;
  const hay=`${row.merchant ?? ''} ${row.description ?? ''}`.toLowerCase();
  return hay.includes(needle);
}

export default async function handler(req,res){
  res.setHeader('Cache-Control','private, no-store, max-age=0');
  res.setHeader('Pragma','no-cache');
  try{
    if(!isAuthenticated(req)) return res.status(401).json({error:'Unauthorized'});
    if(!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not configured');
    const sql=neon(process.env.DATABASE_URL);
    const config=await configRow(sql);
    if(!config) return res.status(500).json({error:'MoneyOS-konfigurasjonen mangler'});
    const rules=Array.isArray(config.summary?.merchant_rules)?config.summary.merchant_rules:[];

    if(req.method==='GET'){
      const rows=await sql`
        SELECT t.id::text AS id,t.transaction_date,ROUND(t.amount::numeric,2) AS amount,t.merchant,t.description,t.transaction_type,
          COALESCE(t.is_pending,false) AS is_pending,COALESCE(c.name,'Annet') AS category,a.name AS account
        FROM transactions t
        JOIN accounts a ON a.id=t.account_id
        LEFT JOIN categories c ON c.id=t.category_id
        WHERE t.transaction_date >= CURRENT_DATE - interval '18 months'
        ORDER BY t.transaction_date DESC,t.id DESC
        LIMIT 800
      `;
      const issues=[];
      for(const row of rows){
        if(row.transaction_type!=='expense') continue;
        if(row.is_pending){
          if(!text(row.merchant) && Number(row.amount)>=1000) issues.push({type:'pending_unknown',severity:'wait',id:row.id,title:`Ukjent reservert betaling · ${Number(row.amount).toFixed(2)} kr`,copy:'Vent til banken bokfører den før du retter merchant eller kategori.',transaction:row});
          continue;
        }
        if(!text(row.merchant)) issues.push({type:'missing_merchant',severity:'fix',id:row.id,title:'Merchant mangler',copy:`${Number(row.amount).toFixed(2)} kr · ${row.category} · ${row.account}`,transaction:row});
        else if(row.category==='Annet' && Number(row.amount)>=300) issues.push({type:'generic_category',severity:'fix',id:row.id,title:`${row.merchant} ligger i Annet`,copy:`${Number(row.amount).toFixed(2)} kr · vurder en mer presis kategori.`,transaction:row});

        const rule=rules.find(r=>matchesRule(row,r));
        if(rule){
          const merchantMismatch=text(rule.merchant) && text(row.merchant)!==text(rule.merchant);
          const categoryMismatch=text(rule.category) && text(row.category)!==text(rule.category);
          const typeMismatch=text(rule.transaction_type) && text(row.transaction_type)!==text(rule.transaction_type);
          if(merchantMismatch||categoryMismatch||typeMismatch) issues.push({type:'rule_mismatch',severity:'auto',id:row.id,title:`Lagret regel kan rydde ${row.merchant||'transaksjonen'}`,copy:`Match «${rule.match_text}» → ${rule.merchant||row.merchant} · ${rule.category||row.category}`,transaction:row,rule});
        }
      }
      const priority={auto:0,fix:1,wait:2};
      issues.sort((a,b)=>(priority[a.severity]??9)-(priority[b.severity]??9)||String(b.transaction?.transaction_date||'').localeCompare(String(a.transaction?.transaction_date||'')));
      return res.status(200).json({issues:issues.slice(0,40),counts:{total:issues.length,auto:issues.filter(x=>x.severity==='auto').length,fix:issues.filter(x=>x.severity==='fix').length,wait:issues.filter(x=>x.severity==='wait').length},rules:rules.length});
    }

    if(req.method==='POST'){
      if(req.body?.action!=='apply_rules') return res.status(400).json({error:'Ukjent handling'});
      let updated=0;
      const categoryRows=await sql`SELECT id,name FROM categories`;
      const categoryMap=new Map(categoryRows.map(row=>[row.name,row.id]));
      for(const rule of rules){
        const needle=text(rule?.match_text); if(needle.length<3) continue;
        const categoryId=categoryMap.get(rule.category); if(!categoryId) continue;
        const type=['expense','income','transfer'].includes(rule.transaction_type)?rule.transaction_type:'expense';
        const changed=await sql`
          UPDATE transactions
          SET merchant=${text(rule.merchant)||null},category_id=${categoryId},transaction_type=${type}
          WHERE COALESCE(is_pending,false)=false
            AND lower(COALESCE(merchant,'') || ' ' || COALESCE(description,'')) LIKE ${'%'+needle.toLowerCase()+'%'}
            AND (COALESCE(merchant,'') IS DISTINCT FROM ${text(rule.merchant)} OR category_id IS DISTINCT FROM ${categoryId} OR transaction_type IS DISTINCT FROM ${type})
          RETURNING id
        `;
        updated+=changed.length;
      }
      return res.status(200).json({ok:true,updated});
    }

    return res.status(405).json({error:'Method not allowed'});
  }catch(error){console.error(error);return res.status(500).json({error:'Kunne ikke kontrollere datakvaliteten'});}
}

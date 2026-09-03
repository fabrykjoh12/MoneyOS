import { neon } from '@neondatabase/serverless';
import { isAuthenticated } from '../lib/auth.js';

const japanKeys = ['food','mobile','nhi','transport','household','social','trips','study','bank'];
function monthBounds(month) {
  const [year, mon] = month.split('-').map(Number);
  const start = new Date(Date.UTC(year, mon - 1, 1));
  const end = new Date(Date.UTC(year, mon, 0));
  const iso = d => d.toISOString().slice(0, 10);
  return { start: iso(start), end: iso(end) };
}
function todayIso(){ return new Date().toISOString().slice(0,10); }
function exactJpy(description){
  const m=String(description||'').match(/\bJPY\s*([\d.,]+)/i);
  if(!m)return null;
  const token=m[1].replace(/([.,])00$/,'').replace(/[^\d]/g,'');
  const value=Number(token);
  return Number.isFinite(value)&&value>0?value:null;
}
function cleanKey(value){const key=String(value??'').trim();return japanKeys.includes(key)?key:null;}
async function getConfig(sql){
  const rows=await sql`
    SELECT id,COALESCE(extracted_summary,'{}'::jsonb) AS summary
    FROM documents
    WHERE document_type='moneyos_config' AND source_name='MoneyOS private config'
    ORDER BY document_date DESC NULLS LAST,created_at DESC LIMIT 1
  `;
  return rows[0]??null;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('Pragma', 'no-cache');

  try {
    if (!isAuthenticated(req)) return res.status(401).json({ error: 'Unauthorized' });
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not configured');
    const sql = neon(process.env.DATABASE_URL);
    const config=await getConfig(sql);
    if(!config) return res.status(500).json({error:'MoneyOS-konfigurasjonen mangler'});
    const japan=config.summary?.japan??{},budget=japan.budget??{};
    const arrival=String(japan.arrival_date??budget.period_start??'2026-09-07').slice(0,10);
    const stayEnd=String(budget.period_end??arrival).slice(0,10);
    const map=config.summary?.japan_transaction_map&&typeof config.summary.japan_transaction_map==='object'?config.summary.japan_transaction_map:{};

    if(req.method==='POST'){
      const action=String(req.body?.action??'');
      if(action!=='classify_transaction')return res.status(400).json({error:'Ukjent handling'});
      const id=String(req.body?.transaction_id??'').trim(),include=req.body?.include===true,categoryKey=include?cleanKey(req.body?.category_key):null;
      if(!id||id.length>128)return res.status(400).json({error:'Ugyldig transaksjon'});
      if(include&&!categoryKey)return res.status(400).json({error:'Velg hvilken Japan-pott kjøpet tilhører'});
      const rows=await sql`
        SELECT id::text AS id,transaction_date,transaction_type,COALESCE(is_pending,false) AS is_pending
        FROM transactions WHERE id::text=${id} LIMIT 1
      `;
      const tx=rows[0];if(!tx)return res.status(404).json({error:'Transaksjonen finnes ikke'});
      const txDate=String(tx.transaction_date).slice(0,10);
      if(tx.is_pending)return res.status(409).json({error:'Vent til bankposten er bokført'});
      if(tx.transaction_type!=='expense')return res.status(409).json({error:'Bare bokførte utgifter kan klassifiseres som Japan-kjøp'});
      if(txDate<arrival||txDate>stayEnd)return res.status(409).json({error:'Transaksjonen ligger utenfor Japan-oppholdet'});
      const next={...map,[id]:{status:include?'include':'exclude',category_key:categoryKey,updated_at:new Date().toISOString()}};
      await sql`UPDATE documents SET extracted_summary=jsonb_set(COALESCE(extracted_summary,'{}'::jsonb),'{japan_transaction_map}',${JSON.stringify(next)}::jsonb,true) WHERE id=${config.id}`;
      return res.status(200).json({ok:true,transaction_id:id,status:include?'include':'exclude',category_key:categoryKey});
    }
    if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});

    const scope=String(req.query?.scope??'month');
    let periodStart,periodEnd,month=null;
    if(scope==='stay'){
      periodStart=arrival;
      periodEnd=[todayIso(),stayEnd].sort()[0];
    }else{
      month=String(req.query?.month??new Date().toISOString().slice(0,7));
      if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))return res.status(400).json({error:'Ugyldig måned'});
      const bounds=monthBounds(month);
      periodStart=bounds.start<arrival&&arrival.slice(0,7)===month?arrival:bounds.start;
      periodEnd=bounds.end>stayEnd?stayEnd:bounds.end;
    }

    const rows=periodStart<=periodEnd?await sql`
      SELECT t.id::text AS id,t.transaction_date,ROUND(t.amount::numeric,2) AS amount_nok,t.merchant,t.description,
        COALESCE(c.name,'Annet') AS category,a.name AS account
      FROM transactions t JOIN accounts a ON a.id=t.account_id LEFT JOIN categories c ON c.id=t.category_id
      WHERE t.transaction_type='expense' AND COALESCE(t.is_pending,false)=false
        AND t.transaction_date>=${periodStart} AND t.transaction_date<=${periodEnd}
      ORDER BY t.transaction_date DESC,t.id DESC
    `:[];

    const included=[],review=[];
    for(const row of rows){
      const rule=map?.[row.id]??null,jpy=exactJpy(row.description);
      if(rule?.status==='exclude')continue;
      if(rule?.status==='include'){
        included.push({...row,source:'bank',classification:'explicit',category_key:cleanKey(rule.category_key),amount_jpy:jpy});
      }else if(jpy!==null){
        included.push({...row,source:'bank',classification:'auto_jpy',category_key:null,amount_jpy:jpy});
      }else{
        review.push({...row,source:'bank',classification:'review'});
      }
    }

    const walletLedger=Array.isArray(japan.wallets?.ledger)?japan.wallets.ledger:[];
    const walletExpenses=walletLedger.filter(item=>item?.type==='expense'&&item?.date>=periodStart&&item?.date<=periodEnd).map(item=>({
      id:`wallet-${item.id}`,transaction_date:item.date,amount_nok:null,amount_jpy:Number(item.amount_jpy??0),merchant:item.note||'Manuelt Japan-kjøp',
      description:item.note||'',category:null,category_key:cleanKey(item.category_key)||'household',account:item.wallet==='icoca'?'ICOCA':'Kontanter',source:'wallet',classification:'wallet'
    }));
    const transactions=[...included,...walletExpenses].sort((a,b)=>String(b.transaction_date).localeCompare(String(a.transaction_date)));

    return res.status(200).json({
      scope,month,arrival_date:arrival,stay_end:stayEnd,period_start:periodStart,period_end:periodEnd,
      planning_rate:budget.planning_rate??null,living_categories:budget.living_categories??[],transactions,review_candidates:review,
      classification_summary:{included_bank:included.length,wallet:walletExpenses.length,needs_review:review.length}
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Kunne ikke hente Japan-forbruk' });
  }
}

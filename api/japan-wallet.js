import { randomUUID } from 'node:crypto';
import { neon } from '@neondatabase/serverless';
import { isAuthenticated } from '../lib/auth.js';

const walletNames = ['cash', 'icoca'];
const categoryKeys = ['food','mobile','nhi','transport','household','social','trips','study','bank'];
const tripBuckets = ['transport','stay','food','activities','other'];
function n(value){ const x=Number(value); return Number.isFinite(x)?Math.round(x):0; }
function money(value){ const x=Number(value); return Number.isFinite(x)?Math.max(0,Math.round(x*100)/100):0; }
function text(value,max=120){ return String(value??'').trim().slice(0,max); }
function dateValue(value){ const s=text(value,10); return /^\d{4}-\d{2}-\d{2}$/.test(s)?s:new Date().toISOString().slice(0,10); }

async function configRow(sql){
  const rows=await sql`
    SELECT id, COALESCE(extracted_summary,'{}'::jsonb) AS summary
    FROM documents
    WHERE document_type='moneyos_config' AND source_name='MoneyOS private config'
    ORDER BY document_date DESC NULLS LAST, created_at DESC
    LIMIT 1
  `;
  return rows[0]??null;
}
function normalizeWallet(raw={}){
  return {
    cash_jpy:Math.max(0,n(raw.cash_jpy)),
    icoca_jpy:Math.max(0,n(raw.icoca_jpy)),
    ledger:Array.isArray(raw.ledger)?raw.ledger.slice(0,500):[],
    bank_transfer_links:raw.bank_transfer_links&&typeof raw.bank_transfer_links==='object'?raw.bank_transfer_links:{}
  };
}
function publicTrips(summary){
  const trips=Array.isArray(summary?.japan?.trips)?summary.japan.trips:[];
  return trips.map(t=>({id:t.id,name:t.name,start_date:t.start_date,end_date:t.end_date}));
}
async function bankCandidates(sql,links){
  const rows=await sql`
    SELECT t.id::text AS id,t.transaction_date,ROUND(t.amount::numeric,2) AS amount,t.merchant,t.description,
      t.transaction_type,COALESCE(t.is_pending,false) AS is_pending,a.name AS account
    FROM transactions t JOIN accounts a ON a.id=t.account_id
    WHERE COALESCE(t.is_pending,false)=false AND t.transaction_type IN ('expense','transfer')
    ORDER BY t.transaction_date DESC,t.id DESC LIMIT 100
  `;
  return rows.filter(row=>!links?.[row.id]).map(row=>({...row,amount:Number(row.amount??0)}));
}
function publicLinks(wallet){
  return Object.fromEntries(Object.entries(wallet.bank_transfer_links??{}).map(([id,x])=>[id,{
    transaction_id:id,wallet:x.wallet,amount_jpy:n(x.amount_jpy),bank_amount_nok:money(x.bank_amount_nok),
    transaction_date:x.transaction_date,account:x.account,merchant:x.merchant||null,description:x.description||null,
    linked_at:x.linked_at,original_transaction_type:x.original_transaction_type||'expense'
  }]));
}

export default async function handler(req,res){
  res.setHeader('Cache-Control','private, no-store, max-age=0');
  res.setHeader('Pragma','no-cache');
  try{
    if(!isAuthenticated(req)) return res.status(401).json({error:'Unauthorized'});
    if(!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not configured');
    const sql=neon(process.env.DATABASE_URL); const config=await configRow(sql);
    if(!config) return res.status(500).json({error:'MoneyOS-konfigurasjonen mangler'});
    const wallet=normalizeWallet(config.summary?.japan?.wallets);
    const trips=publicTrips(config.summary);
    if(req.method==='GET'){
      const candidates=await bankCandidates(sql,wallet.bank_transfer_links);
      return res.status(200).json({...wallet,bank_transfer_links:publicLinks(wallet),bank_candidates:candidates,trips});
    }
    if(req.method!=='POST') return res.status(405).json({error:'Method not allowed'});

    const action=text(req.body?.action,30), amount=Math.max(0,n(req.body?.amount_jpy));
    const entryBase={id:randomUUID(),date:dateValue(req.body?.date),created_at:new Date().toISOString()};
    if(action==='set_balance'){
      const which=text(req.body?.wallet,10); if(!walletNames.includes(which)) return res.status(400).json({error:'Ugyldig lommebok'});
      wallet[`${which}_jpy`]=amount;
      wallet.ledger.unshift({...entryBase,type:'reconcile',wallet:which,amount_jpy:amount,note:'Saldo justert'});
    }else if(action==='transfer'){
      const from=text(req.body?.from,10),to=text(req.body?.to,10); if(!walletNames.includes(from)||!walletNames.includes(to)||from===to||amount<=0) return res.status(400).json({error:'Ugyldig overføring'});
      if(wallet[`${from}_jpy`]<amount) return res.status(409).json({error:'Ikke nok saldo i lommeboken'});
      wallet[`${from}_jpy`]-=amount; wallet[`${to}_jpy`]+=amount;
      wallet.ledger.unshift({...entryBase,type:'transfer',from,to,amount_jpy:amount,note:text(req.body?.note,120)});
    }else if(action==='topup'){
      const which=text(req.body?.wallet,10); if(!walletNames.includes(which)||amount<=0) return res.status(400).json({error:'Ugyldig påfyll'});
      wallet[`${which}_jpy`]+=amount;
      wallet.ledger.unshift({...entryBase,type:'topup',wallet:which,amount_jpy:amount,note:text(req.body?.note,120)});
    }else if(action==='bank_transfer'){
      const which=text(req.body?.wallet,10),transactionId=text(req.body?.transaction_id,128);
      if(!walletNames.includes(which)||amount<=0||!transactionId) return res.status(400).json({error:'Velg bankpost, lommebok og mottatt JPY-beløp'});
      if(wallet.bank_transfer_links?.[transactionId]) return res.status(409).json({error:'Denne bankposten er allerede koblet til Japan-lommeboken'});
      const rows=await sql`
        SELECT t.id::text AS id,t.transaction_date,ROUND(t.amount::numeric,2) AS amount,t.merchant,t.description,t.transaction_type,
          COALESCE(t.is_pending,false) AS is_pending,a.name AS account
        FROM transactions t JOIN accounts a ON a.id=t.account_id WHERE t.id::text=${transactionId} LIMIT 1
      `;
      const tx=rows[0];if(!tx)return res.status(404).json({error:'Banktransaksjonen finnes ikke'});
      if(tx.is_pending)return res.status(409).json({error:'Vent til banktransaksjonen er bokført'});
      if(!['expense','transfer'].includes(tx.transaction_type))return res.status(409).json({error:'Bare en utgående bankpost kan kobles til lommeboken'});
      const link={wallet:which,amount_jpy:amount,bank_amount_nok:money(tx.amount),transaction_date:String(tx.transaction_date).slice(0,10),account:tx.account,merchant:tx.merchant||null,description:tx.description||null,original_transaction_type:tx.transaction_type,linked_at:new Date().toISOString()};
      wallet[`${which}_jpy`]+=amount;wallet.bank_transfer_links[transactionId]=link;
      wallet.ledger.unshift({...entryBase,date:link.transaction_date,type:'bank_transfer',wallet:which,amount_jpy:amount,transaction_id:transactionId,bank_amount_nok:link.bank_amount_nok,account:link.account,note:text(req.body?.note,120)||'Fra bank'});
      wallet.ledger=wallet.ledger.slice(0,500);
      const updated=await sql`
        WITH changed AS (
          UPDATE transactions SET transaction_type='transfer'
          WHERE id::text=${transactionId} AND COALESCE(is_pending,false)=false
          RETURNING id
        )
        UPDATE documents SET extracted_summary=jsonb_set(COALESCE(extracted_summary,'{}'::jsonb),'{japan,wallets}',${JSON.stringify(wallet)}::jsonb,true)
        WHERE id=${config.id} AND EXISTS (SELECT 1 FROM changed) RETURNING id
      `;
      if(!updated.length)return res.status(409).json({error:'Bankposten kunne ikke kobles atomisk'});
      const candidates=await bankCandidates(sql,wallet.bank_transfer_links);
      return res.status(200).json({ok:true,...wallet,bank_transfer_links:publicLinks(wallet),bank_candidates:candidates,trips});
    }else if(action==='unlink_bank_transfer'){
      const transactionId=text(req.body?.transaction_id,128),link=wallet.bank_transfer_links?.[transactionId];
      if(!link)return res.status(404).json({error:'Koblingen finnes ikke'});
      const latest=wallet.ledger?.[0];
      if(latest?.type!=='bank_transfer'||String(latest.transaction_id)!==transactionId)return res.status(409).json({error:'Koblingen kan bare reverseres før det registreres ny lommebokaktivitet'});
      const which=link.wallet,linkedAmount=n(link.amount_jpy);if(!walletNames.includes(which)||wallet[`${which}_jpy`]<linkedAmount)return res.status(409).json({error:'Saldoen er endret. Avstem lommeboken manuelt i stedet for å reversere koblingen'});
      wallet[`${which}_jpy`]-=linkedAmount;wallet.ledger.shift();delete wallet.bank_transfer_links[transactionId];
      const restore=['expense','transfer'].includes(link.original_transaction_type)?link.original_transaction_type:'expense';
      const updated=await sql`
        WITH changed AS (
          UPDATE transactions SET transaction_type=${restore}
          WHERE id::text=${transactionId} AND COALESCE(is_pending,false)=false
          RETURNING id
        )
        UPDATE documents SET extracted_summary=jsonb_set(COALESCE(extracted_summary,'{}'::jsonb),'{japan,wallets}',${JSON.stringify(wallet)}::jsonb,true)
        WHERE id=${config.id} AND EXISTS (SELECT 1 FROM changed) RETURNING id
      `;
      if(!updated.length)return res.status(409).json({error:'Koblingen kunne ikke reverseres'});
      const candidates=await bankCandidates(sql,wallet.bank_transfer_links);
      return res.status(200).json({ok:true,...wallet,bank_transfer_links:publicLinks(wallet),bank_candidates:candidates,trips});
    }else if(action==='expense'){
      const which=text(req.body?.wallet,10),category=text(req.body?.category_key,20); if(!walletNames.includes(which)||!categoryKeys.includes(category)||amount<=0) return res.status(400).json({error:'Ugyldig kjøp'});
      if(wallet[`${which}_jpy`]<amount) return res.status(409).json({error:'Ikke nok saldo i lommeboken'});
      const tripId=text(req.body?.trip_id,80)||null;
      const tripBucket=tripId?text(req.body?.trip_bucket,20):null;
      if(tripId&&!trips.some(t=>String(t.id)===tripId)) return res.status(400).json({error:'Turen finnes ikke'});
      if(tripId&&!tripBuckets.includes(tripBucket)) return res.status(400).json({error:'Velg hvilken turpost kjøpet tilhører'});
      wallet[`${which}_jpy`]-=amount;
      wallet.ledger.unshift({...entryBase,type:'expense',wallet:which,amount_jpy:amount,category_key:category,note:text(req.body?.note,120)||'Kontantkjøp',trip_id:tripId,trip_bucket:tripBucket});
    }else return res.status(400).json({error:'Ukjent handling'});

    wallet.ledger=wallet.ledger.slice(0,500);
    await sql`
      UPDATE documents
      SET extracted_summary=jsonb_set(COALESCE(extracted_summary,'{}'::jsonb),'{japan,wallets}',${JSON.stringify(wallet)}::jsonb,true)
      WHERE id=${config.id}
    `;
    const candidates=await bankCandidates(sql,wallet.bank_transfer_links);
    return res.status(200).json({ok:true,...wallet,bank_transfer_links:publicLinks(wallet),bank_candidates:candidates,trips});
  }catch(error){console.error(error);return res.status(500).json({error:'Kunne ikke oppdatere Japan-lommeboken'});}
}

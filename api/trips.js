import { randomUUID } from 'node:crypto';
import { neon } from '@neondatabase/serverless';
import { isAuthenticated } from '../lib/auth.js';

const fields = ['transport', 'stay', 'food', 'activities', 'other'];

function text(value, max = 120) {
  return String(value ?? '').trim().slice(0, max);
}
function amount(value) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : 0;
}
function validDate(value) {
  const s = text(value, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

async function getConfig(sql) {
  const rows = await sql`
    SELECT id, COALESCE(extracted_summary, '{}'::jsonb) AS summary
    FROM documents
    WHERE document_type = 'moneyos_config' AND source_name = 'MoneyOS private config'
    ORDER BY document_date DESC NULLS LAST, created_at DESC
    LIMIT 1
  `;
  return rows[0] ?? null;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  try {
    if (!isAuthenticated(req)) return res.status(401).json({ error: 'Unauthorized' });
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not configured');
    const sql = neon(process.env.DATABASE_URL);
    const config = await getConfig(sql);
    if (!config) return res.status(500).json({ error: 'MoneyOS-konfigurasjonen mangler' });
    const japan = config.summary?.japan ?? {};
    const trips = Array.isArray(japan.trips) ? japan.trips : [];

    if (req.method === 'GET') return res.status(200).json({ trips });

    if (req.method === 'POST') {
      const id = text(req.body?.id, 80) || randomUUID();
      const name = text(req.body?.name, 80);
      const startDate = validDate(req.body?.start_date);
      const endDate = validDate(req.body?.end_date);
      if (!name) return res.status(400).json({ error: 'Gi turen et navn' });
      if (!startDate || !endDate || endDate < startDate) return res.status(400).json({ error: 'Velg gyldige datoer' });
      const budgets = Object.fromEntries(fields.map(key => [key, amount(req.body?.budgets?.[key])]));
      const trip = {
        id,
        name,
        start_date: startDate,
        end_date: endDate,
        currency: 'JPY',
        budgets,
        include_in_plan: req.body?.include_in_plan !== false,
        updated_at: new Date().toISOString()
      };
      const next = [trip, ...trips.filter(item => String(item?.id) !== id)].sort((a, b) => String(a.start_date).localeCompare(String(b.start_date)));
      await sql`
        UPDATE documents
        SET extracted_summary = jsonb_set(COALESCE(extracted_summary, '{}'::jsonb), '{japan,trips}', ${JSON.stringify(next)}::jsonb, true)
        WHERE id = ${config.id}
      `;
      return res.status(200).json({ ok: true, trip, trips: next });
    }

    if (req.method === 'DELETE') {
      const id = text(req.query?.id, 80);
      if (!id) return res.status(400).json({ error: 'Mangler tur-ID' });
      const next = trips.filter(item => String(item?.id) !== id);
      await sql`
        UPDATE documents
        SET extracted_summary = jsonb_set(COALESCE(extracted_summary, '{}'::jsonb), '{japan,trips}', ${JSON.stringify(next)}::jsonb, true)
        WHERE id = ${config.id}
      `;
      return res.status(200).json({ ok: true, trips: next });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Kunne ikke lagre turbudsjettet' });
  }
}

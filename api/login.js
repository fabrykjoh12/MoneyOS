import { createSessionCookie, passwordMatches } from '../lib/auth.js';

function getBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body); } catch { return {}; }
  }
  return {};
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { password } = getBody(req);
    if (!passwordMatches(password)) return res.status(401).json({ error: 'Feil passord' });
    res.setHeader('Set-Cookie', createSessionCookie());
    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Dashboard authentication is not configured' });
  }
}

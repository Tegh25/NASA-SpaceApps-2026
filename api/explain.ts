import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleExplain } from './_lib/explainCore.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const fwd = req.headers['x-forwarded-for'];
  const ip = (Array.isArray(fwd) ? fwd[0] : fwd)?.split(',')[0].trim() || req.socket.remoteAddress || 'unknown';
  const body = typeof req.body === 'string' ? safeJson(req.body) : req.body;

  const result = await handleExplain(body, ip, {
    apiKey: process.env.BACKBOARD_API_KEY,
    model: process.env.LLM_NAME,
  });
  res.setHeader('Cache-Control', 'no-store');
  return res.status(result.status).json(result.body);
}

function safeJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

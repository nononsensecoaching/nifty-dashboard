// pages/api/daily-run.js
import { getNifty50, getIndiaVIX, getOptionChain } from '../../lib/nse'
export default async function handler(req, res) {
  const isCron = req.headers['x-vercel-cron'] || process.env.NODE_ENV === 'development'
  if (!isCron) return res.status(403).json({ error: 'Cron only.' })
  const snapshot = { runAt: new Date().toISOString(), triggeredBy: req.headers['x-vercel-cron'] ? 'vercel-cron' : 'manual-dev', fields: {}, missingFields: [] }
  try { snapshot.fields.nifty50 = await getNifty50() } catch (e) { snapshot.missingFields.push({ field: 'nifty50', reason: e.message }) }
  try { snapshot.fields.vix = await getIndiaVIX() } catch (e) { snapshot.missingFields.push({ field: 'vix', reason: e.message }) }
  try { snapshot.fields.optionChain = await getOptionChain('NIFTY') } catch (e) { snapshot.missingFields.push({ field: 'optionChain', reason: e.message }) }
  snapshot.missingFields.push({ field: 'giftNifty', reason: 'No free API.' }, { field: 'fiiDiiFlow', reason: 'No free API.' }, { field: 'sp500Close', reason: 'No free API.' })
  try { const { kv } = await import('@vercel/kv'); const key = `nifty:run:${snapshot.runAt.slice(0,10)}`; await kv.set(key, snapshot); snapshot.storedAt = key } catch (e) { snapshot.storageNote = 'KV not configured.' }
  console.log('[daily-run]', JSON.stringify(snapshot))
  return res.status(200).json(snapshot)
}

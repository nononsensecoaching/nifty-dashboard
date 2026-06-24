// pages/api/live-snapshot.js
import { getOptionChain, getIndiaVIX, getNifty50 } from '../../lib/nse'
export default async function handler(req, res) {
  const result = { fetchedAt: new Date().toISOString(), sources: {} }
    try { result.sources.nifty50 = { ok: true, data: await getNifty50() } } catch (e) { result.sources.nifty50 = { ok: false, error: e.message } }
    try { result.sources.vix = { ok: true, data: await getIndiaVIX() } } catch (e) { result.sources.vix = { ok: false, error: e.message } }
    try { result.sources.optionChain = { ok: true, data: await getOptionChain('NIFTY') } } catch (e) { result.sources.optionChain = { ok: false, error: e.message } }
  result.sources.fiiDii = { ok: false, error: 'No public JSON endpoint — enter manually.' }
  const anyOk = Object.values(result.sources).some(s => s.ok)
  res.status(anyOk ? 200 : 502).json(result)
}

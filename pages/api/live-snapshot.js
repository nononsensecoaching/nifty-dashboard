// pages/api/live-snapshot.js
//
// Pulls what's genuinely available from NSE's public endpoints right now.
// Returns partial data with explicit error fields per-source rather than
// failing the whole request if one source breaks — so a VIX outage doesn't
// take down the option chain data too.

import { getOptionChain, getIndiaVIX, getNifty50 } from '../../lib/nse'

export default async function handler(req, res) {
  const result = { fetchedAt: new Date().toISOString(), sources: {} }

  try {
    result.sources.nifty50 = { ok: true, data: await getNifty50() }
  } catch (e) {
    result.sources.nifty50 = { ok: false, error: e.message }
  }

  try {
    result.sources.vix = { ok: true, data: await getIndiaVIX() }
  } catch (e) {
    result.sources.vix = { ok: false, error: e.message }
  }

  try {
    result.sources.optionChain = { ok: true, data: await getOptionChain('NIFTY') }
  } catch (e) {
    result.sources.optionChain = { ok: false, error: e.message }
  }

  // FII/DII is intentionally not auto-fetched — see lib/nse.js getFiiDiiFlow
  // for why. The frontend should present this as a manual entry field.
  result.sources.fiiDii = {
    ok: false,
    error: 'No public JSON endpoint — enter manually from nseindia.com FII-DII report or moneycontrol.',
  }

  const anyOk = Object.values(result.sources).some(s => s.ok)
  res.status(anyOk ? 200 : 502).json(result)
}

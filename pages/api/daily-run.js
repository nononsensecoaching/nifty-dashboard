// pages/api/daily-run.js
//
// Fires twice in spirit: once mid-morning (whenever the cron actually runs)
// to log the day's NIFTY/VIX baseline, and the OPTION CHAIN SNAPSHOT below
// is specifically intended to run again at 3:00 PM IST to capture the full
// strike-wise chain for later multiplier analysis (which strikes went 2x/3x
// between entry and a later checkpoint).
//
// IMPORTANT — this 3PM snapshot is currently capture-only. It is NOT yet
// computing "which strikes multiplied" because that calculation needs an
// agreed ENTRY POINT (this morning's 9:20 AM price? this same 3PM price as
// a hypothetical entry for tomorrow? your actual real trades?) — that
// decision is still pending confirmation. Until it's confirmed, this job
// only stores raw chains; lib/multiplier.js (not yet built) will consume
// them once the entry-point rule is set.
//
// To get a literal 3:00 PM IST trigger, ADD A SECOND CRON in vercel.json:
//   { "path": "/api/daily-run?snapshot=optionchain", "schedule": "30 9 * * 1-5" }  (9:30 UTC = 3:00 PM IST)
// pointing at this same handler — see the snapshot=optionchain branch below.

import { getNifty50, getIndiaVIX, getOptionChain } from '../../lib/nse'

export default async function handler(req, res) {
  const isCron = req.headers['x-vercel-cron'] || process.env.NODE_ENV === 'development'
  if (!isCron) {
    return res.status(403).json({ error: 'This endpoint is for the scheduled cron job only.' })
  }

  const isOptionChainSnapshot = req.query.snapshot === 'optionchain'

  const snapshot = {
    runAt: new Date().toISOString(),
    triggeredBy: req.headers['x-vercel-cron'] ? 'vercel-cron' : 'manual-dev',
    snapshotType: isOptionChainSnapshot ? '3pm-option-chain' : 'daily-baseline',
    fields: {},
    missingFields: [],
  }

  if (isOptionChainSnapshot) {
    // Full strike-wise chain capture — this is the raw data the multiplier
    // analysis will eventually consume, once the entry-point rule is set.
    try {
      const chain = await getOptionChain('NIFTY')
      snapshot.fields.optionChainFull = chain
    } catch (e) {
      snapshot.missingFields.push({ field: 'optionChainFull', reason: e.message })
    }
    try {
      const { kv } = await import('@vercel/kv')
      const key = `nifty:optionchain:${snapshot.runAt.slice(0, 10)}:1500ist`
      await kv.set(key, snapshot)
      snapshot.storedAt = key
    } catch (e) {
      snapshot.storageNote = 'Vercel KV not configured — 3PM chain snapshot was fetched but not persisted. Without persistence, no multiplier history can accumulate day over day.'
    }
    console.log('[daily-run:3pm-snapshot]', snapshot.storedAt || 'not stored', 'strikes:', snapshot.fields.optionChainFull?.strikes?.length)
    return res.status(200).json(snapshot)
  }

  try {
    snapshot.fields.nifty50 = await getNifty50()
  } catch (e) {
    snapshot.missingFields.push({ field: 'nifty50', reason: e.message })
  }

  try {
    snapshot.fields.vix = await getIndiaVIX()
  } catch (e) {
    snapshot.missingFields.push({ field: 'vix', reason: e.message })
  }

  try {
    snapshot.fields.optionChain = await getOptionChain('NIFTY')
  } catch (e) {
    snapshot.missingFields.push({ field: 'optionChain', reason: e.message })
  }

  snapshot.missingFields.push(
    { field: 'giftNifty', reason: 'No free public JSON source — needs manual entry on the dashboard.' },
    { field: 'fiiDiiFlow', reason: 'No free public JSON source — needs manual entry on the dashboard.' },
    { field: 'sp500Close', reason: 'No free public JSON source used in this build — needs manual entry.' },
  )

  try {
    const { kv } = await import('@vercel/kv')
    const key = `nifty:run:${snapshot.runAt.slice(0, 10)}`
    await kv.set(key, snapshot)
    snapshot.storedAt = key
  } catch (e) {
    snapshot.storageNote = 'Vercel KV not configured or unavailable — snapshot was computed but not persisted. Set up KV (Storage tab in Vercel project) to keep a real running log for the Accuracy tab.'
  }

  console.log('[daily-run]', JSON.stringify(snapshot))
  return res.status(200).json(snapshot)
}

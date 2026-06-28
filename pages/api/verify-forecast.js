// pages/api/verify-forecast.js
//
// Fires Monday 10:00 AM IST (4:30 UTC) per user request: "do the
// verification of yesterdays forecast by next monday 10 am and update
// the tabs." Read this comment before assuming this is fully automatic.
//
// WHAT THIS JOB CAN DO AUTOMATICALLY:
// - Pull Friday's actual NIFTY close and VIX from NSE's public endpoints
//   (same source as live-snapshot.js)
// - Compare that close against the prediction stored by daily-run.js on
//   Friday, compute whether direction was correct, and store a
//   machine-generated verdict (correct / miss, plus the raw numbers)
//
// WHAT THIS JOB CANNOT DO AUTOMATICALLY:
// - Write a root-cause analysis. Every entry in lib/learning.js's
//   PREDICTION_LOG with a miss has a multi-paragraph, specific root
//   cause (which signal failed, why, what fix was applied) written by
//   reasoning about real news and data, not a template. A cron job
//   cannot do that reasoning — it can only flag THAT a miss happened,
//   with the supporting numbers, so a person (or a future chat session
//   with Claude) can write the actual root cause and decide what model
//   change it justifies. This job stores that flag; it does not
//   pretend to close the loop by itself.
// - Edit lib/learning.js or any other source file. Vercel's serverless
//   functions cannot commit to GitHub. The PREDICTION_LOG array is a
//   static file in the deployed code — updating it requires a new
//   commit and deploy, same as every other change to this dashboard.
//
// WHAT ACTUALLY HAPPENS TO THE DASHBOARD'S TABS ON MONDAY MORNING:
// The "NIFTY - 30-day" tab's table will NOT show last Friday's result
// automatically until someone adds it to PREDICTION_LOG and redeploys.
// What this job DOES give you: a stored, dated record (in Vercel KV, if
// configured) of exactly what to add, so that step is fast and the
// numbers are pulled from source rather than typed from memory.

import { getNifty50 } from '../../lib/nse'

export default async function handler(req, res) {
  const isCron = req.headers['x-vercel-cron'] || process.env.NODE_ENV === 'development'
  if (!isCron) {
    return res.status(403).json({ error: 'This endpoint is for the scheduled cron job only.' })
  }

  const result = {
    runAt: new Date().toISOString(),
    purpose: 'Weekly forecast verification — flags Friday\'s outcome, does not auto-write root cause.',
  }

  try {
    result.fridayActual = await getNifty50()
  } catch (e) {
    result.fridayActualError = e.message
  }

  let storedPrediction = null
  try {
    const { kv } = await import('@vercel/kv')
    // daily-run.js stores under key nifty:run:YYYY-MM-DD — look back to
    // the most recent Friday relative to today (this job runs Monday).
    const now = new Date()
    const daysSinceFriday = ((now.getUTCDay() + 7 - 5) % 7) || 7
    const friday = new Date(now)
    friday.setUTCDate(now.getUTCDate() - daysSinceFriday)
    const fridayKey = `nifty:run:${friday.toISOString().slice(0, 10)}`
    storedPrediction = await kv.get(fridayKey)
    result.fridayPredictionKey = fridayKey
    result.fridayPredictionFound = !!storedPrediction
  } catch (e) {
    result.kvError = 'Vercel KV not configured or the Friday prediction was never stored — nothing to verify against. ' + e.message
  }

  if (storedPrediction && result.fridayActual?.ok) {
    const actualClose = result.fridayActual.data.last
    const actualDir = actualClose > result.fridayActual.data.previousClose ? 'BULL' : 'BEAR'
    result.verification = {
      predictedDirection: storedPrediction.direction || 'unknown',
      actualDirection: actualDir,
      actualClose,
      matched: storedPrediction.direction === actualDir,
      note: matchedNote(storedPrediction.direction === actualDir),
    }
  } else {
    result.verification = {
      note: 'Could not complete automatic comparison — either Friday\'s stored prediction or today\'s live NIFTY data was unavailable. See fridayPredictionFound and fridayActualError above for which one.',
    }
  }

  try {
    const { kv } = await import('@vercel/kv')
    const key = `nifty:verify:${result.runAt.slice(0, 10)}`
    await kv.set(key, result)
    result.storedAt = key
  } catch (e) {
    result.storageNote = 'Vercel KV not configured — verification computed but not persisted.'
  }

  console.log('[verify-forecast]', JSON.stringify(result))
  return res.status(200).json(result)
}

function matchedNote(matched) {
  return matched
    ? 'Direction matched. Still worth a human/Claude pass to check magnitude, not just direction — see the partial_miss category already in use for cases where direction is right but the move size was very different from predicted.'
    : 'Direction did NOT match. This needs a root-cause entry added to lib/learning.js PREDICTION_LOG (with the specific reason, not a generic note) and a redeploy — this job cannot write that analysis itself.'
}

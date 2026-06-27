// lib/horizons.js
//
// User feedback (28 Jun 2026): "we always got profit in holding it for
// longer duration than for shorter duration" — confirmed by the trade-log
// analysis already in this dashboard (DTE >= 1 entries: 72% win, +96,783;
// DTE 0 entries: 25% win, -78,202). This module makes the forecast itself
// span multiple horizons, not just "tomorrow", so the dashboard's own
// recommendation structure matches what the data says actually works.

export function buildHorizons(score, direction, confidence, d) {
  const spot = d.niftyClose
  const horizons = []

  // ── NEXT SESSION ──
  horizons.push({
    id: 'next-session',
    label: 'Next session',
    window: '1 trading day',
    direction, confidence,
    range: [d.support, d.resistance],
    rationale: 'Standard next-day signal model output — same as before, included for completeness even though the trade log shows this is your lowest-edge horizon historically.',
    historicalWinRate: 'Same-day/next-day entries: 28-33% win rate in your trade log',
  })

  // ── EXPIRY DAY (NEXT WEEKLY) ──
  const expiryRangeWidth = Math.abs(confidence === 'HIGH' ? 350 : confidence === 'MED' ? 250 : 180)
  const expiryMid = direction === 'BULL' ? spot + expiryRangeWidth * 0.4 : direction === 'BEAR' ? spot - expiryRangeWidth * 0.4 : spot
  horizons.push({
    id: 'expiry-day',
    label: 'Next weekly expiry',
    window: '~4-6 trading days',
    direction, confidence,
    range: [Math.round(expiryMid - expiryRangeWidth / 2), Math.round(expiryMid + expiryRangeWidth / 2)],
    rationale: `This is your historically strongest entry horizon — DTE 4-5 entries in your trade log won 89-100% of the time vs 25-43% for DTE 0-2. The wider range here reflects more time for the move to develop, not more uncertainty about direction.`,
    historicalWinRate: 'DTE 4-5 entries: 89-100% win rate in your trade log',
  })

  // ── NEXT WEEK (swing) ──
  const weekRangeWidth = Math.abs(confidence === 'HIGH' ? 600 : confidence === 'MED' ? 450 : 300)
  const weekMid = direction === 'BULL' ? spot + weekRangeWidth * 0.35 : direction === 'BEAR' ? spot - weekRangeWidth * 0.35 : spot
  horizons.push({
    id: 'next-week',
    label: 'Next week (swing)',
    window: '5-7 trading days',
    direction: confidence === 'LOW' ? 'NEUTRAL' : direction,
    confidence: confidence === 'HIGH' ? 'MED' : 'LOW',
    range: [Math.round(weekMid - weekRangeWidth / 2), Math.round(weekMid + weekRangeWidth / 2)],
    rationale: 'Confidence is deliberately stepped down one tier versus the expiry-day call — more time means more opportunity for the macro picture (Fed, Iran talks, earnings season starting in July) to shift the picture before this horizon resolves. Wider range reflects that added uncertainty honestly, rather than projecting today\'s conviction unchanged a week out.',
    historicalWinRate: 'Not yet enough multi-week-hold samples in your trade log to quote a win rate — flagged as a gap, not papered over with a guess.',
  })

  return horizons
}

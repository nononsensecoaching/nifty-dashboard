// lib/oiSignals.js
//
// "Investigative" reading of the option chain — built from the four real,
// named OI-buildup patterns that professional option-chain literature
// actually uses (PL Capital, AlgoTest, NiftyTrader, Groww — see chat
// research, 28 Jun 2026). This is NOT a proprietary signal and does not
// claim to see anything beyond what any option-chain reader could compute
// from the same OI + price data. The honest limitation is stated directly:
// this reads PUBLIC OI snapshots, not live order-book depth — true
// microstructure tools (Bookmap-style) need a paid data feed this system
// does not have.
//
// The four patterns, each requires BOTH price direction AND OI direction
// to agree — OI alone is explicitly flagged as unreliable in every source
// reviewed (it can reflect hedging, not conviction).

export const OI_PATTERNS = {
  LONG_BUILDUP: {
    label: 'Long buildup',
    condition: 'Price up + OI up',
    meaning: 'Fresh bullish positions being added — usually the most reliable bullish signal because it requires fresh capital, not just existing positions revaluing.',
  },
  SHORT_BUILDUP: {
    label: 'Short buildup',
    condition: 'Price down + OI up',
    meaning: 'Fresh bearish positions being added. If you are long calls when this appears at a strike above spot, professional guidance is explicit: exit, a short buildup is forming against the position.',
  },
  SHORT_COVERING: {
    label: 'Short covering',
    condition: 'Price up + OI down',
    meaning: 'Existing bearish bets being closed out, not new buying — can fuel a sharp move but tends to fade faster than a long buildup since there is no fresh conviction behind it.',
  },
  LONG_UNWINDING: {
    label: 'Long unwinding',
    condition: 'Price down + OI down',
    meaning: 'Existing bullish bets being closed, not fresh selling — often the early stage of profit-taking rather than a reversal.',
  },
}

export const CURRENT_OI_SNAPSHOT = {
  asOf: '25 Jun 2026, 16:08 IST (NiftyTrader)',
  spot: 24056.00,
  pcr: 1.177,
  pcrAll: 1.2689,
  maxPain: 24100,
  maxCallOIStrike: 25000,
  maxPutOIStrike: 24000,
  strikes: [
    { strike: 23800, callOI: 'low', putOI: 'high', note: 'Deep support — large put wall' },
    { strike: 24000, callOI: 'med', putOI: 'very high', note: 'Primary support — max put OI strike' },
    { strike: 24100, callOI: 'med', putOI: 'med', note: 'Max pain zone — gravitational pull into expiry' },
    { strike: 24200, callOI: 'high', putOI: 'low', note: 'First resistance' },
    { strike: 25000, callOI: 'very high', putOI: 'low', note: 'Primary resistance — max call OI strike' },
  ],
}

export function classifySignal(priceChangePct, oiChangeDirection) {
  const priceUp = priceChangePct > 0.1
  const priceDown = priceChangePct < -0.1
  if (priceUp && oiChangeDirection === 'up') return OI_PATTERNS.LONG_BUILDUP
  if (priceDown && oiChangeDirection === 'up') return OI_PATTERNS.SHORT_BUILDUP
  if (priceUp && oiChangeDirection === 'down') return OI_PATTERNS.SHORT_COVERING
  if (priceDown && oiChangeDirection === 'down') return OI_PATTERNS.LONG_UNWINDING
  return null
}

export function buildEvidenceChain(d) {
  const evidence = []

  evidence.push({
    dot: 'PCR at 1.177 (1.27 all-strikes)',
    reading: 'Moderately put-heavy — some caution being priced in, not panic',
    source: 'NiftyTrader live OI, 25 Jun close',
  })

  evidence.push({
    dot: `Max pain at ${d.maxPain ? d.maxPain.toLocaleString() : '24,100'}, spot at ${d.niftyClose.toLocaleString()}`,
    reading: Math.abs(d.niftyClose - (d.maxPain || 24100)) < 100
      ? 'Spot sitting very close to max pain — consistent with a consolidation/pin-risk week rather than a strong directional resolution before the next expiry'
      : 'Spot sits away from max pain — some gravitational pull toward that level is possible into expiry, though this is a tendency, not a rule',
    source: 'NiftyTrader live OI',
  })

  evidence.push({
    dot: 'India VIX compressed to 13.05 from 13.94, and from 27.32 a week earlier',
    reading: 'A VIX compression of this size after an elevated reading typically follows resolution of acute event risk (here: easing Iran-US tension) — historically this regime favours continuation of the prevailing trend rather than a reversal, because the fear premium that was inflating both call and put pricing is draining out symmetrically',
    source: 'Yahoo Finance / Investing.com India VIX, 25 Jun close vs 22 Jun',
  })

  evidence.push({
    dot: 'Crude oil (WTI) at roughly $69-73, down from a wartime peak above $120 over 5-6 weeks',
    reading: 'A sustained, multi-week decline, not a single-day move — this kind of slow-burn macro tailwind shows up in NIFTY with a short lag via lower import costs and inflation expectations, distinct from a one-day news spike that fades',
    source: 'CNBC, Investing.com, cross-checked 24-27 Jun',
  })

  evidence.push({
    dot: 'Max call OI at 25,000 vs max put OI at 24,000 — a wide 1,000-point band',
    reading: 'A wider-than-usual gap between the two OI walls suggests the market has not yet committed to a tight expected range — more room for a directional move before hitting a wall than in a tighter-banded week',
    source: 'NiftyTrader live OI',
  })

  return evidence
}

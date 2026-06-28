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
    reading: 'Close to spot, but this is deliberately NOT read as a directional pull this early in the week — max pain\'s gravitational effect is only documented as reliable in the final hour of expiry day itself. Using it as a mid-week signal is a known misreading of the metric (see Pseudo-Signal Watch below).',
    source: 'NiftyTrader, StockMojo max pain methodology',
  })

  evidence.push({
    dot: 'India VIX compressed to 13.05 from 13.94, and from 27.32 a week earlier',
    reading: 'A VIX compression of this size after an elevated reading typically follows resolution of acute event risk — historically this regime favours continuation of the prevailing trend rather than a reversal, because the fear premium that was inflating both call and put pricing is draining out symmetrically',
    source: 'Yahoo Finance / Investing.com India VIX, 25 Jun close vs prior week',
  })

  evidence.push({
    dot: 'FII cash +₹383.76 Cr on 25 Jun, but FII sold Nifty futures net −2,23,809 contracts the same day',
    reading: 'Read together, not as cash flow alone, this is a caution signal, not a clean bullish one — institutional flow trackers explicitly classify cash-buy + futures-sell as profit-taking with downside protection layered on. DII cash buying (+₹5,747.75 Cr) is the more unambiguous support signal this week.',
    source: 'StockEdge FII activity, NiftyTrader institutional flow classifier, both 25 Jun',
  })

  evidence.push({
    dot: 'Iran fired drones at the Strait of Hormuz on 26 Jun, hitting a cargo ship and violating the 60-day ceasefire — yet Brent crude still fell 4.34% to $71.99 that same session',
    reading: 'The market\'s own price reaction said "contained incident, de-escalation trend intact" despite an alarming-sounding headline. This is treated as confirmation the broader de-escalation/falling-crude tailwind for NIFTY remains the dominant story, not as a fresh risk to price in — but is flagged as worth re-checking each morning given the documented fragility of the talks.',
    source: 'CNBC, Al Jazeera, cross-checked 26-27 Jun',
  })

  evidence.push({
    dot: 'Max call OI at 25,000 vs max put OI at 24,000 — a wide 1,000-point band',
    reading: 'A wider-than-usual gap between the two OI walls suggests the market has not yet committed to a tight expected range — more room for a directional move before hitting a wall than in a tighter-banded week',
    source: 'NiftyTrader live OI',
  })

  evidence.push({
    dot: 'NSE/BSE confirmed closed 26 Jun 2026 for Muharram, reopening Monday 29 Jun',
    reading: 'Verified directly (not assumed) against two independent sources after a commentary site\'s "26 Jun" data table raised a flag worth checking — that data point was global indices and a stale Gift Nifty quote, not fresh NSE activity. Confirms the weekend-gap dampener below is correctly applied.',
    source: 'Business Standard, Upstox, cross-checked 27 Jun',
  })

  return evidence
}

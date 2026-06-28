// lib/strategy.js
//
// FIX (28 Jun 2026): the original buildTrade() only generated a credit
// spread, where max LOSS structurally exceeds max PROFIT (you collect a
// small premium, risk losing the wider remainder of the spread). The user
// flagged this directly: "loss is around 20,000 and profit is 11,000" —
// that is not a bug, it is the correct payoff of a credit spread. It is
// also the wrong shape for a trader who wants to survive a 50% win rate.
//
// At any win rate W, the month is net positive only if:
//   W * avg_win > (1-W) * avg_loss
// At W=0.5 this simplifies to avg_win > avg_loss — i.e. you need a payoff
// ratio above 1, not a win-rate above 50%. Credit spreads invert this
// (high win-rate, ratio below 1). Debit spreads can have a ratio above 1,
// at the cost of a lower win-rate. This file generates BOTH and several
// more, and is honest about the win-rate/ratio tradeoff for each one,
// rather than presenting one structure as if it had no tradeoff.
//
// UPDATE (28 Jun 2026, NIFTY-only trade history rebuild): real 14-month
// NIFTY-only data (3,897 legs, 285 combos, SENSEX excluded per user
// instruction) now backs every structural choice below — see
// lib/tradeHistory.js for the source numbers. Two hard rules from that
// history are enforced here, not just narrated: DTE 0 entries get an
// explicit, visible warning (20% win rate, -Rs 7.3L in this history), and
// the credit-spread width defaults to 300 points (Bull Put Spreads at
// 300pt width: 10/10 wins in this history).

import { HARD_RULES } from './tradeHistory'

function getDteWarning(dte) {
  if (dte === 0) {
    const rule = HARD_RULES.find(r => r.id === 'no-dte-zero')
    return { level: 'critical', message: rule.rule, evidence: rule.evidence }
  }
  if (dte === 1 || dte === 5) {
    return { level: 'good', message: `DTE ${dte} is one of your two strongest historical entry days.`, evidence: null }
  }
  return null
}

const LOT = 75

// NIFTY weekly expiry is every Tuesday (since the Sep 2025 SEBI reshuffle).
// Given a DTE count and a reference date, compute the actual calendar
// expiry date so the trade recommendation can state it explicitly,
// not just imply it via DTE.
function computeExpiryDate(dte, referenceDate = new Date()) {
  const d = new Date(referenceDate)
  let tradingDaysAdded = 0
  while (tradingDaysAdded < dte) {
    d.setDate(d.getDate() + 1)
    if (d.getDay() !== 0 && d.getDay() !== 6) tradingDaysAdded++
  }
  // Round forward to the next Tuesday if not already DTE-aligned to one
  while (d.getDay() !== 2) {
    d.setDate(d.getDate() + 1)
  }
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' })
}

function pop(direction, distanceFromSpotPct) {
  // Rough, transparent delta-based POP estimate — NOT a backtested figure.
  // Closer to spot = higher POP for a directional bet's breakeven.
  const base = direction === 'BULL' || direction === 'BEAR' ? 62 : 50
  return Math.max(15, Math.round(base - distanceFromSpotPct * 8))
}

function roundToStrike(x) { return Math.round(x / 50) * 50 }

export function buildStrategies(direction, confidence, d, dte = null) {
  const dteWarning = dte != null ? getDteWarning(dte) : null

  if (direction === 'NEUTRAL') {
    return [{
      id: 'skip',
      name: 'No trade today',
      rationale: 'Composite score is inside ±30 — there is no directional edge to size a trade against. Forcing a trade here means betting on noise, which is exactly the kind of decision that erodes monthly P&L over time even if any single such trade happens to win.',
      skip: true,
      dteWarning,
    }]
  }

  const bull = direction === 'BULL'
  const spot = d.niftyClose
  const inst = bull ? 'PE' : 'CE'   // selling puts when bullish, calls when bearish (credit), or buying the opposite for debit

  const strategies = []

  // ── STRATEGY 1: Credit spread (existing engine, kept, relabeled honestly) ──
  {
    const sellStrike = bull ? d.support : d.resistance
    const buyStrike = bull ? d.support - 300 : d.resistance + 300
    const sellPrem = bull ? 28.55 : 25.05
    const buyPrem = bull ? 14.0 : 12.0
    const netCredit = +(sellPrem - buyPrem).toFixed(2)
    const width = Math.abs(sellStrike - buyStrike)
    const maxProfit = Math.round(netCredit * LOT)
    const maxLoss = Math.round((width - netCredit) * LOT)
    strategies.push({
      id: 'credit-spread',
      name: `${bull ? 'Bull put' : 'Bear call'} spread (credit)`,
      shape: 'High win-rate, small win, larger capped loss',
      legs: [
        { action: 'SELL', strike: sellStrike, inst, premium: sellPrem },
        { action: 'BUY', strike: buyStrike, inst, premium: buyPrem },
      ],
      netCredit, maxProfit, maxLoss,
      ratio: +(maxProfit / maxLoss).toFixed(2),
      popPct: bull ? 64 : 58,
      breakeven: bull ? sellStrike - netCredit : sellStrike + netCredit,
      rationale: `Sells time decay near ${sellStrike.toLocaleString()}. In your real 14-month NIFTY-only trade history, this structure type (Bull Put / Bear Call spreads, sell-side) won 77.8%/70.4% of the time respectively. 300-point width specifically: every Bull Put Spread at this width in your history won (10/10). The tradeoff this dashboard does not hide: max loss (₹${maxLoss.toLocaleString()}) is larger than max profit (₹${maxProfit.toLocaleString()}) by construction — this only stays net-positive over time if the win rate holds in that 70-80% range. If your realised win rate drifts toward 50%, this specific structure becomes a net loser even though each individual win still feels good.`,
      monthlyMathNote: `At 64% win rate: expected value per trade ≈ (0.64×${maxProfit.toLocaleString()}) − (0.36×${maxLoss.toLocaleString()}) = ₹${Math.round(0.64*maxProfit - 0.36*maxLoss).toLocaleString()}. This needs the win rate to hold — it is not a high-win-size structure.`,
    })
  }

  // ── STRATEGY 2: Debit spread — profit > loss by construction ──
  {
    const buyStrike = roundToStrike(spot) + (bull ? -50 : 50) // slightly ITM/ATM
    const sellStrike = bull ? buyStrike + 400 : buyStrike - 400
    const width = 400
    const buyPrem = bull ? 145 : 140
    const sellPrem = bull ? 55 : 52
    const netDebit = +(buyPrem - sellPrem).toFixed(2)
    const maxLoss = Math.round(netDebit * LOT)
    const maxProfit = Math.round((width - netDebit) * LOT)
    const distPct = Math.abs(buyStrike - spot) / spot * 100
    strategies.push({
      id: 'debit-spread',
      name: `${bull ? 'Bull call' : 'Bear put'} spread (debit)`,
      shape: 'Lower win-rate, profit exceeds loss by construction',
      legs: [
        { action: 'BUY', strike: buyStrike, inst: bull ? 'CE' : 'PE', premium: buyPrem },
        { action: 'SELL', strike: sellStrike, inst: bull ? 'CE' : 'PE', premium: sellPrem },
      ],
      netDebit, maxProfit, maxLoss,
      ratio: +(maxProfit / maxLoss).toFixed(2),
      popPct: pop(direction, distPct),
      breakeven: bull ? buyStrike + netDebit : buyStrike - netDebit,
      rationale: `This is the structure that actually answers "win-size bigger than loss-size": you pay ₹${netDebit} to risk a known ₹${maxLoss.toLocaleString()} maximum, with a payout up to ₹${maxProfit.toLocaleString()} if the move plays out — profit is ${(maxProfit/maxLoss).toFixed(1)}x the loss. The honest cost: probability of full profit is lower than the credit spread above (~${pop(direction, distPct)}% vs ~64%), because you need the market to actually move your way past the buy strike, not just stay where it is.`,
      monthlyMathNote: `Even at only 45% win rate: EV ≈ (0.45×${maxProfit.toLocaleString()}) − (0.55×${maxLoss.toLocaleString()}) = ₹${Math.round(0.45*maxProfit - 0.55*maxLoss).toLocaleString()} per trade. This is the structure that stays positive even if half your trades lose.`,
    })
  }

  // ── STRATEGY 3: Wider debit spread, lower cost, bigger ratio, lower POP ──
  {
    const buyStrike = roundToStrike(spot) + (bull ? 50 : -50)
    const sellStrike = bull ? buyStrike + 600 : buyStrike - 600
    const width = 600
    const buyPrem = bull ? 95 : 92
    const sellPrem = bull ? 22 : 20
    const netDebit = +(buyPrem - sellPrem).toFixed(2)
    const maxLoss = Math.round(netDebit * LOT)
    const maxProfit = Math.round((width - netDebit) * LOT)
    const distPct = Math.abs(buyStrike - spot) / spot * 100
    strategies.push({
      id: 'wide-debit-spread',
      name: `${bull ? 'Bull call' : 'Bear put'} spread — wide (debit)`,
      shape: 'Lowest win-rate here, highest ratio, smallest absolute cost',
      legs: [
        { action: 'BUY', strike: buyStrike, inst: bull ? 'CE' : 'PE', premium: buyPrem },
        { action: 'SELL', strike: sellStrike, inst: bull ? 'CE' : 'PE', premium: sellPrem },
      ],
      netDebit, maxProfit, maxLoss,
      ratio: +(maxProfit / maxLoss).toFixed(2),
      popPct: pop(direction, distPct * 1.4),
      breakeven: bull ? buyStrike + netDebit : buyStrike - netDebit,
      rationale: `Same idea as the debit spread above, pushed further: a wider 600-point spread for a smaller ₹${netDebit} debit gives a ${(maxProfit/maxLoss).toFixed(1)}x ratio for the smallest capital outlay of the three. Use this only when conviction (score) is HIGH — at lower conviction the wider distance needed to reach max profit makes this the least likely of the three to actually pay out.`,
      monthlyMathNote: `Smallest position size of the three for the same notional risk tolerance — useful for running multiple of these in parallel across the month rather than one large position.`,
    })
  }

  // Rank by ratio descending for display, but tag which is "primary" by confidence
  const primary = confidence === 'HIGH' ? 'wide-debit-spread' : confidence === 'MED' ? 'debit-spread' : 'credit-spread'
  const expiryDate = dte != null ? computeExpiryDate(dte) : null
  strategies.forEach(s => { s.isPrimary = s.id === primary; s.dteWarning = dteWarning; s.expiryDate = expiryDate; s.dte = dte })

  return strategies
}

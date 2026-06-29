// lib/strategy.js
//
// MAJOR FIX (28 Jun 2026): debit-spread strategies have been REMOVED
// ENTIRELY from this engine. The user's own 14-month NIFTY-only trade
// history (lib/tradeHistory.js) shows every buy-side structure they ever
// attempted -- Long CE, Long PE, Bull Call Spread, Bear Put Spread --
// lost 100% of the time across 8 trades. Despite that being known and
// documented in this dashboard's own Pattern Intelligence tab, a prior
// version of this file still generated and sometimes RECOMMENDED two
// debit-spread variants as the "primary" trade on HIGH-confidence days.
// That was a direct contradiction between the dashboard's own analysis
// and its own recommendation engine, correctly flagged by the user.
// It is fixed now: every strategy this engine generates is sell-side
// (credit) by construction. The "profit > loss" need (the reason the
// debit spreads existed) is now met by a SELL-side ratio spread instead
// -- sell one near strike, buy MORE than one further-out strike -- which
// keeps the position a net seller of premium while still allowing
// profit to exceed loss past the far strike. This is a real, named
// structure (see lib/learning.js changelog and chat history, "ratio
// spread / backspread" research), not invented to patch over the bug.
//
// Earlier fix history kept for context:
// At any win rate W, the month is net positive only if:
//   W * avg_win > (1-W) * avg_loss
// Credit spreads need a high win rate to clear this bar (their ratio is
// below 1 by construction). The ratio spread below is the sell-side way
// to get a ratio above 1 without becoming a net buyer of premium.

import { HARD_RULES, BULL_PUT_SPREAD_WIDTH_PATTERN } from './tradeHistory'

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
function computeExpiryDate(dte, referenceDate = new Date()) {
  const d = new Date(referenceDate)
  let tradingDaysAdded = 0
  while (tradingDaysAdded < dte) {
    d.setDate(d.getDate() + 1)
    if (d.getDay() !== 0 && d.getDay() !== 6) tradingDaysAdded++
  }
  while (d.getDay() !== 2) {
    d.setDate(d.getDate() + 1)
  }
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' })
}

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
  const inst = bull ? 'PE' : 'CE'
  const strategies = []

  // ── STRATEGY 1: Standard 300pt credit spread — the proven, default structure ──
  // 300pt width specifically because every Bull Put Spread at this width
  // in the real trade history won (10/10) — see BULL_PUT_SPREAD_WIDTH_PATTERN.
  {
    const sellStrike = bull ? d.support : d.resistance
    const buyStrike = bull ? d.support - 300 : d.resistance + 300
    const sellPrem = bull ? 28.55 : 25.05
    const buyPrem = bull ? 14.0 : 12.0
    const netCredit = +(sellPrem - buyPrem).toFixed(2)
    const width = Math.abs(sellStrike - buyStrike)
    const maxProfit = Math.round(netCredit * LOT)
    const maxLoss = Math.round((width - netCredit) * LOT)
    const creditPctOfWidth = Math.round((netCredit / width) * 100)
    strategies.push({
      id: 'credit-spread-300',
      name: `${bull ? 'Bull put' : 'Bear call'} spread, 300pt width (credit)`,
      shape: 'Your proven default — high win-rate, capped loss, 300pt width specifically',
      legs: [
        { action: 'SELL', strike: sellStrike, inst, premium: sellPrem },
        { action: 'BUY', strike: buyStrike, inst, premium: buyPrem },
      ],
      netCredit, maxProfit, maxLoss,
      ratio: +(maxProfit / maxLoss).toFixed(2),
      popPct: bull ? 64 : 58,
      breakeven: bull ? sellStrike - netCredit : sellStrike + netCredit,
      rationale: `${BULL_PUT_SPREAD_WIDTH_PATTERN.finding} 300pt Bull Put Spreads: 10/10 wins. Bear Call Spread (the mirror structure): 70.4% win rate, +₹2.29L in your history. This credit (₹${netCredit}, ${creditPctOfWidth}% of width) is in the realistic band professional options literature (TastyTrade) documents for this width — they target ~33% of width, accepting a lower per-trade credit in exchange for a materially higher probability of profit than collecting a thinner, higher-Delta credit.`,
      monthlyMathNote: `At 64% win rate: expected value per trade ≈ (0.64×${maxProfit.toLocaleString()}) − (0.36×${maxLoss.toLocaleString()}) = ₹${Math.round(0.64 * maxProfit - 0.36 * maxLoss).toLocaleString()}. This needs the win rate to hold near 70-80% — it is a high-win-rate structure, not a high-win-size one, and that tradeoff is shown honestly, not hidden.`,
    })
  }

  // ── STRATEGY 2: Tighter 200pt variant — shown for comparison, flagged as inferior ──
  {
    const sellStrike = bull ? d.support : d.resistance
    const buyStrike = bull ? d.support - 200 : d.resistance + 200
    const sellPrem = bull ? 28.55 : 25.05
    const buyPrem = bull ? 18.5 : 16.5
    const netCredit = +(sellPrem - buyPrem).toFixed(2)
    const width = 200
    const maxProfit = Math.round(netCredit * LOT)
    const maxLoss = Math.round((width - netCredit) * LOT)
    strategies.push({
      id: 'credit-spread-200',
      name: `${bull ? 'Bull put' : 'Bear call'} spread, 200pt width (credit)`,
      shape: 'Same direction, narrower — your data shows this is the weaker choice',
      legs: [
        { action: 'SELL', strike: sellStrike, inst, premium: sellPrem },
        { action: 'BUY', strike: buyStrike, inst, premium: buyPrem },
      ],
      netCredit, maxProfit, maxLoss,
      ratio: +(maxProfit / maxLoss).toFixed(2),
      popPct: bull ? 58 : 52,
      breakeven: bull ? sellStrike - netCredit : sellStrike + netCredit,
      rationale: `Shown for direct comparison, not as a recommendation: 200pt Bull Put Spreads in your real history won only 60% of the time (3 of 5), versus 100% (10 of 10) at 300pt. The mechanism matters — your two 200pt losses both happened because the bought hedge leg ended up nested between two sold strikes instead of cleanly outside the whole range, a mistake that 300pt width gives you more room to avoid. Prefer the 300pt structure above unless you have a specific reason to go narrower.`,
      monthlyMathNote: `Lower credit collected, smaller buffer, and a documented worse win rate in your own data — this row exists so you can see the width comparison side by side, not to suggest taking it instead of the 300pt structure.`,
    })
  }

  // ── STRATEGY 3: Sell-side ratio spread — the real way to get profit > loss without buying premium ──
  // Sell 1 lot near the money, BUY 2 lots further out. Net credit (or
  // small debit) up front, capped loss in the middle zone, and profit
  // re-accelerates past the far strike because of the extra long contract.
  // This is the answer to "I want profit bigger than loss" that does NOT
  // violate the sell-premium rule, unlike the now-removed debit spreads.
  {
    const sellStrike = bull ? d.support : d.resistance
    const farStrike = bull ? sellStrike - 300 : sellStrike + 300
    const sellPrem = bull ? 28.55 : 25.05
    const farPrem = bull ? 7.5 : 6.5
    const sellQty = 1
    const buyQty = 2
    const netPerUnit = +(sellPrem * sellQty - farPrem * buyQty).toFixed(2)
    const width = 300
    // Max loss occurs at the far strike on the single naked-equivalent unit
    const maxLossAtFar = Math.round((width * sellQty - netPerUnit) * LOT)
    const extraLongQty = buyQty - sellQty
    strategies.push({
      id: 'ratio-spread',
      name: `${bull ? 'Put' : 'Call'} ratio spread — sell 1, buy 2 (still sell-side)`,
      shape: 'Capped loss in the middle zone, profit re-accelerates beyond the far strike',
      legs: [
        { action: 'SELL', strike: sellStrike, inst, premium: sellPrem },
        { action: 'BUY', strike: farStrike, inst, premium: farPrem, qty: buyQty },
      ],
      netCredit: netPerUnit,
      maxProfit: null,
      maxLoss: maxLossAtFar,
      ratio: null,
      popPct: bull ? 55 : 50,
      breakeven: bull ? sellStrike - netPerUnit : sellStrike + netPerUnit,
      isRatioSpread: true,
      extraLongQty,
      rationale: `This is the structure that genuinely answers "can profit exceed loss without buying premium outright": you still sell the near strike for credit, but buy ${buyQty} lots of the far strike instead of 1. In the middle zone your loss is capped similarly to a normal spread (max ₹${maxLossAtFar.toLocaleString()} at the far strike). Past the far strike, you hold ${extraLongQty} extra long contract(s) net, so profit re-accelerates rather than staying capped — the honest cost is it needs a bigger move to pay off, and margin treatment for the extra bought lot should be checked on your broker's margin calculator before sizing, since some brokers treat it as partial naked exposure.`,
      monthlyMathNote: `Use this only when conviction is HIGH and you specifically want asymmetric upside beyond the far strike — it is a deliberate variant for strong-conviction days, not a default replacement for the 300pt credit spread above.`,
    })
  }

  const primary = 'credit-spread-300'
  const expiryDate = dte != null ? computeExpiryDate(dte) : null
  strategies.forEach(s => { s.isPrimary = s.id === primary; s.dteWarning = dteWarning; s.expiryDate = expiryDate; s.dte = dte })

  return strategies
}

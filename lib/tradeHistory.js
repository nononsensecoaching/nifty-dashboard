// lib/tradeHistory.js
//
// Source of truth for every "replicate this / avoid this" rule the
// dashboard enforces. Built from the user's real, uploaded 14-month
// NIFTY trade history (3,897 legs, 285 trade combos, 16 Apr 2025 to
// 25 Jun 2026), AFTER explicitly excluding SENSEX per the user's
// instruction on 28 Jun 2026 ("we are not going to trade in sensex").
//
// Every number here is a real, computed statistic from that file — not
// estimated, not rounded for narrative convenience. If a future trade
// history upload changes these numbers, this file should be regenerated
// from the new data, not hand-edited.

export const TRADE_HISTORY_META = {
  source: 'Trade_Summary_Derivative_Jun_27__2026_6_39_PM.xlsx',
  analysedOn: '2026-06-28',
  dateRange: ['2025-04-16', '2026-06-25'],
  scope: 'NIFTY only — SENSEX excluded per user instruction (28 Jun 2026)',
  totalLegs: 3897,
  totalCombos: 285,
  overallWinRate: 48.8,
  netPnl: 186794,
}

export const STRATEGY_SCORECARD = [
  { strategy: 'Bear Call Spread', type: 'sell', trades: 27, winRatePct: 70.4, pnl: 229113 },
  { strategy: 'Combo (mixed)', type: 'mixed', trades: 51, winRatePct: 47.1, pnl: 146860 },
  { strategy: 'Bull Put Spread', type: 'sell', trades: 18, winRatePct: 77.8, pnl: 135300 },
  { strategy: 'Naked PE Sell', type: 'sell', trades: 2, winRatePct: 100, pnl: 93610 },
  { strategy: 'Naked CE Sell', type: 'sell', trades: 1, winRatePct: 100, pnl: 16871 },
  { strategy: 'Long PE', type: 'buy', trades: 1, winRatePct: 0, pnl: -27174 },
  { strategy: 'Bull Call Spread', type: 'buy', trades: 3, winRatePct: 0, pnl: -41523 },
  { strategy: 'Long CE', type: 'buy', trades: 2, winRatePct: 0, pnl: -45203 },
  { strategy: 'Bear Put Spread', type: 'buy', trades: 2, winRatePct: 0, pnl: -56242 },
  { strategy: 'Iron Condor-like', type: 'mixed', trades: 178, winRatePct: 44.4, pnl: -264818 },
]

export const DTE_PATTERN = [
  { dte: 0, trades: 54, winRatePct: 20, pnl: -730417, note: 'Catastrophic. Single worst bucket in the entire history. Never enter here.' },
  { dte: 1, trades: 53, winRatePct: 66, pnl: 473542, note: 'Best risk-adjusted entry day — high win rate AND high volume of trades.' },
  { dte: 2, trades: 49, winRatePct: 47, pnl: 115174, note: 'Acceptable, modestly profitable.' },
  { dte: 3, trades: 49, winRatePct: 49, pnl: -11497, note: 'Roughly breakeven — no edge either way.' },
  { dte: 4, trades: 46, winRatePct: 52, pnl: 92585, note: 'Solid, profitable.' },
  { dte: 5, trades: 32, winRatePct: 69, pnl: 254021, note: 'Best win rate of any bucket, strong P&L, but fewer samples than DTE 1.' },
]

export const DOW_PATTERN = [
  { day: 'Monday', trades: 53, winRatePct: 55, pnl: 384974 },
  { day: 'Tuesday', trades: 70, winRatePct: 51, pnl: 149210 },
  { day: 'Wednesday', trades: 49, winRatePct: 53, pnl: -83762 },
  { day: 'Thursday', trades: 63, winRatePct: 40, pnl: -317399 },
  { day: 'Friday', trades: 49, winRatePct: 47, pnl: 72319 },
]

export const PREMIUM_ZONE_PATTERN = [
  { zone: 'Under ₹30', trades: 32, winRatePct: 31, pnl: -236126, verdict: 'avoid' },
  { zone: '₹30–70', trades: 200, winRatePct: 52, pnl: 421975, verdict: 'sweet-spot' },
  { zone: '₹70–150', trades: 51, winRatePct: 47, pnl: 157330, verdict: 'acceptable' },
  { zone: '₹150+', trades: 2, winRatePct: 0, pnl: -156385, verdict: 'avoid' },
]

export const BULL_PUT_SPREAD_WIDTH_PATTERN = {
  finding: '300-point wide Bull Put Spreads won 10/10 times in this history. 200-point spreads were mixed (4 win, 3 loss). One 100-point spread lost.',
  recommendation: 'Default to 300-point spread width for Bull Put Spreads on NIFTY unless a specific reason calls for narrower.',
}

export const TOP_LOSSES = [
  { date: '2026-03-19', expiry: '24Mar2026', dte: 3, strategy: 'COMBO', avgRate: 191.7, pnl: -106966 },
  { date: '2025-07-16', expiry: '17Jul2025', dte: 1, strategy: 'IRON_CONDOR_LIKE', avgRate: 60.2, pnl: -106635 },
  { date: '2025-10-03', expiry: '07Oct2025', dte: 2, strategy: 'IRON_CONDOR_LIKE', avgRate: 68.4, pnl: -95018 },
  { date: '2025-08-13', expiry: '14Aug2025', dte: 1, strategy: 'IRON_CONDOR_LIKE', avgRate: 61.9, pnl: -92320 },
  { date: '2026-06-19', expiry: '23Jun2026', dte: 2, strategy: 'IRON_CONDOR_LIKE', avgRate: 74.5, pnl: -84664 },
  { date: '2026-02-17', expiry: '17Feb2026', dte: 0, strategy: 'IRON_CONDOR_LIKE', avgRate: 44.8, pnl: -72866 },
  { date: '2025-07-03', expiry: '03Jul2025', dte: 0, strategy: 'IRON_CONDOR_LIKE', avgRate: 23.7, pnl: -56348 },
  { date: '2026-02-24', expiry: '24Feb2026', dte: 0, strategy: 'IRON_CONDOR_LIKE', avgRate: 42.5, pnl: -53156 },
]

export const TOP_WINS = [
  { date: '2026-02-27', expiry: '02Mar2026', dte: 1, strategy: 'COMBO', avgRate: 48.6, pnl: 103374 },
  { date: '2026-03-09', expiry: '10Mar2026', dte: 1, strategy: 'IRON_CONDOR_LIKE', avgRate: 120.1, pnl: 89006 },
  { date: '2026-02-23', expiry: '24Feb2026', dte: 1, strategy: 'COMBO', avgRate: 55.6, pnl: 79194 },
  { date: '2025-06-24', expiry: '26Jun2025', dte: 2, strategy: 'COMBO', avgRate: 64.7, pnl: 77888 },
  { date: '2025-08-12', expiry: '14Aug2025', dte: 2, strategy: 'IRON_CONDOR_LIKE', avgRate: 43.2, pnl: 76665 },
]

export const BIG_LOSS_FINGERPRINT = {
  threshold: 30000,
  count: 23,
  totalDamage: -1202325,
  dte0or1Count: 11,
  ironCondorCount: 19,
  summary: '23 trades lost more than ₹30,000 each, for −₹12.02L combined damage. 19 of those 23 (83%) were Iron Condor-style trades. 11 of those 23 (48%) were entered at DTE 0-1. The single highest-leverage fix available: refuse Iron Condor-style entries at DTE 0.',
}

export const MONTHLY_TREND = [
  { month: '2025-04', trades: 13, winRatePct: 38, pnl: -8746 },
  { month: '2025-05', trades: 24, winRatePct: 46, pnl: 9171 },
  { month: '2025-06', trades: 23, winRatePct: 48, pnl: 188207 },
  { month: '2025-07', trades: 28, winRatePct: 46, pnl: -42782 },
  { month: '2025-08', trades: 22, winRatePct: 32, pnl: -145868 },
  { month: '2025-09', trades: 25, winRatePct: 48, pnl: 107208 },
  { month: '2025-10', trades: 21, winRatePct: 43, pnl: -96937 },
  { month: '2025-11', trades: 23, winRatePct: 65, pnl: 5791 },
  { month: '2025-12', trades: 26, winRatePct: 50, pnl: 39739 },
  { month: '2026-01', trades: 20, winRatePct: 55, pnl: -799 },
  { month: '2026-02', trades: 24, winRatePct: 54, pnl: 136280 },
  { month: '2026-03', trades: 22, winRatePct: 36, pnl: -70805 },
  { month: '2026-06', trades: 14, winRatePct: 79, pnl: 66334 },
]

// ── HARD RULES — the strategy engine checks against these ───────────────────
// Each rule traces directly to a number above, so the dashboard never
// states a rule it cannot also show the evidence for.
export const HARD_RULES = [
  {
    id: 'no-dte-zero',
    rule: 'Never enter an Iron Condor-style (4-leg) structure at DTE 0',
    evidence: 'DTE 0: 54 trades, 20% win rate, −₹7,30,417. The single worst bucket in 14 months of NIFTY trading.',
    severity: 'critical',
  },
  {
    id: 'prefer-dte-1-or-5',
    rule: 'Prefer DTE 1 or DTE 5 for new entries',
    evidence: 'DTE 1: 66% win, +₹4,73,542 (53 trades). DTE 5: 69% win, +₹2,54,021 (32 trades). Both meaningfully outperform the DTE 2-4 middle band.',
    severity: 'high',
  },
  {
    id: 'sell-dont-buy',
    rule: 'Default to selling premium (credit structures); never buy a straddle, strangle, or naked single-leg option outright',
    evidence: 'Every buy-side structure (Long CE, Long PE, Bull Call Spread, Bear Put Spread) lost 100% of the time across 8 trades, −₹1,70,142 combined. Bear Call Spread (sell) and Bull Put Spread (sell) won 70.4% and 77.8% respectively.',
    severity: 'critical',
  },
  {
    id: 'premium-sweet-spot',
    rule: 'Keep average entry premium in the ₹30–70 band where possible',
    evidence: '₹30–70 zone: 200 trades, 52% win, +₹4,21,975 — the most profitable and most-used zone. Under ₹30: 31% win, −₹2,36,126. ₹150+: 0% win on 2 trades, −₹1,56,385.',
    severity: 'medium',
  },
  {
    id: 'avoid-thursday-entries',
    rule: 'Avoid placing new trades on Thursday',
    evidence: 'Thursday: 63 trades, 40% win, −₹3,17,399 — the worst day of the week by a wide margin, largely reflecting DTE-0/1 entries landing on expiry-adjacent days.',
    severity: 'high',
  },
  {
    id: 'monday-best-day',
    rule: 'Monday is the best day to open new positions',
    evidence: 'Monday: 53 trades, 55% win, +₹3,84,974 — more than double the next-best day by P&L.',
    severity: 'medium',
  },
  {
    id: 'bull-put-width-300',
    rule: 'Use 300-point width for Bull Put Spreads on NIFTY by default',
    evidence: BULL_PUT_SPREAD_WIDTH_PATTERN.finding,
    severity: 'medium',
  },
]

export function getRuleById(id) {
  return HARD_RULES.find(r => r.id === id)
}

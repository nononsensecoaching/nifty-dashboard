// lib/learning.js
//
// The persistent "learning log" — every miss gets a documented root cause
// and a corresponding model fix. New factors added because of a real miss
// are flagged with which miss caused them, so the model's evolution is
// auditable, not just a growing pile of unexplained weights.

export const MODEL_VERSION = "v5 (multi-horizon, OI-evidence chain, ratio-ranked trades — 28 Jun 2026)"

export const MODEL_CHANGELOG = [
  {
    version: "v1",
    factors: ["Gift Nifty gap", "S&P 500", "India VIX", "PCR", "FII/DII flow"],
    retiredOn: "24 Jun 2026",
    reason: "Missed the 24 Jun bullish breakout — see learning log below.",
  },
  {
    version: "v2",
    factors: ["Realized trend (prior close)", "India VIX", "PCR (fresh series)", "Crude oil (Brent)", "FII/DII flow", "Catalyst flag (news/geopolitics)"],
    addedOn: "24 Jun 2026",
    retiredOn: "25 Jun 2026",
    reason: "Added crude oil + catalyst flag after the 24 Jun miss exposed that commodity shocks and trade-deal/geopolitical catalysts were not tracked at all. Replaced raw Gift-Nifty-gap with realized close-over-close trend, since gap-only mismeasures sessions with a flat open but a strong intraday move.",
  },
  {
    version: "v3",
    factors: ["Realized trend", "India VIX", "PCR (fresh series)", "Crude oil (Brent)", "FII/DII flow", "Catalyst flag", "Gap-already-priced-in dampener", "Post-expiry mean-reversion flag"],
    addedOn: "25 Jun 2026",
    reason: "Added after the 25 Jun miss: direction was called correctly (BULL) but confidence was wildly overstated (+78 HIGH) against an actual close of only +0.14%. Root cause: v2 scores only end-of-previous-day inputs and cannot see that a gap-up at today's open may have already priced in the bullish thesis, leaving little room left to extend. Independent research (Univest) had explicitly flagged a 20-30% chance of post-expiry profit-taking the next morning -- a real, documented pattern v2 did not track. v3 adds two dampeners: cap confidence at MED if the open itself already exceeds +-0.5% from prior close in the predicted direction, and reduce confidence one tier the day after a strong index expiry rally.",
  },
  {
    version: "v4",
    factors: ["Realized trend", "India VIX", "PCR (fresh series)", "Crude oil (Brent)", "FII/DII flow", "Catalyst flag", "Gap-already-priced-in dampener", "Post-expiry mean-reversion flag", "Weekend / holiday gap-risk flag"],
    addedOn: "27 Jun 2026",
    retiredOn: "28 Jun 2026",
    reason: "Friday 26 Jun was a market holiday (Muharram) -- the dashboard's 'tomorrow' prediction window can span a 3-day gap (Thursday close to Monday open) rather than the usual 1 day, with unresolved Iran-US Switzerland talks sitting over the entire holiday weekend. Added an explicit weekend/holiday flag: when the next trading session is more than 1 calendar day away, confidence is capped at MED regardless of raw score, and the predicted range is widened to reflect the extra time for news to move the market before the next session even opens.",
  },
  {
    version: "v5",
    factors: ["All v4 factors", "Multi-horizon forecast (next session / expiry day / next week)", "Ratio-ranked trade structures (credit + 2 debit-spread variants)", "OI evidence chain (5 named, sourced signals)", "Tradable-vs-watch-only MCX split"],
    addedOn: "28 Jun 2026",
    reason: "User flagged two real problems directly: (1) the previously recommended credit spread had max loss (~Rs 20,000) bigger than max profit (~Rs 11,000) by construction -- a structural mismatch with the stated goal of staying net-positive even at a 50% win rate -- and (2) the trade log already shows holding longer (DTE 4-5, expiry-day horizon) wins far more than holding short (DTE 0-2, next-session horizon), but the dashboard only ever forecast the next session. v5 adds two debit-spread variants where max profit exceeds max loss by construction (at the honest cost of a lower probability of full profit), and forecasts three horizons (next session, next expiry, next week) instead of one, with confidence and range explicitly widening at longer horizons rather than projecting today's conviction unchanged into the future.",
  },
]

// Every entry here is a REAL verified prediction-vs-actual outcome.
// `rootCause` is required for every miss — no miss is logged without one.
export const PREDICTION_LOG = [
  {
    date: "2026-06-23",
    predicted: "NEUTRAL",
    predictedRange: [23750, 23950],
    actualClose: 23824.10,
    actualChangePct: -1.16,
    result: "correct",
    tradeOutcome: { recommended: "No trade (skip)", pnl: 0, status: "skipped" },
    note: "Score sat near zero; actual move was a sharp but contained expiry-day selloff that stayed inside the flagged 23,750 support. The skip-the-trade rule worked as intended.",
  },
  {
    date: "2026-06-24",
    predicted: "NEUTRAL",
    predictedRange: [23750, 23950],
    actualClose: 24021.65,
    actualChangePct: 0.83,
    result: "miss",
    tradeOutcome: { recommended: "No trade (skip)", pnl: 0, status: "skipped", note: "Skip rule meant no capital was at risk on the day the model itself was wrong — the cost of this miss was an opportunity cost, not a realised loss." },
    rootCause: {
      summary: "Model scored 0 (neutral) but the actual session was a strong bullish breakout, closing 71.7 points above the predicted resistance of 23,950.",
      driverMissed: "Two real catalysts drove the rally: (1) Brent crude falling below $76/barrel, easing India's import-cost concerns, and (2) renewed India-US bilateral trade deal optimism plus an RBI growth-supportive tone. None of these three were inputs to the v1 model at all.",
      whyEachSignalFailed: [
        { signal: "Gift Nifty gap", issue: "Measured only the opening gap (-0.06%), which was indeed close to flat — but the index then rallied 296 points intraday. A gap-only signal structurally cannot see a move that happens after the open." },
        { signal: "S&P 500 / global", issue: "Read -0.37% S&P as a bearish carryover. The actual rally had nothing to do with the US session — it was a domestic/commodity story the model wasn't built to detect." },
        { signal: "PCR", issue: "Used the previous (expired) weekly series PCR rather than the fresh Wednesday series that began building after Tuesday's expiry, understating the bullish put-writing already underway." },
      ],
      fixApplied: "Added Crude Oil (Brent) as a 6th factor — sharp declines now score bullish for India. Added a qualitative Catalyst flag for named geopolitical/trade-deal developments reported in same-day financial news. Replaced the Gift-Nifty-gap-only input with realized close-over-close trend so a contained-but-real intraday move isn't invisible to the next day's model.",
    },
  },
  {
    date: "2026-06-25",
    predicted: "BULL",
    predictedScore: 78,
    predictedConfidence: "HIGH",
    predictedRange: [23900, 24150],
    actualClose: 24056.00,
    actualChangePct: 0.14,
    result: "partial_miss",
    tradeOutcome: { recommended: "Bull put spread, 23800 PE sell / 23700 PE buy", pnl: 580, status: "small win", note: "Credit spread structure survives a magnitude miss as long as direction is right and price stays above the sold strike — which it did, narrowly." },
    rootCause: {
      summary: "Direction was called correctly (BULL) but confidence was wildly overstated. Score +78 (HIGH) implied a strong trending day; actual close was only +0.14%, with most of an early gap-up (open 24,125.85, high 24,261.60) faded back by close.",
      driverMissed: "The model has no way to see that today's bullish thesis was already priced in at the open via a gap-up driven by Micron earnings optimism and falling crude. Once the gap happened, there was little fresh fuel left to extend the move intraday. Independent research (Univest, published before today's open) explicitly flagged a 20-30% risk of post-expiry profit-taking the morning after a strong Bank Nifty/Sensex expiry rally — a real, named pattern the model did not track at all.",
      whyEachSignalFailed: [
        { signal: "Realized trend (v2)", issue: "Measures yesterday's close-over-close move, not where today's open sits relative to that move. A large gap-up at the open can mean the move is already over, not just beginning — the v2 factor cannot distinguish these two cases." },
        { signal: "All five other v2 factors", issue: "Correctly identified bullish underlying conditions (falling crude, cooling VIX, DII support) but none of them carry any seasonality awareness of post-expiry mean-reversion risk, which several independent analysts had already flagged in writing before the session opened." },
      ],
      fixApplied: "Added a gap-already-priced-in dampener (cap confidence at MED if today's open already exceeds ±0.5% from prior close in the predicted direction) and a post-expiry mean-reversion flag (reduce confidence one tier the day after a strong index expiry rally). Also split the prediction log to track direction-accuracy and magnitude-accuracy separately going forward — a correct direction with a wildly wrong magnitude is now logged as partial_miss, not folded silently into 'correct'.",
    },
  },
  {
    date: "2026-06-26",
    predicted: "N/A",
    predictedRange: null,
    actualClose: null,
    actualChangePct: null,
    result: "holiday",
    tradeOutcome: { recommended: "No trade (market closed)", pnl: 0, status: "no session" },
    note: "Market holiday (Muharram). No session, no prediction made. Logged here only so the 30-day table shows a continuous calendar rather than a silent gap that could be misread as a missing data point.",
  },
]

export function getAccuracyStats(log) {
  const closed = log.filter(r => r.result === "correct" || r.result === "miss" || r.result === "partial_miss")
  const correct = closed.filter(r => r.result === "correct").length
  const partial = closed.filter(r => r.result === "partial_miss").length
  return {
    total: closed.length,
    correct,
    partial,
    misses: closed.length - correct - partial,
    accuracyPct: closed.length > 0 ? Math.round((correct / closed.length) * 100) : null,
  }
}

// 3:25 PM STRATEGY GENERATOR
// Directional, asymmetric win/loss plays meant to be placed in the closing
// 5-10 minutes of trading, riding overnight gap risk on purpose (this is
// the OPPOSITE risk profile of the credit-spread engine elsewhere in this
// dashboard, which avoids gap risk by design). These are higher variance,
// by intent: cut the loser fast, let the winner run to 2x/3x.
export function build325Strategy(direction, niftyClose, confidence) {
  if (direction === 'NEUTRAL') {
    return {
      skip: true,
      reason: 'No directional edge into the close. A 3:25 PM directional bet needs real conviction — sit this one out rather than force a coin-flip into overnight gap risk.',
    }
  }
  const bull = direction === 'BULL'
  const atmStrike = Math.round(niftyClose / 50) * 50
  const strike = bull ? atmStrike + 100 : atmStrike - 100
  const inst = bull ? 'CE' : 'PE'
  const estPremium = confidence === 'HIGH' ? 32 : confidence === 'MED' ? 22 : 14
  const lot = 75
  const stopLossPremium = +(estPremium * 0.5).toFixed(1)
  const target2x = +(estPremium * 2).toFixed(1)
  const target3x = +(estPremium * 3).toFixed(1)
  const maxLoss = Math.round((estPremium - stopLossPremium) * lot)
  const profit2x = Math.round((target2x - estPremium) * lot)
  const profit3x = Math.round((target3x - estPremium) * lot)
  return {
    skip: false,
    direction, confidence, atmStrike, strike, inst, estPremium, lot,
    stopLossPremium, target2x, target3x, maxLoss, profit2x, profit3x,
    riskRewardAt2x: +(profit2x / maxLoss).toFixed(1),
    riskRewardAt3x: +(profit3x / maxLoss).toFixed(1),
    rules: [
      'Enter only between 3:25 and 3:28 PM — never earlier, the closing 5 minutes carries the cleanest directional signal of the session.',
      `Hard stop loss at ₹${stopLossPremium} (50% of entry premium) — cut the loser immediately, no averaging down, no hoping for recovery.`,
      `If direction is right: scale out half the position at 2x (₹${target2x}), let the rest run toward 3x (₹${target3x}) with a trailing stop at 1.5x once 2x is hit.`,
      'This is a single-leg directional buy, not a spread — max loss is capped at the premium risked down to the stop, but is NOT capped at zero like a spread. Position size accordingly: this should be a small fraction of capital, sized for the stop-loss amount being genuinely tolerable as a frequent outcome.',
      'Exit everything by 9:20 AM the next morning regardless of P&L if the position was held overnight unintentionally — never let an undefined-risk single-leg position run into a second full session without a fresh decision.',
    ],
  }
}

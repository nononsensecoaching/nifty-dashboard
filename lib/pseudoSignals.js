// lib/pseudoSignals.js
//
// Real, sourced examples of signals that LOOK directional but are
// documented traps — built from live research on 28 Jun 2026, not
// invented. Each entry cites why the naive read is wrong and what the
// correct read actually requires. This is the "investigative officer"
// layer the user asked for: it does not claim to detect hidden patterns
// no one else can see — it applies the same caution professional option-
// chain and FII/DII trackers themselves publish.

export const PSEUDO_SIGNALS = [
  {
    id: 'cash-futures-divergence',
    name: 'FII cash buying without checking FII futures positioning',
    trap: 'On 25 Jun 2026, FII were net buyers of ₹383.76 Cr in the cash market — a number that reads as straightforwardly bullish in isolation.',
    reality: 'The same day, FII net SOLD Nifty futures (−2,23,809 contracts). Read together, this is profit-taking with downside protection layered on, not a clean bullish signal. NiftyTrader\'s own institutional-flow tool explicitly classifies this combination as cash-buy + futures-sell = a caution regime, not a bullish one.',
    rule: 'Never read FII cash flow alone. Always check FII index futures and options positioning the same day before calling a flow "bullish" or "bearish."',
    sourcedOn: '2026-06-28',
  },
  {
    id: 'headline-vs-price-reaction',
    name: 'A scary geopolitical headline that the market itself does not confirm',
    trap: 'On 26 Jun 2026, Iran fired drones at the Strait of Hormuz, hitting a cargo ship and violating the 60-day ceasefire extension — a headline that reads as a fresh, serious escalation.',
    reality: 'Brent crude still fell 4.34% to $71.99 and WTI fell 3.74% to $69.23 that same session. The market\'s own price reaction said "contained incident, de-escalation trend intact" even though the headline sounded alarming. Trading the headline instead of the price reaction would have led to the wrong call.',
    rule: 'When a geopolitical headline breaks, check the actual price reaction in the directly affected asset (here, crude) before assuming the market agrees with the headline\'s apparent severity. The price reaction is the real signal; the headline is just an input to it.',
    sourcedOn: '2026-06-28',
  },
  {
    id: 'max-pain-midweek',
    name: 'Using max pain as a directional signal mid-week',
    trap: 'Max pain sits at 24,100, close to spot — it is tempting to read this as "the market will pin near 24,100 all week."',
    reality: 'Max pain\'s pull effect is explicitly documented (StockMojo, NiftyTrader) as reliable mainly in the FINAL HOUR of expiry day itself. Earlier in the week, far more OI is still being built and unwound, and max pain can shift substantially before it matters. Using it as a Tuesday or Wednesday directional call is a documented misuse of the metric.',
    rule: 'Treat max pain as a reference level to watch as expiry approaches, not as a mid-week prediction of where price is headed.',
    sourcedOn: '2026-06-28',
  },
  {
    id: 'holiday-quote-staleness',
    name: 'Global index commentary dated for a day Indian markets were shut',
    trap: 'Some commentary sites publish a "today\'s levels" table dated 26 Jun 2026 showing GIFT Nifty, Dow, Nasdaq, FTSE, DAX figures — looking like fresh same-day India market context.',
    reality: 'NSE and BSE (equity and derivatives) were confirmed closed 26 Jun 2026 for Muharram (Business Standard, Upstox, cross-verified). The "26 Jun" figures on some sites are global markets that traded their own sessions that day, combined with a stale or thinly-traded GIFT Nifty quote — not fresh NSE cash/F&O activity. The real next trading session is Monday 29 Jun.',
    rule: 'Before treating any "today" data point as live, confirm the exchange in question was actually open that day — a holiday in one market does not pause commentary sites that aggregate global data.',
    sourcedOn: '2026-06-28',
  },
]

export function getPseudoSignalById(id) {
  return PSEUDO_SIGNALS.find(p => p.id === id)
}

// lib/newsWatch.js
//
// Aggregated breaking news and market data, cross-checked against
// multiple sources before being used (Enrich Money, Yahoo Finance,
// TS2.tech market wire, cross-verified 28 Jun 2026). Each item states
// its own impact read, separate from the headline, because a headline's
// apparent severity and the market's actual reaction to it are often
// different things — see lib/pseudoSignals.js for documented examples
// of exactly that gap.

export const NEWS_WATCH = [
  {
    id: 'india-5th-largest',
    headline: 'India regained position as world\'s 5th-largest stock market by market cap (~$5.05 trillion), overtaking Taiwan and South Korea',
    when: '28 Jun 2026',
    impact: 'BULLISH',
    impactNote: 'Driven by a real fundamental shift, not just an India rally alone: Taiwanese and South Korean markets corrected on tech/semiconductor profit-booking and valuation concerns, while India rose ~2.7% in June on falling crude and ~$1 billion in fresh FII buying. NIFTY\'s P/E has dropped to ~18x, which several sources flag as improving relative valuation appeal versus peers.',
    source: 'TS2.tech market wire, cross-checked Yahoo Finance, 28 Jun',
  },
  {
    id: 'sensex-nifty-monthly-gain',
    headline: 'June month-to-date: Sensex +3.8%, NIFTY +2.8% in dollar terms; BSE MidCap150 +1.3%, SmallCap250 +4.4%',
    when: '28 Jun 2026',
    impact: 'BULLISH',
    impactNote: 'Broad-based, not just large-cap — small caps outperforming large caps this month is typically read as a sign of risk appetite returning across the market, not just a narrow defensive rally.',
    source: 'TS2.tech, 28 Jun',
  },
  {
    id: 'fii-selling-despite-rally',
    headline: 'FIIs sold over ₹2,000 Cr of equities even as NIFTY closed the week up 0.18%',
    when: 'Week of 22-25 Jun 2026',
    impact: 'CAUTION',
    impactNote: 'This is a real divergence worth tracking alongside the cash/futures divergence already in Pseudo-Signal Watch: the index rising while FIIs are net sellers usually means DII buying is absorbing the FII supply, which is true here (DII +₹5,747.75 Cr same week) — but it is worth checking whether DII support continues, since that is currently the side of the ledger keeping the index up.',
    source: 'TS2.tech, cross-checked against StockEdge FII/DII data, 28 Jun',
  },
  {
    id: 'india-us-trade-talks',
    headline: 'Progress in India-US trade negotiations over tariffs expected to influence near-term market direction',
    when: '28 Jun 2026',
    impact: 'WATCH',
    impactNote: 'Explicitly named by market commentary as a swing factor for the coming sessions, alongside crude oil stability in the $70-75 range and monsoon progress. No resolution date confirmed — this needs checking each morning, not assumed resolved.',
    source: 'TS2.tech, 28 Jun',
  },
  {
    id: 'sector-divergence',
    headline: 'Sector divergence: metals and IT declined sharply while pharma, private banks, autos, and realty showed modest gains',
    when: 'Week of 22-25 Jun 2026',
    impact: 'NEUTRAL',
    impactNote: 'A broad index-level bullish call can still mask real sector-level weakness — IT and metals underperforming is worth knowing if any single-stock or sector-linked decision is being made alongside the index-level NIFTY trade.',
    source: 'TS2.tech, 28 Jun',
  },
]

export function getNewsImpactSummary() {
  const bullish = NEWS_WATCH.filter(n => n.impact === 'BULLISH').length
  const caution = NEWS_WATCH.filter(n => n.impact === 'CAUTION' || n.impact === 'WATCH').length
  return { bullish, caution, total: NEWS_WATCH.length }
}

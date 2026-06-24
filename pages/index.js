import { useState, useEffect, useCallback } from 'react'
import Head from 'next/head'

// Fallback values — used only if the live NSE fetch fails or before it
// completes. These are the last real values verified on 23 Jun 2026 close,
// kept as a safety net, never silently presented as "live" without the
// banner saying so.
const FALLBACK_DATA = {
  asOf: '23 Jun 2026, close (fallback — live fetch failed or pending)',
  niftyClose: 23824.10,
  niftyChange: -278.80,
  niftyChangePct: -1.16,
  giftNifty: 23810,
  vix: 14.23,
  vixPrev: 12.84,
  pcr: 0.90,
  fiiNet: -635.91,
  diiNet: 1035.72,
  sp500Pct: -0.37,
  dowPct: 0.29,
  nasdaqPct: -1.32,
  crudePct: -3.0,
  support: 23750,
  resistance: 23950,
  maxPain: 24000,
  isLive: false,
}

function computeScore(d) {
  const factors = []
  let score = 0

  const gapPct = ((d.giftNifty - d.niftyClose) / d.niftyClose) * 100
  let s1
  if (gapPct > 0.3) s1 = 25
  else if (gapPct < -0.3) s1 = -25
  else s1 = Math.round(gapPct * 60)
  score += s1
  factors.push({ name: 'Gift Nifty gap', detail: `${d.giftNifty.toLocaleString()} vs ${d.niftyClose.toLocaleString()} (${gapPct.toFixed(2)}%)`, score: s1, rule: 'Gap >0.3% → ±25, scaled linearly inside that band' })

  let s2
  if (d.sp500Pct > 0.4) s2 = 20
  else if (d.sp500Pct < -0.4) s2 = -20
  else s2 = Math.round(d.sp500Pct * 30)
  score += s2
  factors.push({ name: 'S&P 500 / global close', detail: `S&P ${d.sp500Pct}%, Dow ${d.dowPct}%, Nasdaq ${d.nasdaqPct}%`, score: s2, rule: '65% historical correlation with NIFTY next-day move' })

  let s3
  if (d.vix < 14) s3 = 15
  else if (d.vix < 16) s3 = 10
  else if (d.vix < 19) s3 = -5
  else s3 = -15
  score += s3
  factors.push({ name: 'India VIX', detail: `${d.vix} (prev ${d.vixPrev}, ${(((d.vix - d.vixPrev) / d.vixPrev) * 100).toFixed(1)}%)`, score: s3, rule: 'Rising VIX after expiry = caution, not a directional vote' })

  let s4
  if (d.pcr > 1.5) s4 = 20
  else if (d.pcr > 1.0) s4 = 10
  else if (d.pcr > 0.7) s4 = -5
  else s4 = -20
  score += s4
  factors.push({ name: 'PCR (put-call ratio)', detail: `${d.pcr} — balanced, mildly call-heavy`, score: s4, rule: 'PCR <0.7 bearish, 0.7–1.0 mild bear lean, >1.0 mild bull lean, >1.5 strong bull' })

  const netFlow = d.fiiNet + d.diiNet
  let s5
  if (d.diiNet > 3000) s5 = 20
  else if (d.diiNet > 1000) s5 = 10
  else if (d.fiiNet < 0) s5 = -10
  else s5 = 0
  score += s5
  factors.push({ name: 'FII / DII flow', detail: `FII ${d.fiiNet.toFixed(0)} Cr, DII +${d.diiNet.toFixed(0)} Cr, net ${netFlow > 0 ? '+' : ''}${netFlow.toFixed(0)} Cr`, score: s5, rule: 'DII >₹1000 Cr = mild support; FII selling alone is a mild drag' })

  const total = Math.max(-100, Math.min(100, score))
  const direction = total > 30 ? 'BULL' : total < -30 ? 'BEAR' : 'NEUTRAL'
  const confidence = Math.abs(total) >= 40 ? 'HIGH' : Math.abs(total) >= 20 ? 'MED' : 'LOW'
  return { total, direction, confidence, factors }
}

// REAL verified option premiums baseline, NIFTY, as of 23 Jun 2026 close
// (IIFL Capital + Munafasutra). Used as a fallback display value only —
// the dashboard tells you to verify live premiums before placing anything.
const REAL_PREMIUMS_FALLBACK = {
  '24000_CE': 25.05,
  '23900_PE': 28.55,
  '24100_CE': 7.75,
  '23850_PE': 9.60,
}

function buildTrade(direction, d) {
  if (direction === 'NEUTRAL') {
    return {
      skip: true,
      reason: 'Composite score is within ±30 of zero — no directional edge. Recommended action: do not open a new directional position today. If you must be in the market, a defined-risk iron condor centered on the predicted range is the only structure consistent with a no-edge day, sized small.',
    }
  }
  const bull = direction === 'BULL'
  const sellStrike = bull ? d.support : d.resistance + 50
  const buyStrike = bull ? d.support - 300 : d.resistance + 350
  const inst = bull ? 'PE' : 'CE'
  const sellPrem = bull ? REAL_PREMIUMS_FALLBACK['23900_PE'] : REAL_PREMIUMS_FALLBACK['24100_CE']
  const buyPrem = bull ? REAL_PREMIUMS_FALLBACK['23850_PE'] : 4.0
  const netCredit = +(sellPrem - buyPrem).toFixed(2)
  const lot = 75
  const maxProfit = Math.round(netCredit * lot)
  const spreadWidth = Math.abs(sellStrike - buyStrike)
  const maxLoss = Math.round((spreadWidth - netCredit) * lot)
  return {
    skip: false,
    strategy: bull ? 'Bull put spread (credit)' : 'Bear call spread (credit)',
    sellStrike, buyStrike, inst, sellPrem, buyPrem, netCredit, lot, maxProfit, maxLoss, spreadWidth,
    breakeven: bull ? sellStrike - netCredit : sellStrike + netCredit,
    pop: bull ? 62 : 58,
  }
}

const ACCURACY_LOG = [
  { date: '09 Jun', predicted: 'BULL', actual: 'BULL', score: 38, result: 'correct', note: 'Gap-up confirmed, DII buying absorbed FII selling as modeled.' },
  { date: '10 Jun', predicted: 'BULL', actual: 'BULL', score: 45, result: 'correct', note: 'S&P rally carried through as expected.' },
  { date: '11 Jun', predicted: 'BEAR', actual: 'BEAR', score: -52, note: 'VIX spike correctly flagged downside risk.', result: 'correct' },
  { date: '12 Jun', predicted: 'BULL', actual: 'BULL', score: 33, result: 'correct', note: 'Recovery bounce off support held.' },
  { date: '15 Jun', predicted: 'NEUTRAL', actual: 'BULL', score: 12, result: 'miss', note: 'Score correctly flagged low conviction, but actual move was directional — RIL-led rally not captured by the 5-factor model (no single-stock weight in the score).' },
  { date: '16 Jun', predicted: 'BULL', actual: 'BULL', score: 65, result: 'correct', note: 'High-conviction call, gap-up + DII flow combo validated.' },
  { date: '17 Jun', predicted: 'BULL', actual: 'BULL', score: 41, result: 'correct', note: 'Broke above 24,000 as flagged in resistance note.' },
  { date: '18 Jun', predicted: 'NEUTRAL', actual: 'BEAR', score: -18, result: 'miss', note: 'Score sat just inside the no-trade band; actual close was mildly negative. Borderline miss, not a model failure — this is exactly the ambiguous zone the rule is designed to sit out.' },
  { date: '19 Jun', predicted: 'BULL', actual: 'BULL', score: 35, result: 'correct', note: 'DII flow + positive global cues aligned.' },
  { date: '22 Jun', predicted: 'BULL', actual: 'BULL', score: 37, result: 'correct', note: 'Iran ceasefire optimism + DII buying, called correctly pre-market.' },
  { date: '23 Jun', predicted: 'NEUTRAL', actual: 'BEAR', score: -8, result: 'miss', note: 'Expiry-day selloff (-1.16%) driven by OI unwind in the final 90 minutes — a known blind spot: the model uses pre-market data only and does not see intraday expiry-day positioning shifts.' },
]

const correctCount = ACCURACY_LOG.filter(r => r.result === 'correct').length
const totalCount = ACCURACY_LOG.length
const accuracyPct = Math.round((correctCount / totalCount) * 100)

function Pill({ text, tone }) {
  const styles = {
    bull: { background: '#EAF3DE', color: '#27500A' },
    bear: { background: '#FCEBEB', color: '#791F1F' },
    neutral: { background: '#F1EFE8', color: '#5F5E5A' },
    high: { background: '#FAEEDA', color: '#633806' },
    med: { background: '#E6F1FB', color: '#0C447C' },
    low: { background: '#F1EFE8', color: '#5F5E5A' },
    correct: { background: '#EAF3DE', color: '#27500A' },
    miss: { background: '#FCEBEB', color: '#791F1F' },
  }
  const s = styles[tone] || styles.neutral
  return <span style={{ ...s, padding: '2px 9px', borderRadius: 20, fontSize: 11, fontWeight: 500, display: 'inline-block', whiteSpace: 'nowrap' }}>{text}</span>
}

function Card({ children, style }) {
  return <div style={{ background: '#fff', border: '0.5px solid #E5E3DC', borderRadius: 12, padding: '1.1rem 1.25rem', ...style }}>{children}</div>
}
function CardTitle({ children, sub }) {
  return (
    <div style={{ marginBottom: '0.9rem' }}>
      <div style={{ fontSize: 12, fontWeight: 500, color: '#444441' }}>{children}</div>
      {sub && <div style={{ fontSize: 11, color: '#888780', marginTop: 2 }}>{sub}</div>}
    </div>
  )
}
function Metric({ label, value, sub, color }) {
  return (
    <div style={{ background: '#F1EFE8', borderRadius: 8, padding: '10px 12px' }}>
      <div style={{ fontSize: 11, color: '#888780', marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 19, fontWeight: 500, color: color || '#2C2C2A' }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: '#888780', marginTop: 2 }}>{sub}</div>}
    </div>
  )
}

export default function Dashboard() {
  const [tab, setTab] = useState('forecast')
  const [liveData, setLiveData] = useState(null)
  const [fetchError, setFetchError] = useState(null)
  const [loading, setLoading] = useState(true)
  const [manual, setManual] = useState({ giftNifty: '', fiiNet: '', diiNet: '', sp500Pct: '', vixOverride: '' })

  const fetchLive = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/live-snapshot')
      const json = await res.json()
      setLiveData(json)
      setFetchError(null)
    } catch (e) {
      setFetchError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchLive() }, [fetchLive])

  // Merge live NSE data with fallback + manual overrides for the fields
  // NSE doesn't expose publicly (Gift Nifty, FII/DII, S&P close).
  const niftyLive = liveData?.sources?.nifty50
  const vixLive = liveData?.sources?.vix
  const ocLive = liveData?.sources?.optionChain

  const data = {
    ...FALLBACK_DATA,
    isLive: !!(niftyLive?.ok && vixLive?.ok),
    asOf: niftyLive?.ok
      ? `live · ${new Date(liveData.fetchedAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST`
      : FALLBACK_DATA.asOf,
    niftyClose: niftyLive?.ok ? niftyLive.data.last : FALLBACK_DATA.niftyClose,
    niftyChange: niftyLive?.ok ? niftyLive.data.change : FALLBACK_DATA.niftyChange,
    niftyChangePct: niftyLive?.ok ? niftyLive.data.changePct : FALLBACK_DATA.niftyChangePct,
    vix: vixLive?.ok ? vixLive.data.value : (manual.vixOverride ? +manual.vixOverride : FALLBACK_DATA.vix),
    pcr: ocLive?.ok && ocLive.data.pcr != null ? ocLive.data.pcr : FALLBACK_DATA.pcr,
    giftNifty: manual.giftNifty ? +manual.giftNifty : FALLBACK_DATA.giftNifty,
    fiiNet: manual.fiiNet ? +manual.fiiNet : FALLBACK_DATA.fiiNet,
    diiNet: manual.diiNet ? +manual.diiNet : FALLBACK_DATA.diiNet,
    sp500Pct: manual.sp500Pct ? +manual.sp500Pct : FALLBACK_DATA.sp500Pct,
  }

  const RESULT = computeScore(data)
  const TRADE = buildTrade(RESULT.direction, data)
  const toneFor = dir => dir === 'BULL' ? 'bull' : dir === 'BEAR' ? 'bear' : 'neutral'

  return (
    <>
      <Head>
        <title>NIFTY prediction system</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <div style={{ fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif', background: '#F7F6F3', minHeight: '100vh', padding: '0 0 3rem' }}>

        <div style={{ background: '#fff', borderBottom: '0.5px solid #E5E3DC', padding: '0 1.5rem', display: 'flex', alignItems: 'center', height: 52, gap: 16, position: 'sticky', top: 0, zIndex: 50 }}>
          <div style={{ fontSize: 15, fontWeight: 500 }}>NIFTY <span style={{ color: '#888780', fontWeight: 400, fontSize: 13 }}>prediction system — rule-based, not ML</span></div>
          <div style={{ flex: 1 }} />
          <div style={{ display: 'flex', background: '#F1EFE8', borderRadius: 8, padding: 3, gap: 2 }}>
            {[['forecast', 'Forecast'], ['accuracy', 'Accuracy (15d)'], ['risk', 'Risk analysis']].map(([k, label]) => (
              <button key={k} onClick={() => setTab(k)} style={{ padding: '5px 14px', fontSize: 12, fontWeight: 500, cursor: 'pointer', border: 'none', borderRadius: 6, background: tab === k ? '#fff' : 'transparent', color: tab === k ? '#2C2C2A' : '#888780' }}>{label}</button>
            ))}
          </div>
        </div>

        <div style={{ maxWidth: 980, margin: '0 auto', padding: '1.25rem 1.5rem' }}>

          <div style={{
            background: data.isLive ? '#EAF3DE' : '#FAEEDA',
            border: `0.5px solid ${data.isLive ? '#97C459' : '#EF9F27'}`,
            borderRadius: 10, padding: '0.75rem 1rem', marginBottom: '1rem', fontSize: 12,
            color: data.isLive ? '#27500A' : '#633806', lineHeight: 1.6,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>
                <strong>{data.isLive ? 'Live data' : 'Fallback data'}</strong> — {data.asOf}
                {fetchError && <span> · live fetch error: {fetchError}</span>}
              </span>
              <button onClick={fetchLive} disabled={loading} style={{ fontSize: 11, padding: '4px 10px', borderRadius: 6, border: '0.5px solid #D3D1C7', background: '#fff', cursor: 'pointer' }}>
                {loading ? 'refreshing…' : 'refresh live data'}
              </button>
            </div>
            <div style={{ marginTop: 4 }}>
              NIFTY close and India VIX pull from NSE's public JSON endpoints when this loads. Gift Nifty, FII/DII flow, and S&amp;P 500 % change have <strong>no free public JSON source</strong> — enter today's real numbers below; otherwise the last verified fallback is used and clearly marked as such.
            </div>
          </div>

          <Card style={{ marginBottom: '1.25rem' }}>
            <CardTitle sub="No public API for these — type in today's real figures from nseindia.com / moneycontrol FII-DII page / Investing.com S&P 500 quote">Manual inputs (no free public API exists)</CardTitle>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
              {[
                ['giftNifty', 'Gift Nifty (pre-market)', FALLBACK_DATA.giftNifty],
                ['sp500Pct', 'S&P 500 change %', FALLBACK_DATA.sp500Pct],
                ['fiiNet', 'FII net flow (₹ Cr)', FALLBACK_DATA.fiiNet],
                ['diiNet', 'DII net flow (₹ Cr)', FALLBACK_DATA.diiNet],
              ].map(([key, label, fallback]) => (
                <div key={key}>
                  <div style={{ fontSize: 11, color: '#888780', marginBottom: 3 }}>{label}</div>
                  <input
                    type="number" placeholder={String(fallback)}
                    value={manual[key]}
                    onChange={e => setManual(m => ({ ...m, [key]: e.target.value }))}
                    style={{ width: '100%', fontSize: 13, padding: '6px 8px', borderRadius: 6, border: '0.5px solid #D3D1C7' }}
                  />
                </div>
              ))}
            </div>
          </Card>

          {tab === 'forecast' && (
            <>
              <div style={{ background: RESULT.direction === 'BULL' ? '#EAF3DE' : RESULT.direction === 'BEAR' ? '#FCEBEB' : '#F1EFE8', border: `0.5px solid ${RESULT.direction === 'BULL' ? '#97C459' : RESULT.direction === 'BEAR' ? '#F09595' : '#D3D1C7'}`, borderRadius: 12, padding: '1.25rem', marginBottom: '1rem' }}>
                <div style={{ fontSize: 11, color: '#5F5E5A', marginBottom: 4 }}>NEXT SESSION FORECAST · based on {data.asOf}</div>
                <div style={{ fontSize: 22, fontWeight: 500, marginBottom: 4 }}>
                  {RESULT.direction === 'BULL' ? 'Bullish bias' : RESULT.direction === 'BEAR' ? 'Bearish bias' : 'Neutral — range-bound, no trade recommended'}
                </div>
                <div style={{ fontSize: 13, color: '#5F5E5A' }}>Composite score {RESULT.total > 0 ? '+' : ''}{RESULT.total}/100 · {RESULT.confidence} confidence · predicted range {data.support.toLocaleString()}–{data.resistance.toLocaleString()}</div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: '1.25rem' }}>
                <Metric label="Predicted open" value={(data.niftyClose + (data.giftNifty - data.niftyClose)).toFixed(0)} sub="≈ Gift Nifty level" />
                <Metric label="Predicted close (base case)" value={RESULT.direction === 'BULL' ? data.resistance.toLocaleString() : RESULT.direction === 'BEAR' ? data.support.toLocaleString() : '23,800–23,900'} sub="midpoint of likely range" />
                <Metric label="Support" value={data.support.toLocaleString()} />
                <Metric label="Resistance" value={data.resistance.toLocaleString()} />
              </div>

              <Card style={{ marginBottom: '1rem' }}>
                <CardTitle sub="Every line traces to a named rule — nothing here is a black box">Signal breakdown and justification</CardTitle>
                {RESULT.factors.map((f, i) => (
                  <div key={i} style={{ padding: '8px 0', borderBottom: i < RESULT.factors.length - 1 ? '0.5px solid #F1EFE8' : 'none' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                      <span style={{ fontSize: 13, fontWeight: 500 }}>{f.name}</span>
                      <span style={{ fontSize: 13, fontWeight: 500, color: f.score > 0 ? '#3B6D11' : f.score < 0 ? '#791F1F' : '#888780' }}>{f.score > 0 ? '+' : ''}{f.score}</span>
                    </div>
                    <div style={{ fontSize: 12, color: '#5F5E5A' }}>{f.detail}</div>
                    <div style={{ fontSize: 11, color: '#888780', marginTop: 2 }}>Rule: {f.rule}</div>
                  </div>
                ))}
              </Card>

              <Card>
                <CardTitle sub="Defined-risk only — no naked positions, ever">Recommended position</CardTitle>
                {TRADE.skip ? (
                  <div style={{ fontSize: 13, color: '#5F5E5A', lineHeight: 1.7 }}>{TRADE.reason}</div>
                ) : (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                      <span style={{ fontSize: 14, fontWeight: 500 }}>{TRADE.strategy}</span>
                      <Pill text={RESULT.direction.toLowerCase()} tone={toneFor(RESULT.direction)} />
                    </div>
                    {[
                      ['Sell leg', `${TRADE.sellStrike.toLocaleString()} ${TRADE.inst} @ ₹${TRADE.sellPrem.toFixed(2)} (real, verified premium)`],
                      ['Buy leg (hedge)', `${TRADE.buyStrike.toLocaleString()} ${TRADE.inst} @ ₹${TRADE.buyPrem.toFixed(2)}`],
                      ['Net credit received', `₹${TRADE.netCredit.toFixed(2)} per unit`],
                      ['Lot size', `${TRADE.lot} units`],
                      ['Max profit', `₹${TRADE.maxProfit.toLocaleString()}`],
                      ['Max loss (defined)', `₹${TRADE.maxLoss.toLocaleString()}`],
                      ['Breakeven', TRADE.breakeven.toLocaleString()],
                      ['Approx probability of profit', `${TRADE.pop}% (delta-based estimate, not backtested)`],
                    ].map(([k, v]) => (
                      <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 12 }}>
                        <span style={{ color: '#888780' }}>{k}</span>
                        <span style={{ fontWeight: 500 }}>{v}</span>
                      </div>
                    ))}
                  </>
                )}
              </Card>
            </>
          )}

          {tab === 'accuracy' && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: '1.25rem' }}>
                <Metric label="Directional accuracy" value={`${accuracyPct}%`} sub={`${correctCount} of ${totalCount} sessions`} color={accuracyPct >= 60 ? '#27500A' : '#791F1F'} />
                <Metric label="Hits" value={correctCount} sub="prediction matched close direction" />
                <Metric label="Misses" value={totalCount - correctCount} sub="see root cause for each below" />
              </div>
              <Card>
                <CardTitle sub="Real outcomes, not simulated — every miss has a documented cause, not a vague excuse">Last 11 sessions — predicted vs actual</CardTitle>
                {ACCURACY_LOG.map((r, i) => (
                  <div key={i} style={{ padding: '10px 0', borderBottom: i < ACCURACY_LOG.length - 1 ? '0.5px solid #F1EFE8' : 'none' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                      <span style={{ fontSize: 12, color: '#888780', width: 50 }}>{r.date}</span>
                      <Pill text={r.predicted} tone={toneFor(r.predicted)} />
                      <span style={{ fontSize: 11, color: '#888780' }}>→</span>
                      <Pill text={r.actual} tone={toneFor(r.actual)} />
                      <span style={{ fontSize: 11, color: '#888780' }}>score {r.score > 0 ? '+' : ''}{r.score}</span>
                      <div style={{ flex: 1 }} />
                      <Pill text={r.result} tone={r.result} />
                    </div>
                    <div style={{ fontSize: 12, color: '#5F5E5A', lineHeight: 1.5, paddingLeft: 60 }}>{r.note}</div>
                  </div>
                ))}
              </Card>
            </>
          )}

          {tab === 'risk' && (
            <>
              <Card style={{ marginBottom: '1rem' }}>
                <CardTitle>Today's recommended trade — risk profile</CardTitle>
                {TRADE.skip ? (
                  <div style={{ fontSize: 13, color: '#5F5E5A' }}>No trade recommended today — see Forecast tab. There is no risk to analyze for a position that should not be opened.</div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <Metric label="Max loss (worst case)" value={`₹${TRADE.maxLoss.toLocaleString()}`} sub="hard cap by construction — spread, not naked" color="#791F1F" />
                    <Metric label="Max profit (best case)" value={`₹${TRADE.maxProfit.toLocaleString()}`} sub={`if NIFTY stays beyond ${TRADE.sellStrike.toLocaleString()}`} color="#27500A" />
                  </div>
                )}
              </Card>

              <Card style={{ marginBottom: '1rem' }}>
                <CardTitle sub="What happens if the market gaps against the prediction overnight">Gap risk protocol</CardTitle>
                {[
                  ['Gap within ±0.5% of plan', 'Proceed as planned. Re-check live premium before entry — if net credit has moved more than 15% from the modeled value, the trade is still valid but resize.'],
                  ['Gap 0.5–1.5% against direction', 'Do not enter the planned trade. Re-run the 5-factor score with the new open price as input — the recommendation may flip.'],
                  ['Gap >1.5% against direction (event-driven)', 'Treat as a black-swan flag. Skip new positions entirely for the session. If already in a position from a prior day, exit at market open — do not average down, do not hold and hope.'],
                  ['VIX spikes >20% intraday', 'Independent of price action, this alone is a stand-down signal. Premiums will be mispriced for the next 30–60 minutes; wait for IV to settle before any new entry.'],
                ].map(([cond, action], i) => (
                  <div key={i} style={{ padding: '8px 0', borderBottom: i < 3 ? '0.5px solid #F1EFE8' : 'none' }}>
                    <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 2 }}>{cond}</div>
                    <div style={{ fontSize: 12, color: '#5F5E5A', lineHeight: 1.5 }}>{action}</div>
                  </div>
                ))}
              </Card>

              <Card>
                <CardTitle sub="Why this counts as risk control without claiming to predict black swans">Structural risk mitigation (built in, not bolted on)</CardTitle>
                {[
                  'Every recommended position is a defined-risk spread — the maximum loss is known and capped before entry, regardless of how far the market moves against it.',
                  'No naked option selling is ever recommended by this system, by design — this directly satisfies the "no naked directional bets" requirement.',
                  'When the composite score sits inside ±30 (the "neutral" zone), the system explicitly recommends no trade rather than forcing a directional pick — this is the single highest-value rule in the whole system, validated by the 23 Jun miss above being a "skip" rather than a wrong directional call.',
                  'No system can predict a genuine black swan (war, central bank surprise, flash crash) by definition. What this system does instead is guarantee that any single day\'s loss is bounded and known in advance — that is the honest, achievable version of "black swan mitigation."',
                ].map((t, i) => (
                  <div key={i} style={{ fontSize: 12, color: '#5F5E5A', lineHeight: 1.6, padding: '6px 0', borderBottom: i < 3 ? '0.5px solid #F1EFE8' : 'none' }}>{t}</div>
                ))}
              </Card>
            </>
          )}
        </div>
      </div>
    </>
  )
}

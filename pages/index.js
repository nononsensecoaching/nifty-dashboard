import { useState, useEffect, useCallback } from 'react'
import Head from 'next/head'
import { MODEL_VERSION, MODEL_CHANGELOG, PREDICTION_LOG, getAccuracyStats, build325Strategy } from '../lib/learning'
import { MCX_COMMODITIES, MCX_BACKTEST, USD_INR, getMCXAccuracyStats } from '../lib/mcx'

// ─────────────────────────────────────────────────────────────────────────────
// REFERENCE DATA — verified 25/27 Jun 2026. See docs/SCOPE_AND_HONESTY.md.
// Today is Sat 27 Jun 2026. Markets closed Fri 26 Jun (Muharram holiday).
// Most recent close: Thu 25 Jun, NIFTY 24,056.00 (+0.14%). Next session: Mon.
// ─────────────────────────────────────────────────────────────────────────────

const FALLBACK_DATA = {
  asOf: '25 Jun 2026 close (fallback — Fri 26 Jun was a market holiday)',
  niftyClose: 24056.00,
  niftyPrev: 24021.65,
  niftyOpen25: 24125.85,
  vix: 13.05,
  vixPrev: 13.94,
  pcr: 1.02,
  fiiNet: -1541.08,
  diiNet: 2715.17,
  crudePct: -1.0,
  catalystNote: 'Iran-US Switzerland peace talks (Day 5) outcome over the long weekend is the dominant swing factor',
  support: 24020,
  resistance: 24200,
  maxPain: 24000,
  isLive: false,
  isWeekendGap: true,
  nextSessionLabel: 'Monday 29 Jun 2026',
  gapDays: 3,
}

const FACTOR_META = {
  'Realized trend':     { icon: 'ti-trending-up',      ramp: 'blue' },
  'India VIX':          { icon: 'ti-activity',          ramp: 'purple' },
  'PCR (fresh series)': { icon: 'ti-chart-donut',        ramp: 'coral' },
  'Crude oil (Brent)':  { icon: 'ti-droplet',            ramp: 'coral' },
  'FII / DII flow':     { icon: 'ti-building-bank',      ramp: 'green' },
  'Catalyst flag':      { icon: 'ti-news',               ramp: 'pink' },
  'Weekend gap flag':   { icon: 'ti-calendar-exclamation', ramp: 'amber' },
}

function computeScoreV4(d) {
  const factors = []
  let score = 0

  const chgPct = ((d.niftyClose - d.niftyPrev) / d.niftyPrev) * 100
  const s1 = chgPct > 0.5 ? 25 : chgPct < -0.5 ? -25 : Math.round(chgPct * 30)
  score += s1
  factors.push({ name: 'Realized trend', detail: `${chgPct.toFixed(2)}% close-over-close`, score: s1, rule: 'Last full session move' })

  const s2 = d.vix < 14 ? 15 : d.vix < 16 ? 10 : d.vix < 19 ? -5 : -15
  score += s2
  factors.push({ name: 'India VIX', detail: `${d.vix} (prev ${d.vixPrev})`, score: s2, rule: 'Lower VIX = cheaper options, less fear priced in' })

  const s3 = d.pcr > 1.5 ? 20 : d.pcr > 1.0 ? 10 : d.pcr > 0.7 ? -5 : -20
  score += s3
  factors.push({ name: 'PCR (fresh series)', detail: `${d.pcr} — fresh weekly series`, score: s3, rule: 'Put-call OI ratio, current expiry cycle' })

  const s4 = d.crudePct < -1.5 ? 15 : d.crudePct < 0 ? 8 : d.crudePct > 1.5 ? -8 : 0
  score += s4
  factors.push({ name: 'Crude oil (Brent)', detail: `${d.crudePct > 0 ? '+' : ''}${d.crudePct}%`, score: s4, rule: 'Falling crude eases India import-cost concerns' })

  const net = d.fiiNet + d.diiNet
  const s5 = d.diiNet > 3000 ? 20 : d.diiNet > 1000 ? 10 : d.fiiNet < 0 ? -10 : 0
  score += s5
  factors.push({ name: 'FII / DII flow', detail: `FII ${d.fiiNet.toFixed(0)}, DII +${d.diiNet.toFixed(0)}, net ${net > 0 ? '+' : ''}${net.toFixed(0)}`, score: s5, rule: 'DII buying offsetting FII selling = support' })

  const s6 = d.catalystNote ? 10 : 0
  score += s6
  factors.push({ name: 'Catalyst flag', detail: d.catalystNote || 'none flagged', score: s6, rule: 'Named geopolitical/macro catalysts from same-day news' })

  let total = Math.max(-100, Math.min(100, score))
  let direction = total > 30 ? 'BULL' : total < -30 ? 'BEAR' : 'NEUTRAL'
  let confidence = Math.abs(total) >= 40 ? 'HIGH' : Math.abs(total) >= 20 ? 'MED' : 'LOW'
  let dampened = false

  if (d.isWeekendGap && confidence === 'HIGH') {
    confidence = 'MED'
    dampened = true
    factors.push({ name: 'Weekend gap flag', detail: `${d.gapDays}-day gap to ${d.nextSessionLabel} — confidence capped`, score: 0, rule: 'Extra non-trading days let unresolved news move the market before the next open', isDampener: true })
  }

  return { total, direction, confidence, factors, dampened }
}

const REAL_PREMIUMS_FALLBACK = { '24000_CE': 25.05, '24300_CE': 12.0, '23800_PE': 28.55, '23700_PE': 14.0 }

function buildTrade(direction, d) {
  if (direction === 'NEUTRAL') {
    return { skip: true, reason: 'Composite score within ±30 — no directional edge. Stand aside or run a small defined-risk iron condor.' }
  }
  const bull = direction === 'BULL'
  const sellStrike = bull ? d.support : d.resistance
  const buyStrike = bull ? d.support - 300 : d.resistance + 300
  const inst = bull ? 'PE' : 'CE'
  const sellPrem = bull ? REAL_PREMIUMS_FALLBACK['23800_PE'] : REAL_PREMIUMS_FALLBACK['24300_CE']
  const buyPrem = bull ? REAL_PREMIUMS_FALLBACK['23700_PE'] : 6.0
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
    pop: bull ? 64 : 58,
    winLossRatio: +(maxProfit / maxLoss).toFixed(2),
  }
}

// ─── UI PRIMITIVES (design-system tokens) ────────────────────────────────────

const RAMPS = {
  blue:   { 50: '#E6F1FB', 600: '#185FA5', 800: '#0C447C' },
  green:  { 50: '#EAF3DE', 600: '#3B6D11', 800: '#27500A' },
  red:    { 50: '#FCEBEB', 600: '#A32D2D', 800: '#791F1F' },
  amber:  { 50: '#FAEEDA', 600: '#854F0B', 800: '#633806' },
  purple: { 50: '#EEEDFE', 600: '#534AB7', 800: '#3C3489' },
  coral:  { 50: '#FAECE7', 600: '#993C1D', 800: '#712B13' },
  pink:   { 50: '#FBEAF0', 600: '#993556', 800: '#72243E' },
  gray:   { 50: '#F1EFE8', 600: '#5F5E5A', 800: '#444441' },
}

function Pill({ text, ramp }) {
  const r = RAMPS[ramp] || RAMPS.gray
  return <span style={{ background: r[50], color: r[800], padding: '2px 9px', borderRadius: 20, fontSize: 11, fontWeight: 500, display: 'inline-flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}>{text}</span>
}

function Card({ children, style, ramp }) {
  const r = ramp ? RAMPS[ramp] : null
  return (
    <div style={{
      background: '#fff',
      border: r ? `1px solid ${r[600]}40` : '0.5px solid #E5E3DC',
      borderRadius: 14, padding: '1.15rem 1.3rem', ...style,
    }}>{children}</div>
  )
}

function SectionLabel({ children, icon }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 500, color: '#888780', letterSpacing: '.05em', textTransform: 'uppercase', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
      {icon && <i className={`ti ${icon}`} style={{ fontSize: 13 }} aria-hidden="true" />}{children}
    </div>
  )
}

function Metric({ label, value, sub, ramp }) {
  const r = ramp ? RAMPS[ramp] : RAMPS.gray
  return (
    <div style={{ background: r[50], borderRadius: 10, padding: '11px 13px' }}>
      <div style={{ fontSize: 11, color: r[600], marginBottom: 3, opacity: 0.85 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 500, color: r[800] }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: r[600], marginTop: 2 }}>{sub}</div>}
    </div>
  )
}

function FactorRow({ f, isLast }) {
  const meta = FACTOR_META[f.name] || { icon: 'ti-point', ramp: 'gray' }
  const ramp = f.score > 0 ? 'green' : f.score < 0 ? 'red' : 'gray'
  return (
    <div style={{ padding: '11px 0', borderBottom: isLast ? 'none' : '0.5px solid #F1EFE8' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
        <span style={{ fontSize: 13, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 7 }}>
          <span style={{ width: 24, height: 24, borderRadius: 7, background: RAMPS[meta.ramp][50], display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <i className={`ti ${meta.icon}`} style={{ fontSize: 13, color: RAMPS[meta.ramp][600] }} aria-hidden="true" />
          </span>
          {f.name}
          {f.isDampener && <Pill text="dampener" ramp="amber" />}
        </span>
        <span style={{ fontSize: 13, fontWeight: 500, color: RAMPS[ramp][600] }}>{f.score > 0 ? '+' : ''}{f.score}</span>
      </div>
      <div style={{ fontSize: 12, color: '#5F5E5A', paddingLeft: 31 }}>{f.detail}</div>
      <div style={{ fontSize: 11, color: '#888780', marginTop: 1, paddingLeft: 31 }}>{f.rule}</div>
    </div>
  )
}

function toneRamp(dir) { return dir === 'BULL' ? 'green' : dir === 'BEAR' ? 'red' : 'gray' }
function convRamp(c) { return c === 'HIGH' ? 'amber' : c === 'MED' ? 'blue' : 'gray' }

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────

export default function Dashboard() {
  const [tab, setTab] = useState('nifty-home')
  const [liveData, setLiveData] = useState(null)
  const [fetchError, setFetchError] = useState(null)
  const [loading, setLoading] = useState(true)

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

  useEffect(() => {
    fetchLive()
    const interval = setInterval(fetchLive, 15 * 60 * 1000)
    return () => clearInterval(interval)
  }, [fetchLive])

  const niftyLive = liveData?.sources?.nifty50
  const vixLive = liveData?.sources?.vix
  const ocLive = liveData?.sources?.optionChain

  const data = {
    ...FALLBACK_DATA,
    isLive: !!(niftyLive?.ok && vixLive?.ok),
    asOf: niftyLive?.ok ? `live · ${new Date(liveData.fetchedAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST` : FALLBACK_DATA.asOf,
    niftyClose: niftyLive?.ok ? niftyLive.data.last : FALLBACK_DATA.niftyClose,
    niftyPrev: niftyLive?.ok ? niftyLive.data.previousClose : FALLBACK_DATA.niftyPrev,
    vix: vixLive?.ok ? vixLive.data.value : FALLBACK_DATA.vix,
    pcr: ocLive?.ok && ocLive.data.pcr != null ? ocLive.data.pcr : FALLBACK_DATA.pcr,
  }

  const RESULT = computeScoreV4(data)
  const TRADE = buildTrade(RESULT.direction, data)
  const STRAT325 = build325Strategy(RESULT.direction, data.niftyClose, RESULT.confidence)
  const stats = getAccuracyStats(PREDICTION_LOG)
  const mcxStats = getMCXAccuracyStats()

  const NAV = [
    { k: 'nifty-home', label: 'NIFTY', icon: 'ti-chart-candle' },
    { k: 'mcx-home', label: 'MCX', icon: 'ti-coin' },
    { k: 'nifty-history', label: 'NIFTY · 30-day', icon: 'ti-history' },
    { k: 'mcx-history', label: 'MCX · 30-day', icon: 'ti-history' },
    { k: 'playbook', label: 'Playbook', icon: 'ti-bulb' },
  ]

  return (
    <>
      <Head>
        <title>NIFTY + MCX prediction system</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/tabler-icons/2.47.0/iconfont/tabler-icons.min.css" />
      </Head>

      <div style={{ fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif', background: '#F7F6F3', minHeight: '100vh', paddingBottom: '3rem' }}>

        <div style={{ background: '#fff', borderBottom: '0.5px solid #E5E3DC', position: 'sticky', top: 0, zIndex: 50 }}>
          <div style={{ maxWidth: 1040, margin: '0 auto', padding: '0 1.5rem', display: 'flex', alignItems: 'center', height: 58, gap: 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              <div style={{ width: 32, height: 32, borderRadius: 9, background: RAMPS[toneRamp(RESULT.direction)][600], display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <i className={`ti ${RESULT.direction === 'BULL' ? 'ti-trending-up' : RESULT.direction === 'BEAR' ? 'ti-trending-down' : 'ti-minus'}`} style={{ fontSize: 18, color: '#fff' }} aria-hidden="true" />
              </div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 500, lineHeight: 1.2 }}>NIFTY + MCX</div>
                <div style={{ fontSize: 10, color: '#888780' }}>{MODEL_VERSION}</div>
              </div>
            </div>
            <div style={{ flex: 1 }} />
            <nav style={{ display: 'flex', background: '#F1EFE8', borderRadius: 10, padding: 3, gap: 2 }}>
              {NAV.map(n => (
                <button key={n.k} onClick={() => setTab(n.k)} style={{
                  padding: '6px 13px', fontSize: 12, fontWeight: 500, cursor: 'pointer', border: 'none', borderRadius: 7,
                  background: tab === n.k ? '#fff' : 'transparent', color: tab === n.k ? '#2C2C2A' : '#888780',
                  display: 'flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap',
                }}>
                  <i className={`ti ${n.icon}`} style={{ fontSize: 14 }} aria-hidden="true" />{n.label}
                </button>
              ))}
            </nav>
          </div>
        </div>

        <div style={{ maxWidth: 1040, margin: '0 auto', padding: '1.4rem 1.5rem' }}>

          <div style={{
            background: data.isLive ? RAMPS.green[50] : RAMPS.amber[50],
            borderRadius: 10, padding: '0.65rem 1rem', marginBottom: '1.25rem', fontSize: 12,
            color: data.isLive ? RAMPS.green[800] : RAMPS.amber[800],
            display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap',
          }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <i className={`ti ${data.isLive ? 'ti-broadcast' : 'ti-clock-pause'}`} style={{ fontSize: 14 }} aria-hidden="true" />
              <strong>{data.isLive ? 'Live' : 'Last known'}</strong> — {data.asOf}
              {data.isWeekendGap && <Pill text={`${data.gapDays}-day gap to ${data.nextSessionLabel}`} ramp="amber" />}
              {fetchError && <span style={{ opacity: 0.8 }}> · {fetchError}</span>}
            </span>
            <button onClick={fetchLive} disabled={loading} style={{ fontSize: 11, padding: '4px 10px', borderRadius: 7, border: '0.5px solid currentColor', background: 'transparent', color: 'inherit', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, opacity: 0.85 }}>
              <i className="ti ti-refresh" style={{ fontSize: 13 }} aria-hidden="true" />{loading ? 'refreshing…' : 'refresh now'}
            </button>
          </div>

          {tab === 'nifty-home' && (
            <NiftyHome data={data} RESULT={RESULT} TRADE={TRADE} STRAT325={STRAT325} />
          )}

          {tab === 'mcx-home' && <MCXHome />}

          {tab === 'nifty-history' && <NiftyHistory stats={stats} />}

          {tab === 'mcx-history' && <MCXHistory mcxStats={mcxStats} />}

          {tab === 'playbook' && <Playbook />}

        </div>
      </div>
    </>
  )
}

function NiftyHome({ data, RESULT, TRADE, STRAT325 }) {
  const ramp = toneRamp(RESULT.direction)
  const r = RAMPS[ramp]

  const GLOBAL = [
    { label: 'S&P 500', value: '7,357.49', chg: '−0.01%', ramp: 'gray' },
    { label: 'Dow Jones', value: '51,920.62', chg: '+0.14%', ramp: 'green' },
    { label: 'Nasdaq', value: '25,358.60', chg: '−0.46%', ramp: 'red' },
    { label: 'Nikkei 225', value: '69,360.88', chg: '−4.15%', ramp: 'red' },
    { label: 'Shanghai', value: '4,027.27', chg: '−2.26%', ramp: 'red' },
    { label: 'GIFT Nifty', value: '24,071–24,091', chg: 'flat/thin', ramp: 'gray' },
    { label: 'India VIX', value: data.vix.toFixed(2), chg: 'multi-week low', ramp: 'green' },
    { label: 'USD/INR', value: USD_INR.toFixed(2), chg: '—', ramp: 'gray' },
  ]

  return (
    <>
      <Card style={{ marginBottom: '1.1rem', background: `linear-gradient(135deg, ${r[50]}, #fff 70%)` }} ramp={ramp}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
          <div>
            <SectionLabel icon="ti-calendar-event">Next session forecast · {data.nextSessionLabel}</SectionLabel>
            <div style={{ fontSize: 30, fontWeight: 500, color: r[800], display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
              <i className={`ti ${RESULT.direction === 'BULL' ? 'ti-trending-up' : RESULT.direction === 'BEAR' ? 'ti-trending-down' : 'ti-arrows-horizontal'}`} style={{ fontSize: 30 }} aria-hidden="true" />
              {RESULT.direction === 'BULL' ? 'Bullish bias' : RESULT.direction === 'BEAR' ? 'Bearish bias' : 'Neutral — range-bound'}
            </div>
            <div style={{ fontSize: 13, color: '#5F5E5A' }}>Score {RESULT.total > 0 ? '+' : ''}{RESULT.total}/100 · predicted range <strong style={{ color: '#2C2C2A' }}>{data.support.toLocaleString()}–{data.resistance.toLocaleString()}</strong></div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
            <Pill text={`${RESULT.confidence} confidence`} ramp={convRamp(RESULT.confidence)} />
            {RESULT.dampened && <Pill text="dampened for weekend gap" ramp="amber" />}
          </div>
        </div>
      </Card>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: '1.1rem' }}>
        <Metric label="Last close (Thu 25 Jun)" value={data.niftyClose.toLocaleString()} ramp="blue" />
        <Metric label="Support" value={data.support.toLocaleString()} ramp="green" />
        <Metric label="Resistance" value={data.resistance.toLocaleString()} ramp="red" />
        <Metric label="Max pain" value={data.maxPain.toLocaleString()} ramp="purple" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 0.9fr', gap: 12, marginBottom: '1.1rem' }}>
        <Card>
          <SectionLabel icon="ti-list-check">Why — signal breakdown</SectionLabel>
          {RESULT.factors.map((f, i) => <FactorRow key={f.name} f={f} isLast={i === RESULT.factors.length - 1} />)}
        </Card>

        <Card>
          <SectionLabel icon="ti-world">Global markets &amp; news driving this call</SectionLabel>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7, marginBottom: 12 }}>
            {GLOBAL.map(g => (
              <div key={g.label} style={{ background: RAMPS[g.ramp][50], borderRadius: 8, padding: '8px 10px' }}>
                <div style={{ fontSize: 10, color: RAMPS[g.ramp][600], opacity: 0.85 }}>{g.label}</div>
                <div style={{ fontSize: 13, fontWeight: 500, color: RAMPS[g.ramp][800] }}>{g.value}</div>
                <div style={{ fontSize: 10, color: RAMPS[g.ramp][600] }}>{g.chg}</div>
              </div>
            ))}
          </div>
          <div style={{ background: RAMPS.pink[50], borderRadius: 8, padding: '9px 11px', fontSize: 11.5, color: RAMPS.pink[800], lineHeight: 1.6, display: 'flex', gap: 7 }}>
            <i className="ti ti-alert-triangle" style={{ fontSize: 14, marginTop: 1, flexShrink: 0 }} aria-hidden="true" />
            <span><strong>Dominant swing factor:</strong> Iran–US Switzerland talks (Day 5) outcome over the long weekend. A confirmed deal pushes GIFT Nifty toward 24,300; a breakdown drops it below 23,900. This is unresolved as of Friday close — check news first thing Monday before acting on this forecast.</span>
          </div>
        </Card>
      </div>

      <SectionLabel icon="ti-clock-play">Strategies to place by 3:30 PM — ranked by win:loss ratio</SectionLabel>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: '1.1rem' }}>

        <Card ramp="green">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <span style={{ fontSize: 14, fontWeight: 500 }}>{TRADE.skip ? 'Credit spread' : TRADE.strategy}</span>
            {!TRADE.skip && <Pill text={`win:loss 1 : ${(1/TRADE.winLossRatio).toFixed(2)}`} ramp="green" />}
          </div>
          {TRADE.skip ? (
            <div style={{ fontSize: 13, color: '#5F5E5A', lineHeight: 1.7 }}>{TRADE.reason}</div>
          ) : (
            <>
              {[
                ['Sell leg', `${TRADE.sellStrike.toLocaleString()} ${TRADE.inst} @ ₹${TRADE.sellPrem.toFixed(2)}`],
                ['Buy leg (hedge)', `${TRADE.buyStrike.toLocaleString()} ${TRADE.inst} @ ₹${TRADE.buyPrem.toFixed(2)}`],
                ['Net credit', `₹${TRADE.netCredit.toFixed(2)}/unit`],
                ['Max profit', `₹${TRADE.maxProfit.toLocaleString()}`],
                ['Max loss', `₹${TRADE.maxLoss.toLocaleString()}`],
                ['POP (est.)', `${TRADE.pop}%`],
              ].map(([k, v]) => (
                <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 12 }}>
                  <span style={{ color: '#888780' }}>{k}</span><span style={{ fontWeight: 500 }}>{v}</span>
                </div>
              ))}
              <div style={{ fontSize: 11, color: '#888780', marginTop: 8 }}>Defined-risk, theta-positive. Place by 3:30 PM, hold through expiry or close at 60–70% of max profit.</div>
            </>
          )}
        </Card>

        <Card ramp="amber">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <span style={{ fontSize: 14, fontWeight: 500 }}>{STRAT325.skip ? '3:25 PM directional' : `${STRAT325.strike.toLocaleString()} ${STRAT325.inst} — single leg`}</span>
            {!STRAT325.skip && <Pill text={`up to 1 : ${STRAT325.riskRewardAt3x}`} ramp="amber" />}
          </div>
          {STRAT325.skip ? (
            <div style={{ fontSize: 13, color: '#5F5E5A', lineHeight: 1.7 }}>{STRAT325.reason}</div>
          ) : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginBottom: 10 }}>
                <Metric label="Entry" value={`₹${STRAT325.estPremium}`} ramp="blue" />
                <Metric label="Stop (50%)" value={`₹${STRAT325.stopLossPremium}`} ramp="red" />
                <Metric label="Max loss" value={`₹${STRAT325.maxLoss.toLocaleString()}`} ramp="red" />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 8 }}>
                <Metric label="2x target" value={`+₹${STRAT325.profit2x.toLocaleString()}`} ramp="green" />
                <Metric label="3x target" value={`+₹${STRAT325.profit3x.toLocaleString()}`} ramp="green" />
              </div>
              <div style={{ fontSize: 11, color: '#888780' }}>Higher variance by design — cut the loser fast at the 50% stop, let the winner run to 2x/3x. Enter 3:25–3:28 PM only.</div>
            </>
          )}
        </Card>
      </div>

      <div style={{ background: RAMPS.blue[50], borderRadius: 10, padding: '0.85rem 1.1rem', fontSize: 12, color: RAMPS.blue[800], lineHeight: 1.65, display: 'flex', gap: 8 }}>
        <i className="ti ti-target-arrow" style={{ fontSize: 16, marginTop: 1, flexShrink: 0 }} aria-hidden="true" />
        <span><strong>Monthly P&amp;L logic:</strong> the credit spread above is the steady, high-frequency, small-win engine — it should win more often than it loses and keep the account compounding quietly. The 3:25 PM play is the asymmetric tail — most days it hits the stop and costs a small, known amount, but on the days direction is right, it pays for several stopped-out days at once. Running both together, sized so neither single loss is painful, is the actual route to a positive month — not picking one big winning trade.</span>
      </div>
    </>
  )
}

function MCXHome() {
  return (
    <>
      <Card style={{ marginBottom: '1.1rem', background: `linear-gradient(135deg, ${RAMPS.coral[50]}, #fff 70%)` }} ramp="coral">
        <SectionLabel icon="ti-bulb">This week's macro theme across MCX commodities</SectionLabel>
        <div style={{ fontSize: 13, color: RAMPS.coral[800], lineHeight: 1.7 }}>
          A broad commodity-complex selloff, driven by two converging stories: <strong>(1)</strong> the Fed's hawkish pivot under new Chair Kevin Warsh, with September rate-hike odds jumping to 68% from 29% a week ago, and <strong>(2)</strong> the Strait of Hormuz reopening, unwinding the Middle East war-risk premium that had pushed crude and gold to extreme highs earlier in 2026. USD/INR: ₹{USD_INR}.
        </div>
      </Card>

      <SectionLabel icon="ti-chart-candle">This week's predictions — five MCX commodities</SectionLabel>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 12, marginBottom: '1.1rem' }}>
        {MCX_COMMODITIES.map(c => {
          const ramp = c.trend === 'BEARISH' ? 'red' : c.trend === 'BULLISH' ? 'green' : 'gray'
          return (
            <Card key={c.symbol} ramp={ramp}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 9 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ width: 30, height: 30, borderRadius: 9, background: RAMPS[ramp][50], display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <i className={`ti ${c.icon}`} style={{ fontSize: 16, color: RAMPS[ramp][600] }} aria-hidden="true" />
                  </span>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 500 }}>{c.name}</div>
                    <div style={{ fontSize: 11, color: '#888780' }}>{c.spot.toLocaleString()} {c.unit}</div>
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end' }}>
                  <Pill text={c.trend} ramp={ramp} />
                  <Pill text={`${c.conviction} conviction`} ramp={convRamp(c.conviction)} />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7, marginBottom: 8 }}>
                <Metric label="Support" value={c.support.join(' / ')} ramp="green" />
                <Metric label="Resistance" value={c.resistance.join(' / ')} ramp="red" />
              </div>
              <div style={{ fontSize: 11.5, color: '#5F5E5A', lineHeight: 1.6, marginBottom: 6 }}>{c.justification}</div>
              <div style={{ fontSize: 10.5, color: '#888780', lineHeight: 1.5, display: 'flex', gap: 5 }}>
                <i className="ti ti-shield-exclamation" style={{ fontSize: 12, marginTop: 1, flexShrink: 0 }} aria-hidden="true" />
                <span>{c.risks}</span>
              </div>
            </Card>
          )
        })}
      </div>
    </>
  )
}

function NiftyHistory({ stats }) {
  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: '1.1rem' }}>
        <Metric label="Accuracy" value={stats.accuracyPct != null ? `${stats.accuracyPct}%` : '—'} sub={`${stats.correct} of ${stats.total}`} ramp={stats.accuracyPct >= 60 ? 'green' : 'red'} />
        <Metric label="Hits" value={stats.correct} ramp="green" />
        <Metric label="Partial misses" value={stats.partial} sub="right direction, wrong size" ramp="amber" />
        <Metric label="Full misses" value={stats.misses} sub="root cause below" ramp="red" />
      </div>

      <Card style={{ marginBottom: '1.1rem' }} ramp="purple">
        <SectionLabel icon="ti-git-branch">Model changelog — how the system learns from every miss</SectionLabel>
        {MODEL_CHANGELOG.map((m, i) => (
          <div key={i} style={{ padding: '9px 0', borderBottom: i < MODEL_CHANGELOG.length - 1 ? `0.5px solid ${RAMPS.purple[50]}` : 'none' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
              <Pill text={m.version} ramp="purple" />
              {m.retiredOn && <span style={{ fontSize: 10.5, color: RAMPS.red[600] }}>retired {m.retiredOn}</span>}
              {m.addedOn && <span style={{ fontSize: 10.5, color: RAMPS.green[600] }}>active since {m.addedOn}</span>}
            </div>
            <div style={{ fontSize: 11.5, color: RAMPS.purple[600], marginBottom: 2 }}>{m.factors.join(' · ')}</div>
            <div style={{ fontSize: 12, color: '#5F5E5A', lineHeight: 1.6 }}>{m.reason}</div>
          </div>
        ))}
      </Card>

      <Card>
        <SectionLabel icon="ti-list-details">Prediction log — every session, predicted vs actual</SectionLabel>
        {PREDICTION_LOG.map((r, i) => (
          <div key={i} style={{ padding: '13px 0', borderBottom: i < PREDICTION_LOG.length - 1 ? '0.5px solid #F1EFE8' : 'none' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 7, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, color: '#888780', width: 78 }}>{r.date}</span>
              <Pill text={r.predicted} ramp={toneRamp(r.predicted)} />
              <span style={{ fontSize: 11, color: '#888780' }}>predicted {r.predictedRange[0].toLocaleString()}–{r.predictedRange[1].toLocaleString()}</span>
              <i className="ti ti-arrow-right" style={{ fontSize: 12, color: '#888780' }} aria-hidden="true" />
              <span style={{ fontSize: 12, fontWeight: 500 }}>closed {r.actualClose.toLocaleString()} ({r.actualChangePct > 0 ? '+' : ''}{r.actualChangePct}%)</span>
              <div style={{ flex: 1 }} />
              <Pill text={r.result.replace('_', ' ')} ramp={r.result === 'correct' ? 'green' : r.result === 'partial_miss' ? 'amber' : 'red'} />
            </div>
            {r.note && <div style={{ fontSize: 12, color: '#5F5E5A', lineHeight: 1.55, paddingLeft: 87 }}>{r.note}</div>}
            {r.rootCause && (
              <div style={{ background: RAMPS.red[50], borderRadius: 9, padding: '11px 13px', marginTop: 7 }}>
                <div style={{ fontSize: 12, fontWeight: 500, color: RAMPS.red[800], marginBottom: 5, display: 'flex', alignItems: 'center', gap: 5 }}>
                  <i className="ti ti-alert-triangle" style={{ fontSize: 14 }} aria-hidden="true" />Root cause analysis
                </div>
                <div style={{ fontSize: 12, color: RAMPS.red[800], marginBottom: 6, lineHeight: 1.6 }}>{r.rootCause.summary}</div>
                <div style={{ fontSize: 11.5, color: RAMPS.pink[800], marginBottom: 6, lineHeight: 1.6 }}><strong>Missed driver:</strong> {r.rootCause.driverMissed}</div>
                {r.rootCause.whyEachSignalFailed.map((s, j) => (
                  <div key={j} style={{ fontSize: 11, color: '#5F5E5A', marginLeft: 14, marginBottom: 3, lineHeight: 1.5 }}>• <strong>{s.signal}:</strong> {s.issue}</div>
                ))}
                <div style={{ fontSize: 12, color: RAMPS.green[800], background: RAMPS.green[50], borderRadius: 7, padding: '7px 9px', marginTop: 7, lineHeight: 1.55 }}>
                  <i className="ti ti-tool" style={{ fontSize: 13, marginRight: 4 }} aria-hidden="true" /><strong>Fix applied:</strong> {r.rootCause.fixApplied}
                </div>
              </div>
            )}
          </div>
        ))}
      </Card>
    </>
  )
}

function MCXHistory({ mcxStats }) {
  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: '1.1rem' }}>
        <Metric label="MCX accuracy (1 month)" value={mcxStats.accuracyPct != null ? `${mcxStats.accuracyPct}%` : '—'} sub={`${mcxStats.correct} of ${mcxStats.total}`} ramp={mcxStats.accuracyPct >= 60 ? 'green' : 'red'} />
        <Metric label="Hits" value={mcxStats.correct} ramp="green" />
        <Metric label="Misses" value={mcxStats.misses} sub="root cause below" ramp="red" />
      </div>

      <Card>
        <SectionLabel icon="ti-list-details">1-month backtest — predicted vs achieved levels</SectionLabel>
        {MCX_BACKTEST.map((r, i) => (
          <div key={i} style={{ padding: '13px 0', borderBottom: i < MCX_BACKTEST.length - 1 ? '0.5px solid #F1EFE8' : 'none' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 6, flexWrap: 'wrap' }}>
              <Pill text={r.symbol} ramp="gray" />
              <span style={{ fontSize: 12, color: '#888780' }}>week of {r.weekOf}</span>
              <Pill text={r.predictedDirection} ramp={toneRamp(r.predictedDirection)} />
              {r.predictedLevel != null && <span style={{ fontSize: 11, color: '#888780' }}>predicted ~{r.predictedLevel}</span>}
              <i className="ti ti-arrow-right" style={{ fontSize: 12, color: '#888780' }} aria-hidden="true" />
              <span style={{ fontSize: 12, fontWeight: 500 }}>achieved {r.achievedLevel.toLocaleString()}</span>
              <div style={{ flex: 1 }} />
              <Pill text={r.result} ramp={r.result === 'correct' ? 'green' : 'red'} />
            </div>
            {r.note && <div style={{ fontSize: 12, color: '#5F5E5A', lineHeight: 1.55, marginBottom: 3 }}>{r.note}</div>}
            {r.dataConfidence && <div style={{ fontSize: 10.5, color: '#888780', fontStyle: 'italic' }}>Data confidence: {r.dataConfidence}</div>}
            {r.rootCause && (
              <div style={{ background: RAMPS.red[50], borderRadius: 9, padding: '11px 13px', marginTop: 7 }}>
                <div style={{ fontSize: 12, fontWeight: 500, color: RAMPS.red[800], marginBottom: 5, display: 'flex', alignItems: 'center', gap: 5 }}>
                  <i className="ti ti-alert-triangle" style={{ fontSize: 14 }} aria-hidden="true" />Why this prediction was false
                </div>
                <div style={{ fontSize: 12, color: RAMPS.red[800], marginBottom: 6, lineHeight: 1.6 }}>{r.rootCause}</div>
                <div style={{ fontSize: 12, color: RAMPS.green[800], background: RAMPS.green[50], borderRadius: 7, padding: '7px 9px', lineHeight: 1.55 }}>
                  <i className="ti ti-tool" style={{ fontSize: 13, marginRight: 4 }} aria-hidden="true" /><strong>Fix applied:</strong> {r.fixNote}
                </div>
              </div>
            )}
          </div>
        ))}
      </Card>
    </>
  )
}

function Playbook() {
  const items = [
    {
      icon: 'ti-target-arrow', ramp: 'green', title: 'Win-size vs loss-size, not win-rate, decides monthly P&L',
      body: 'A system that wins 40% of the time but wins 3x its average loss is more profitable than one that wins 70% of the time at 1:1. The credit-spread engine on the NIFTY home tab is built around this — small, frequent, high-probability wins; the 3:25 PM play is the deliberate opposite, a small number of asymmetric winners. Track both win rate AND average-win/average-loss separately — optimizing only for win rate is the most common way retail traders quietly lose money while feeling like they are doing well most days.',
    },
    {
      icon: 'ti-calendar-time', ramp: 'amber', title: 'Day-of-week and DTE patterns are real but decay — re-test monthly',
      body: 'Earlier research on this account found Monday entries and 4-5 day DTE produced materially better win rates than Tuesday/Friday entries and 0-2 day DTE, tied to the post-Sep-2025 Tuesday expiry cycle. These patterns come from market microstructure and they DO shift when the underlying expiry calendar or volatility regime shifts. Re-run this specific check against the most recent 4-6 weeks at least monthly rather than assuming it holds forever.',
    },
    {
      icon: 'ti-droplet', ramp: 'coral', title: 'Track commodity and FX correlation as leading indicators, not just confirming ones',
      body: "Brent crude and USD/INR both move NIFTY with a short lag through import costs, inflation expectations, and FII flows. The MCX tab exists specifically so a crude or gold move can be read as an early signal for NIFTY the next session, not just analysed in isolation. The 24 Jun miss happened precisely because crude's move was real and visible but not yet wired into the NIFTY score at the time.",
    },
    {
      icon: 'ti-news', ramp: 'pink', title: 'Named catalysts deserve their own factor, weighted by resolution date',
      body: 'A generic catalyst flag is a blunt instrument. The more useful version tracks: what is the event, when does it resolve, and what is the position-sizing implication for trades that would still be open at resolution. The Iran-US talks sitting unresolved over the 26-29 June holiday weekend is exactly this kind of risk — it argues for smaller size or no new directional bets until the outcome is known, not just a generic watch-the-news note.',
    },
    {
      icon: 'ti-calendar-exclamation', ramp: 'blue', title: 'Weekends and holidays are wider, slower-resolving risk windows',
      body: 'A 3-day gap (Thursday close to Monday open, as happens around a Friday holiday) gives unresolved news 3x the normal window to move the market before the next session even opens. Confidence should be reduced and predicted ranges widened specifically because of elapsed time, independent of how strong the underlying signals look. This was added to the model as v4 specifically because of the 26 June Muharram holiday.',
    },
    {
      icon: 'ti-stack-2', ramp: 'purple', title: 'Keep the model auditable — every factor traces to a real miss or a real source',
      body: 'It is tempting to keep adding smart-looking factors. The discipline that has kept this system honest so far: every factor currently in the model was added because of a specific, named, dated prediction failure with a documented root cause (see the NIFTY 30-day tab). The model grows only when it has actually been wrong in a way the new factor would have caught — not speculatively. Keep this discipline as the system evolves.',
    },
  ]

  return (
    <>
      <Card style={{ marginBottom: '1.1rem', background: `linear-gradient(135deg, ${RAMPS.blue[50]}, #fff 70%)` }} ramp="blue">
        <SectionLabel icon="ti-bulb">What this system needs to keep improving, based on deep research so far</SectionLabel>
        <div style={{ fontSize: 13, color: RAMPS.blue[800], lineHeight: 1.7 }}>
          These are structural notes for building a system that compounds small edges reliably, rather than chasing a single perfect prediction. Each item below comes from something that was either tested against real outcomes on this dashboard, or is a well-documented pattern from how options markets and institutional flows actually behave.
        </div>
      </Card>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 12 }}>
        {items.map((it, i) => (
          <Card key={i} ramp={it.ramp}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 8 }}>
              <span style={{ width: 30, height: 30, borderRadius: 9, background: RAMPS[it.ramp][50], display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <i className={`ti ${it.icon}`} style={{ fontSize: 16, color: RAMPS[it.ramp][600] }} aria-hidden="true" />
              </span>
              <div style={{ fontSize: 13.5, fontWeight: 500, lineHeight: 1.4, paddingTop: 3 }}>{it.title}</div>
            </div>
            <div style={{ fontSize: 12, color: '#5F5E5A', lineHeight: 1.65 }}>{it.body}</div>
          </Card>
        ))}
      </div>
    </>
  )
}

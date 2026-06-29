import { useState, useEffect, useCallback } from 'react'
import Head from 'next/head'
import {
  Activity, OctagonAlert, ArrowLeftRight, Radio, Landmark, Lightbulb, Calendar,
  CalendarClock, CalendarX2, CalendarRange, CalendarDays, BarChart3,
  CandlestickChart, PieChart, Check, PauseCircle, PlayCircle, Coins, Droplet,
  Eye, EyeOff, Filter, Fingerprint, GitBranch, Info, Layers, ListChecks,
  ListTree, Microscope, Minus, Newspaper, Circle, Dot, Receipt, RefreshCw,
  Ruler, ShieldCheck, ShieldAlert, Layers2, Table, Target, Crosshair, Wrench,
  TrendingDown, TrendingUp, Globe, TriangleAlert, ArrowRight, Database,
} from 'lucide-react'
import { MODEL_VERSION, MODEL_CHANGELOG, PREDICTION_LOG, getAccuracyStats, build325Strategy } from '../lib/learning'
import { MCX_COMMODITIES, MCX_BACKTEST, USD_INR, getMCXAccuracyStats, getTradableCommodities } from '../lib/mcx'
import { buildStrategies } from '../lib/strategy'
import {
  TRADE_HISTORY_META, STRATEGY_SCORECARD, DTE_PATTERN, DOW_PATTERN,
  PREMIUM_ZONE_PATTERN, BULL_PUT_SPREAD_WIDTH_PATTERN, TOP_LOSSES, TOP_WINS,
  BIG_LOSS_FINGERPRINT, MONTHLY_TREND, HARD_RULES,
} from '../lib/tradeHistory'
import { buildEvidenceChain, CURRENT_OI_SNAPSHOT } from '../lib/oiSignals'
import { PSEUDO_SIGNALS } from '../lib/pseudoSignals'
import { buildHorizons } from '../lib/horizons'
import { NEWS_WATCH } from '../lib/newsWatch'

const FALLBACK_DATA = {
  asOf: '25 Jun 2026 close (fallback — Fri 26 Jun was a market holiday)',
  niftyClose: 24056.00,
  niftyPrev: 24021.65,
  giftNifty: 24081,
  vix: 13.05,
  vixPrev: 13.94,
  pcr: 1.177,
  fiiNet: 383.76,
  diiNet: 5747.75,
  crudePct: -4.34,
  catalystNote: 'Iran fired drones at Strait of Hormuz 26 Jun (ceasefire violation), but crude still fell 4.34% same session — market reads it as contained, not a fresh escalation. US-Iran talks: 60-day roadmap agreed 21-22 Jun, implementation details still being worked out.',
  support: 24000,
  resistance: 24200,
  maxPain: 24100,
  isLive: false,
  isWeekendGap: true,
  nextSessionLabel: 'Monday 29 Jun 2026',
  nextExpiryDte: 4,
  gapDays: 3,
}

const GLOBAL_INDICES = [
  { label: 'GIFT Nifty', value: 24081, chgPct: 0.06, region: 'India', isGift: true },
  { label: 'S&P 500', value: 7354.02, chgPct: -0.05, region: 'US' },
  { label: 'Dow Jones', value: 51876.11, chgPct: -0.09, region: 'US' },
  { label: 'Nasdaq', value: 25297.62, chgPct: -0.24, region: 'US' },
  { label: 'Russell 2000', value: 3010.08, chgPct: 0.07, region: 'US' },
  { label: 'Nikkei 225', value: 69360.88, chgPct: -4.15, region: 'Asia' },
  { label: 'Hang Seng', value: 22671.86, chgPct: -1.76, region: 'Asia' },
  { label: 'Shanghai CSI 300', value: 4892.12, chgPct: -0.45, region: 'Asia' },
  { label: 'FTSE 100', value: 10508.02, chgPct: -0.21, region: 'Europe' },
  { label: 'DAX', value: 24671.22, chgPct: -1.29, region: 'Europe' },
  { label: 'CAC 40', value: 8384.87, chgPct: -0.55, region: 'Europe' },
  { label: 'CBOE VIX (US)', value: 18.41, chgPct: -2.54, region: 'Vol', invertColor: true },
  { label: 'India VIX', value: 13.05, chgPct: -6.38, region: 'Vol', invertColor: true },
]

const FACTOR_META = {
  'Realized trend':     { icon: 'ti-trending-up', ramp: 'blue' },
  'GIFT Nifty gap':     { icon: 'ti-world', ramp: 'blue' },
  'India VIX':          { icon: 'ti-activity', ramp: 'purple' },
  'PCR (fresh series)': { icon: 'ti-chart-donut', ramp: 'coral' },
  'Crude oil (Brent)':  { icon: 'ti-droplet', ramp: 'coral' },
  'FII / DII flow':     { icon: 'ti-building-bank', ramp: 'green' },
  'Catalyst flag':      { icon: 'ti-news', ramp: 'pink' },
  'Weekend gap flag':   { icon: 'ti-calendar-exclamation', ramp: 'amber' },
}

function computeScoreV5(d) {
  const factors = []
  let score = 0

  const chgPct = ((d.niftyClose - d.niftyPrev) / d.niftyPrev) * 100
  const s1 = chgPct > 0.5 ? 25 : chgPct < -0.5 ? -25 : Math.round(chgPct * 30)
  score += s1
  factors.push({ name: 'Realized trend', detail: `${chgPct.toFixed(2)}% close-over-close`, score: s1, rule: 'Last full session move' })

  const giftGapPct = d.giftNifty != null ? ((d.giftNifty - d.niftyClose) / d.niftyClose) * 100 : 0
  const s1b = d.giftNifty != null ? (giftGapPct > 0.3 ? 15 : giftGapPct < -0.3 ? -15 : Math.round(giftGapPct * 20)) : 0
  if (d.giftNifty != null) {
    score += s1b
    factors.push({ name: 'GIFT Nifty gap', detail: `${d.giftNifty.toLocaleString()} vs ${d.niftyClose.toLocaleString()} close (${giftGapPct > 0 ? '+' : ''}${giftGapPct.toFixed(2)}%)`, score: s1b, rule: 'Overnight futures gap — the earliest live read on tomorrow\'s open' })
  }

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

const RAMPS = {
  blue:   { 50: '#E6F1FB', 100: '#B5D4F4', 600: '#185FA5', 800: '#0C447C' },
  green:  { 50: '#EAF3DE', 100: '#C0DD97', 600: '#3B6D11', 800: '#27500A' },
  red:    { 50: '#FCEBEB', 100: '#F7C1C1', 600: '#A32D2D', 800: '#791F1F' },
  amber:  { 50: '#FAEEDA', 100: '#FAC775', 600: '#854F0B', 800: '#633806' },
  purple: { 50: '#EEEDFE', 100: '#CECBF6', 600: '#534AB7', 800: '#3C3489' },
  coral:  { 50: '#FAECE7', 100: '#F5C4B3', 600: '#993C1D', 800: '#712B13' },
  pink:   { 50: '#FBEAF0', 100: '#F4C0D1', 600: '#993556', 800: '#72243E' },
  gray:   { 50: '#F1EFE8', 100: '#D3D1C7', 600: '#5F5E5A', 800: '#444441' },
}

function heatColor(chgPct, invert = false) {
  // VIX (and any other "fear gauge") is the opposite of every other index:
  // a FALL in VIX is bullish for equities, so its color must invert —
  // green for falling, red for rising. Bug fixed 28 Jun 2026: a falling
  // India VIX was showing red right next to a bullish verdict, directly
  // contradicting the call it sat beside.
  const effective = invert ? -chgPct : chgPct
  const a = Math.min(Math.abs(effective) / 4, 1)
  if (effective > 0.05) {
    if (a > 0.6) return { bg: '#97C459', fg: '#173404' }
    if (a > 0.25) return { bg: '#C0DD97', fg: '#27500A' }
    return { bg: '#EAF3DE', fg: '#3B6D11' }
  }
  if (effective < -0.05) {
    if (a > 0.6) return { bg: '#E24B4A', fg: '#501313' }
    if (a > 0.25) return { bg: '#F09595', fg: '#791F1F' }
    return { bg: '#FCEBEB', fg: '#A32D2D' }
  }
  return { bg: '#F1EFE8', fg: '#5F5E5A' }
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

function SectionLabel({ children, icon, sub }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 11, fontWeight: 500, color: '#888780', letterSpacing: '.05em', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 6 }}>
        {icon && <Icon name={icon} size={13} />}{children}
      </div>
      {sub && <div style={{ fontSize: 11, color: '#888780', marginTop: 2 }}>{sub}</div>}
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
            <Icon name={meta.icon} size={13} style={{ color: RAMPS[meta.ramp][600] }} />
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

// Icon system — switched from a webfont CDN (tabler-icons) to real,
// bundled SVG components (lucide-react) after Cowork's verification
// reported the webfont's glyphs were not rendering (empty icon-wrapper
// circles), a documented, recurring issue with that exact CDN package
// across multiple browsers (see GitHub tabler/tabler-icons issues #476,
// #1327, #1415, #1452). SVG components bundled at build time cannot fail
// to render the way a runtime font download can.
const ICON_MAP = {
  'ti-activity': Activity, 'ti-alert-octagon': OctagonAlert, 'ti-arrows-horizontal': ArrowLeftRight,
  'ti-broadcast': Radio, 'ti-building-bank': Landmark, 'ti-bulb': Lightbulb, 'ti-calendar': Calendar,
  'ti-calendar-event': CalendarClock, 'ti-calendar-exclamation': CalendarX2, 'ti-calendar-stats': CalendarRange,
  'ti-calendar-time': CalendarClock, 'ti-calendar-week': CalendarDays, 'ti-chart-bar': BarChart3,
  'ti-chart-candle': CandlestickChart, 'ti-chart-donut': PieChart, 'ti-check': Check,
  'ti-clock-pause': PauseCircle, 'ti-clock-play': PlayCircle, 'ti-coin': Coins, 'ti-droplet': Droplet,
  'ti-eye': Eye, 'ti-eye-exclamation': EyeOff, 'ti-filter': Filter, 'ti-fingerprint': Fingerprint,
  'ti-git-branch': GitBranch, 'ti-info-circle': Info, 'ti-layers-intersect': Layers,
  'ti-list-check': ListChecks, 'ti-list-details': ListTree, 'ti-microscope': Microscope,
  'ti-minus': Minus, 'ti-news': Newspaper, 'ti-point': Circle, 'ti-point-filled': Dot,
  'ti-receipt-rupee': Receipt, 'ti-refresh': RefreshCw, 'ti-ruler-2': Ruler,
  'ti-shield-check': ShieldCheck, 'ti-shield-exclamation': ShieldAlert, 'ti-stack-2': Layers2,
  'ti-table': Table, 'ti-target': Target, 'ti-target-arrow': Crosshair, 'ti-tool': Wrench,
  'ti-trending-down': TrendingDown, 'ti-trending-up': TrendingUp, 'ti-world': Globe,
  'ti-alert-triangle': TriangleAlert, 'ti-arrow-right': ArrowRight, 'ti-shield': ShieldCheck, 'ti-database': Database,
}

function Icon({ name, size = 14, style, ...rest }) {
  const Cmp = ICON_MAP[name]
  if (!Cmp) return null
  return <Cmp size={size} style={{ display: 'inline-block', verticalAlign: 'middle', ...style }} aria-hidden="true" {...rest} />
}

function toneRamp(dir) { return dir === 'BULL' ? 'green' : dir === 'BEAR' ? 'red' : 'gray' }
function convRamp(c) { return c === 'HIGH' ? 'amber' : c === 'MED' ? 'blue' : 'gray' }

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

  const RESULT = computeScoreV5(data)
  const STRATEGIES = buildStrategies(RESULT.direction, RESULT.confidence, data, data.nextExpiryDte)
  const STRAT325 = build325Strategy(RESULT.direction, data.niftyClose, RESULT.confidence)
  const HORIZONS = buildHorizons(RESULT.total, RESULT.direction, RESULT.confidence, data)
  const EVIDENCE = buildEvidenceChain(data)
  const stats = getAccuracyStats(PREDICTION_LOG)
  const mcxStats = getMCXAccuracyStats()
  const { tradable, watchOnly } = getTradableCommodities(MCX_COMMODITIES)

  const NAV = [
    { k: 'nifty-home', label: 'NIFTY', icon: 'ti-chart-candle' },
    { k: 'mcx-home', label: 'MCX', icon: 'ti-coin' },
    { k: 'nifty-history', label: 'NIFTY · 30-day', icon: 'ti-table' },
    { k: 'mcx-history', label: 'MCX · 30-day', icon: 'ti-table' },
    { k: 'pattern-intel', label: 'Pattern Intelligence', icon: 'ti-microscope' },
    { k: 'playbook', label: 'Playbook', icon: 'ti-bulb' },
  ]

  return (
    <>
      <Head>
        <title>NIFTY + MCX prediction system</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <div style={{ fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif', background: '#F7F6F3', minHeight: '100vh', paddingBottom: '3rem' }}>

        <div style={{ background: '#fff', borderBottom: '0.5px solid #E5E3DC', position: 'sticky', top: 0, zIndex: 50 }}>
          <div style={{ maxWidth: 1080, margin: '0 auto', padding: '0 1.5rem', display: 'flex', alignItems: 'center', height: 58, gap: 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              <div style={{ width: 32, height: 32, borderRadius: 9, background: RAMPS[toneRamp(RESULT.direction)][600], display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name={RESULT.direction === 'BULL' ? 'ti-trending-up' : RESULT.direction === 'BEAR' ? 'ti-trending-down' : 'ti-minus'} size={18} style={{ color: '#fff' }} />
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
                  <Icon name={n.icon} size={14} />{n.label}
                </button>
              ))}
            </nav>
          </div>
        </div>

        <div style={{ maxWidth: 1080, margin: '0 auto', padding: '1.4rem 1.5rem' }}>

          <div style={{
            background: data.isLive ? RAMPS.green[50] : RAMPS.amber[50],
            borderRadius: 10, padding: '0.65rem 1rem', marginBottom: '1.25rem', fontSize: 12,
            color: data.isLive ? RAMPS.green[800] : RAMPS.amber[800],
            display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap',
          }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Icon name={data.isLive ? 'ti-broadcast' : 'ti-clock-pause'} size={14} />
              <strong>{data.isLive ? 'Live' : 'Last known'}</strong> — {data.asOf}
              {data.isWeekendGap && <Pill text={`${data.gapDays}-day gap to ${data.nextSessionLabel}`} ramp="amber" />}
              {fetchError && <span style={{ opacity: 0.8 }}> · {fetchError}</span>}
            </span>
            <button onClick={fetchLive} disabled={loading} style={{ fontSize: 11, padding: '4px 10px', borderRadius: 7, border: '0.5px solid currentColor', background: 'transparent', color: 'inherit', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, opacity: 0.85 }}>
              <Icon name="ti-refresh" size={13} />{loading ? 'refreshing…' : 'refresh now'}
            </button>
          </div>

          {tab === 'nifty-home' && (
            <NiftyHome data={data} RESULT={RESULT} STRATEGIES={STRATEGIES} STRAT325={STRAT325} HORIZONS={HORIZONS} EVIDENCE={EVIDENCE} />
          )}

          {tab === 'mcx-home' && <MCXHome tradable={tradable} watchOnly={watchOnly} />}

          {tab === 'nifty-history' && <NiftyHistory stats={stats} />}

          {tab === 'mcx-history' && <MCXHistory mcxStats={mcxStats} />}

          {tab === 'pattern-intel' && <PatternIntelligence />}

          {tab === 'playbook' && <Playbook />}

        </div>
      </div>
    </>
  )
}

function NiftyHome({ data, RESULT, STRATEGIES, STRAT325, HORIZONS, EVIDENCE }) {
  const ramp = toneRamp(RESULT.direction)
  const r = RAMPS[ramp]

  return (
    <>
      <Card style={{ marginBottom: '1.1rem', background: `linear-gradient(135deg, ${r[50]}, #fff 70%)` }} ramp={ramp}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
          <div>
            <SectionLabel icon="ti-calendar-event">Next session forecast · {data.nextSessionLabel}</SectionLabel>
            <div style={{ fontSize: 30, fontWeight: 500, color: r[800], display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
              <Icon name={RESULT.direction === 'BULL' ? 'ti-trending-up' : RESULT.direction === 'BEAR' ? 'ti-trending-down' : 'ti-arrows-horizontal'} size={30} />
              {RESULT.direction === 'BULL' ? 'Bullish bias' : RESULT.direction === 'BEAR' ? 'Bearish bias' : 'Neutral — range-bound'}
            </div>
            <div style={{ fontSize: 13, color: '#5F5E5A' }}>Score {RESULT.total > 0 ? '+' : ''}{RESULT.total}/100</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
            <Pill text={`${RESULT.confidence} confidence`} ramp={convRamp(RESULT.confidence)} />
            {RESULT.dampened && <Pill text="dampened for weekend gap" ramp="amber" />}
          </div>
        </div>
      </Card>

      <SectionLabel icon="ti-target" sub="The actual numbers behind the direction call above — support, resistance, and max pain for the next session">Predicted market levels — {data.nextSessionLabel}</SectionLabel>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: '1.1rem' }}>
        <Metric label="Last close" value={data.niftyClose.toLocaleString()} ramp="gray" />
        <Metric label="Predicted support" value={data.support.toLocaleString()} sub="downside floor for tomorrow" ramp="green" />
        <Metric label="Predicted resistance" value={data.resistance.toLocaleString()} sub="upside ceiling for tomorrow" ramp="red" />
        <Metric label="Max pain (this expiry)" value={data.maxPain.toLocaleString()} sub="gravitational pull near expiry" ramp="amber" />
      </div>

      <SectionLabel icon="ti-world" sub="Color intensity scales with magnitude of move — darker means a stronger signal in that direction">Global indices heatmap (overnight)</SectionLabel>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 7, marginBottom: '1.1rem' }}>
        {GLOBAL_INDICES.map(g => {
          const hc = heatColor(g.chgPct, g.invertColor)
          return (
            <div key={g.label} style={{ background: hc.bg, borderRadius: 9, padding: '10px 12px' }}>
              <div style={{ fontSize: 10.5, color: hc.fg, opacity: 0.85, marginBottom: 2 }}>{g.label}</div>
              <div style={{ fontSize: 14, fontWeight: 500, color: hc.fg }}>{g.value.toLocaleString()}</div>
              <div style={{ fontSize: 11, fontWeight: 500, color: hc.fg }}>{g.chgPct > 0 ? '+' : ''}{g.chgPct}%</div>
            </div>
          )
        })}
      </div>

      <SectionLabel icon="ti-calendar-stats" sub="Your trade log shows longer holds win far more than next-day entries — these three horizons make that visible side by side">Forecast across time horizons</SectionLabel>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: '1.1rem' }}>
        {HORIZONS.map(h => (
          <Card key={h.id} ramp={toneRamp(h.direction)}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{h.label}</div>
                <div style={{ fontSize: 10.5, color: '#888780' }}>{h.window}</div>
              </div>
              <Pill text={h.direction} ramp={toneRamp(h.direction)} />
            </div>
            <div style={{ fontSize: 17, fontWeight: 500, marginBottom: 4 }}>{h.range[0].toLocaleString()}–{h.range[1].toLocaleString()}</div>
            <Pill text={`${h.confidence} confidence`} ramp={convRamp(h.confidence)} />
            <div style={{ fontSize: 11, color: '#5F5E5A', lineHeight: 1.55, marginTop: 8 }}>{h.rationale}</div>
            <div style={{ fontSize: 10.5, color: '#888780', marginTop: 6, fontStyle: 'italic' }}>{h.historicalWinRate}</div>
          </Card>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: '1.1rem' }}>
        <Card>
          <SectionLabel icon="ti-list-check">Why — signal breakdown</SectionLabel>
          {RESULT.factors.map((f, i) => <FactorRow key={f.name} f={f} isLast={i === RESULT.factors.length - 1} />)}
        </Card>

        <Card>
          <SectionLabel icon="ti-fingerprint" sub="Named, sourced evidence points — not a vague pattern claim">Evidence chain</SectionLabel>
          {EVIDENCE.map((e, i) => (
            <div key={i} style={{ padding: '9px 0', borderBottom: i < EVIDENCE.length - 1 ? '0.5px solid #F1EFE8' : 'none' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 7 }}>
                <Icon name="ti-point-filled" size={9} style={{ color: RAMPS.purple[600], marginTop: 5, flexShrink: 0 }} />
                <div>
                  <div style={{ fontSize: 12.5, fontWeight: 500 }}>{e.dot}</div>
                  <div style={{ fontSize: 11.5, color: '#5F5E5A', lineHeight: 1.5, marginTop: 1 }}>{e.reading}</div>
                  <div style={{ fontSize: 10, color: '#B4B2A9', marginTop: 1 }}>Source: {e.source}</div>
                </div>
              </div>
            </div>
          ))}
        </Card>
      </div>

      <Card style={{ marginBottom: '1.1rem' }} ramp="blue">
        <SectionLabel icon="ti-news" sub="Cross-checked across multiple sources before use — each item's impact is read separately from its headline">News &amp; catalyst watch</SectionLabel>
        {NEWS_WATCH.map(n => (
          <div key={n.id} style={{ padding: '9px 0', borderBottom: n.id !== NEWS_WATCH[NEWS_WATCH.length - 1].id ? '0.5px solid #F1EFE8' : 'none' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 3 }}>
              <div style={{ fontSize: 12.5, fontWeight: 500, flex: 1 }}>{n.headline}</div>
              <Pill text={n.impact} ramp={n.impact === 'BULLISH' ? 'green' : n.impact === 'CAUTION' || n.impact === 'WATCH' ? 'amber' : 'gray'} />
            </div>
            <div style={{ fontSize: 11, color: '#888780', marginBottom: 2 }}>{n.when}</div>
            <div style={{ fontSize: 11.5, color: '#5F5E5A', lineHeight: 1.5, marginBottom: 2 }}>{n.impactNote}</div>
            <div style={{ fontSize: 10, color: '#B4B2A9' }}>Source: {n.source}</div>
          </div>
        ))}
      </Card>

      <Card style={{ marginBottom: '1.1rem' }} ramp="pink">
        <SectionLabel icon="ti-eye-exclamation" sub="Signals that look directional but are documented traps — checked fresh each time, not asserted blind">Pseudo-signal watch</SectionLabel>
        {PSEUDO_SIGNALS.map(p => (
          <div key={p.id} style={{ padding: '9px 0', borderBottom: p.id !== PSEUDO_SIGNALS[PSEUDO_SIGNALS.length - 1].id ? '0.5px solid #F1EFE8' : 'none' }}>
            <div style={{ fontSize: 12.5, fontWeight: 500, marginBottom: 3 }}>{p.name}</div>
            <div style={{ fontSize: 11.5, color: '#888780', marginBottom: 3, lineHeight: 1.5 }}><strong>Looks like:</strong> {p.trap}</div>
            <div style={{ fontSize: 11.5, color: RAMPS.pink[600], marginBottom: 3, lineHeight: 1.5 }}><strong>Actually:</strong> {p.reality}</div>
            <div style={{ fontSize: 11, color: RAMPS.green[600], lineHeight: 1.5 }}><Icon name="ti-shield-check" size={12} style={{ marginRight: 3 }} />{p.rule}</div>
          </div>
        ))}
      </Card>

      <Card style={{ marginBottom: '1.1rem' }}>
        <SectionLabel icon="ti-layers-intersect" sub={`PCR ${CURRENT_OI_SNAPSHOT.pcr} · Max pain ${CURRENT_OI_SNAPSHOT.maxPain.toLocaleString()} · As of ${CURRENT_OI_SNAPSHOT.asOf}`}>Option chain OI map</SectionLabel>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 7 }}>
          {CURRENT_OI_SNAPSHOT.strikes.map(s => {
            const isATM = Math.abs(s.strike - CURRENT_OI_SNAPSHOT.spot) < 60
            return (
              <div key={s.strike} style={{ background: isATM ? RAMPS.amber[50] : '#F7F6F3', borderRadius: 8, padding: '8px 9px', textAlign: 'center' }}>
                <div style={{ fontSize: 12, fontWeight: 500 }}>{s.strike.toLocaleString()}</div>
                <div style={{ fontSize: 9.5, color: RAMPS.red[600], marginTop: 3 }}>Call: {s.callOI}</div>
                <div style={{ fontSize: 9.5, color: RAMPS.green[600] }}>Put: {s.putOI}</div>
                <div style={{ fontSize: 9, color: '#888780', marginTop: 3, lineHeight: 1.3 }}>{s.note}</div>
              </div>
            )
          })}
        </div>
      </Card>

      <SectionLabel icon="ti-target-arrow" sub="Ranked so you can see the real tradeoff: higher win-rate structures have a worse payoff ratio, and vice versa">Trade structures — ranked by win-size vs loss-size ratio</SectionLabel>

      {STRATEGIES[0]?.dteWarning && (
        <div style={{
          background: STRATEGIES[0].dteWarning.level === 'critical' ? RAMPS.red[50] : RAMPS.green[50],
          border: `1px solid ${STRATEGIES[0].dteWarning.level === 'critical' ? RAMPS.red[600] : RAMPS.green[600]}40`,
          borderRadius: 10, padding: '0.75rem 1rem', marginBottom: '0.9rem', fontSize: 12,
          color: STRATEGIES[0].dteWarning.level === 'critical' ? RAMPS.red[800] : RAMPS.green[800],
          display: 'flex', gap: 8, alignItems: 'flex-start',
        }}>
          <Icon name={STRATEGIES[0].dteWarning.level === 'critical' ? 'ti-alert-octagon' : 'ti-check'} size={16} style={{ marginTop: 1, flexShrink: 0 }} />
          <span>
            <strong>{STRATEGIES[0].dteWarning.message}</strong>
            {STRATEGIES[0].dteWarning.evidence && <span> {STRATEGIES[0].dteWarning.evidence}</span>}
          </span>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: '1.1rem' }}>
        {STRATEGIES.filter(s => !s.skip).sort((a, b) => (b.ratio ?? 0) - (a.ratio ?? 0)).map(s => (
          <Card key={s.id} ramp={s.isPrimary ? 'amber' : undefined} style={s.isPrimary ? { borderWidth: 2 } : {}}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 500 }}>{s.name}</div>
              {s.isPrimary && <Pill text="recommended today" ramp="amber" />}
            </div>
            <div style={{ fontSize: 10.5, color: '#888780', marginBottom: 8 }}>{s.shape}</div>
            {s.expiryDate && (
              <div style={{ marginBottom: 8 }}>
                <Pill text={`Expiry: ${s.expiryDate} (DTE ${s.dte})`} ramp="blue" />
              </div>
            )}
            {s.legs.map((l, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, padding: '2px 0' }}>
                <span><Pill text={l.action} ramp={l.action === 'BUY' ? 'green' : 'red'} /> {l.strike.toLocaleString()} {l.inst}{l.qty > 1 ? ` × ${l.qty} lots` : ''}</span>
                <span style={{ color: '#888780' }}>₹{l.premium}</span>
              </div>
            ))}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginTop: 8, marginBottom: 8 }}>
              <Metric label={s.isRatioSpread ? 'Profit beyond far strike' : 'Max profit'} value={s.maxProfit != null ? `₹${s.maxProfit.toLocaleString()}` : 'Re-accelerates, uncapped'} ramp="green" />
              <Metric label={s.isRatioSpread ? 'Max loss (at far strike)' : 'Max loss'} value={`₹${s.maxLoss.toLocaleString()}`} ramp="red" />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, marginBottom: 6 }}>
              <span style={{ color: '#888780' }}>Ratio</span>
              <strong>{s.ratio != null ? `${s.ratio}x ${s.ratio > 1 ? '(profit > loss)' : '(loss > profit)'}` : 'Not fixed — depends how far price moves past the far strike'}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, marginBottom: 8 }}>
              <span style={{ color: '#888780' }}>Est. probability of profit</span>
              <strong>{s.popPct}%</strong>
            </div>
            <div style={{ fontSize: 11, color: '#5F5E5A', lineHeight: 1.6, marginBottom: 6 }}>{s.rationale}</div>
            <div style={{ fontSize: 10.5, color: RAMPS.blue[600], background: RAMPS.blue[50], borderRadius: 6, padding: '6px 8px', lineHeight: 1.5 }}>{s.monthlyMathNote}</div>
          </Card>
        ))}
      </div>

      <Card style={{ marginBottom: '1.1rem' }} ramp="amber">
        <SectionLabel icon="ti-clock-play" sub="A fourth, separate structure — deliberately higher variance, by design">3:25 PM closing-window directional play</SectionLabel>
        {STRAT325.skip ? (
          <div style={{ fontSize: 13, color: '#5F5E5A', lineHeight: 1.7 }}>{STRAT325.reason}</div>
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6, marginBottom: 8 }}>
              <Metric label="Strike" value={`${STRAT325.strike.toLocaleString()} ${STRAT325.inst}`} ramp="blue" />
              <Metric label="Entry" value={`₹${STRAT325.estPremium}`} ramp="blue" />
              <Metric label="Stop (50%)" value={`₹${STRAT325.stopLossPremium}`} ramp="red" />
              <Metric label="2x target" value={`+₹${STRAT325.profit2x.toLocaleString()}`} ramp="green" />
              <Metric label="3x target" value={`+₹${STRAT325.profit3x.toLocaleString()}`} ramp="green" />
            </div>
            <div style={{ fontSize: 11, color: '#888780' }}>Single-leg buy, not a spread. Enter 3:25–3:28 PM only. Cut the loser fast at the stop, let the winner run.</div>
          </>
        )}
      </Card>

      <div style={{ background: RAMPS.blue[50], borderRadius: 10, padding: '0.85rem 1.1rem', fontSize: 12, color: RAMPS.blue[800], lineHeight: 1.65, display: 'flex', gap: 8 }}>
        <Icon name="ti-info-circle" size={16} style={{ marginTop: 1, flexShrink: 0 }} />
        <span><strong>How to use the three trade structures above:</strong> they are the same view expressed at three different win-rate/payoff tradeoffs, not three independent recommendations to all take. The credit spread wins more often but loses more when wrong. The debit spreads win less often but the win pays for more than one loss. Running the amber-highlighted one as your default, sized so any single max loss is genuinely tolerable, is what survives a month where half your trades go against you.</span>
      </div>
    </>
  )
}

function MCXHome({ tradable, watchOnly }) {
  return (
    <>
      <Card style={{ marginBottom: '1.1rem', background: `linear-gradient(135deg, ${RAMPS.coral[50]}, #fff 70%)` }} ramp="coral">
        <SectionLabel icon="ti-bulb">This week's macro theme across MCX commodities</SectionLabel>
        <div style={{ fontSize: 13, color: RAMPS.coral[800], lineHeight: 1.7 }}>
          A broad commodity-complex selloff, driven by two converging stories: <strong>(1)</strong> the Fed's hawkish pivot under new Chair Kevin Warsh, with September rate-hike odds jumping to 68% from 29% a week ago, and <strong>(2)</strong> the Strait of Hormuz reopening, unwinding the Middle East war-risk premium that had pushed crude and gold to extreme highs earlier in 2026. USD/INR: ₹{USD_INR}.
        </div>
      </Card>

      <SectionLabel icon="ti-target" sub="High-conviction only — these are where the dashboard recommends actually sizing a trade">Tradable this week ({tradable.length})</SectionLabel>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 12, marginBottom: '1.25rem' }}>
        {tradable.map(c => <CommodityCard key={c.symbol} c={c} />)}
      </div>

      {watchOnly.length > 0 && (
        <>
          <SectionLabel icon="ti-eye" sub="Lower conviction — tracked for context, not recommended for sizing a trade this week">Watch only ({watchOnly.length})</SectionLabel>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 12, opacity: 0.75 }}>
            {watchOnly.map(c => <CommodityCard key={c.symbol} c={c} dimmed />)}
          </div>
        </>
      )}
    </>
  )
}

function CommodityCard({ c }) {
  const ramp = c.trend === 'BEARISH' ? 'red' : c.trend === 'BULLISH' ? 'green' : 'gray'
  return (
    <Card ramp={ramp}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 9 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 30, height: 30, borderRadius: 9, background: RAMPS[ramp][50], display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name={c.icon} size={16} style={{ color: RAMPS[ramp][600] }} />
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
      <div style={{ fontSize: 10.5, color: '#888780', lineHeight: 1.5, display: 'flex', gap: 5, marginBottom: 8 }}>
        <Icon name="ti-shield-exclamation" size={12} style={{ marginTop: 1, flexShrink: 0 }} />
        <span>{c.risks}</span>
      </div>
      {c.tradeIdea && (
        <div style={{ background: '#F7F6F3', borderRadius: 8, padding: '8px 10px', borderLeft: `3px solid ${RAMPS[ramp][600]}` }}>
          <div style={{ fontSize: 11, fontWeight: 500, marginBottom: 4 }}>{c.tradeIdea.strategy}</div>
          <div style={{ fontSize: 10.5, color: '#5F5E5A', marginBottom: 2 }}><Pill text="SELL" ramp="red" /> {c.tradeIdea.sellStrike}</div>
          <div style={{ fontSize: 10.5, color: '#5F5E5A', marginBottom: 4 }}><Pill text="BUY" ramp="green" /> {c.tradeIdea.buyStrike}</div>
          <div style={{ fontSize: 10, color: '#888780', lineHeight: 1.5 }}>{c.tradeIdea.rationale}</div>
        </div>
      )}
    </Card>
  )
}

function NiftyHistory({ stats }) {
  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: '1.1rem' }}>
        <Metric label="Accuracy" value={stats.accuracyPct != null ? `${stats.accuracyPct}%` : '—'} sub={`${stats.correct} of ${stats.total}`} ramp={stats.accuracyPct >= 60 ? 'green' : 'red'} />
        <Metric label="Hits" value={stats.correct} ramp="green" />
        <Metric label="Partial misses" value={stats.partial} sub="right direction, wrong size" ramp="amber" />
        <Metric label="Full misses" value={stats.misses} sub="root cause logged" ramp="red" />
      </div>

      <Card style={{ marginBottom: '1.1rem' }}>
        <SectionLabel icon="ti-table" sub="Direction, range, and trade outcome together — so you can see if the model AND the trade both worked">Daily prediction &amp; trade outcome log</SectionLabel>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #E5E3DC' }}>
                {['Date', 'Predicted', 'Range', 'Actual close', 'Result', 'Trade taken', 'Trade P&L'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '7px 10px', color: '#888780', fontWeight: 500, fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '.03em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...PREDICTION_LOG].reverse().map((r, i) => {
                const isHoliday = r.result === 'holiday'
                const pnl = r.tradeOutcome?.pnl
                return (
                  <tr key={i} style={{ borderBottom: '0.5px solid #F1EFE8', opacity: isHoliday ? 0.55 : 1 }}>
                    <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>{r.date}</td>
                    <td style={{ padding: '8px 10px' }}>{isHoliday ? <span style={{ color: '#B4B2A9' }}>—</span> : <Pill text={r.predicted} ramp={toneRamp(r.predicted)} />}</td>
                    <td style={{ padding: '8px 10px', color: '#888780', whiteSpace: 'nowrap' }}>{r.predictedRange ? `${r.predictedRange[0].toLocaleString()}–${r.predictedRange[1].toLocaleString()}` : '—'}</td>
                    <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>{r.actualClose ? `${r.actualClose.toLocaleString()} (${r.actualChangePct > 0 ? '+' : ''}${r.actualChangePct}%)` : <span style={{ color: '#B4B2A9' }}>market closed</span>}</td>
                    <td style={{ padding: '8px 10px' }}><Pill text={r.result.replace('_', ' ')} ramp={r.result === 'correct' ? 'green' : r.result === 'partial_miss' ? 'amber' : r.result === 'miss' ? 'red' : 'gray'} /></td>
                    <td style={{ padding: '8px 10px', color: '#5F5E5A', maxWidth: 220 }}>{r.tradeOutcome?.recommended || '—'}</td>
                    <td style={{ padding: '8px 10px', fontWeight: 500, color: pnl > 0 ? RAMPS.green[600] : pnl < 0 ? RAMPS.red[600] : '#888780' }}>
                      {pnl != null ? (pnl === 0 ? '₹0' : `${pnl > 0 ? '+' : ''}₹${pnl.toLocaleString()}`) : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Card>

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
        <SectionLabel icon="ti-list-details" sub="Full detail for every miss and partial miss — kept below the table so the table stays scannable">Root cause detail</SectionLabel>
        {PREDICTION_LOG.filter(r => r.rootCause).map((r, i) => (
          <div key={i} style={{ padding: '12px 0', borderBottom: '0.5px solid #F1EFE8' }}>
            <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 4 }}>{r.date}</div>
            <div style={{ background: RAMPS.red[50], borderRadius: 9, padding: '11px 13px' }}>
              <div style={{ fontSize: 12, color: RAMPS.red[800], marginBottom: 6, lineHeight: 1.6 }}>{r.rootCause.summary}</div>
              <div style={{ fontSize: 11.5, color: RAMPS.pink[800], marginBottom: 6, lineHeight: 1.6 }}><strong>Missed driver:</strong> {r.rootCause.driverMissed}</div>
              {r.rootCause.whyEachSignalFailed.map((s, j) => (
                <div key={j} style={{ fontSize: 11, color: '#5F5E5A', marginLeft: 14, marginBottom: 3, lineHeight: 1.5 }}>• <strong>{s.signal}:</strong> {s.issue}</div>
              ))}
              <div style={{ fontSize: 12, color: RAMPS.green[800], background: RAMPS.green[50], borderRadius: 7, padding: '7px 9px', marginTop: 7, lineHeight: 1.55 }}>
                <Icon name="ti-tool" size={13} style={{ marginRight: 4 }} /><strong>Fix applied:</strong> {r.rootCause.fixApplied}
              </div>
            </div>
          </div>
        ))}
      </Card>
    </>
  )
}

function MCXHistory({ mcxStats }) {
  return (
    <>
      <div style={{ background: RAMPS.amber[50], borderRadius: 10, padding: '0.7rem 1rem', marginBottom: '1.1rem', fontSize: 12, color: RAMPS.amber[800], lineHeight: 1.6 }}>
        MCX tracking on this dashboard started 3 trading days ago (26-27 Jun 2026). The numbers below cover that real window only — they do not claim a longer history than actually exists. This will grow day by day, not be backfilled.
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: '1.1rem' }}>
        <Metric label="MCX accuracy (since tracking began)" value={mcxStats.accuracyPct != null ? `${mcxStats.accuracyPct}%` : '—'} sub={`${mcxStats.correct} of ${mcxStats.total}`} ramp={mcxStats.accuracyPct >= 60 ? 'green' : 'red'} />
        <Metric label="Hits" value={mcxStats.correct} ramp="green" />
        <Metric label="Misses" value={mcxStats.misses} sub="root cause below" ramp="red" />
      </div>

      <Card style={{ marginBottom: '1.1rem' }}>
        <SectionLabel icon="ti-table">Backtest — predicted vs achieved levels, by commodity (most recent first)</SectionLabel>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #E5E3DC' }}>
                {['Week of', 'Commodity', 'Predicted', 'Target', 'Achieved', 'Result'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '7px 10px', color: '#888780', fontWeight: 500, fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '.03em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...MCX_BACKTEST].reverse().map((r, i) => (
                <tr key={i} style={{ borderBottom: '0.5px solid #F1EFE8' }}>
                  <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>{r.weekOf}</td>
                  <td style={{ padding: '8px 10px' }}><Pill text={r.symbol} ramp="gray" /></td>
                  <td style={{ padding: '8px 10px' }}><Pill text={r.predictedDirection} ramp={toneRamp(r.predictedDirection)} /></td>
                  <td style={{ padding: '8px 10px', color: '#888780' }}>{r.predictedLevel != null ? `~${r.predictedLevel}` : '—'}</td>
                  <td style={{ padding: '8px 10px', fontWeight: 500 }}>{r.achievedLevel.toLocaleString()}</td>
                  <td style={{ padding: '8px 10px' }}><Pill text={r.result} ramp={r.result === 'correct' ? 'green' : 'red'} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <SectionLabel icon="ti-list-details">Notes &amp; root causes for each row</SectionLabel>
        {[...MCX_BACKTEST].reverse().map((r, i) => (
          <div key={i} style={{ padding: '11px 0', borderBottom: i < MCX_BACKTEST.length - 1 ? '0.5px solid #F1EFE8' : 'none' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <Pill text={r.symbol} ramp="gray" /><span style={{ fontSize: 11, color: '#888780' }}>{r.weekOf}</span>
            </div>
            {r.note && <div style={{ fontSize: 12, color: '#5F5E5A', lineHeight: 1.55, marginBottom: 3 }}>{r.note}</div>}
            {r.dataConfidence && <div style={{ fontSize: 10.5, color: '#888780', fontStyle: 'italic', marginBottom: 4 }}>Data confidence: {r.dataConfidence}</div>}
            {r.rootCause && (
              <div style={{ background: RAMPS.red[50], borderRadius: 9, padding: '10px 12px', marginTop: 4 }}>
                <div style={{ fontSize: 11.5, color: RAMPS.red[800], marginBottom: 5, lineHeight: 1.6 }}>{r.rootCause}</div>
                <div style={{ fontSize: 11.5, color: RAMPS.green[800], background: RAMPS.green[50], borderRadius: 7, padding: '6px 9px', lineHeight: 1.5 }}>
                  <Icon name="ti-tool" size={13} style={{ marginRight: 4 }} /><strong>Fix:</strong> {r.fixNote}
                </div>
              </div>
            )}
          </div>
        ))}
      </Card>
    </>
  )
}

function PatternIntelligence() {
  const maxDtePnl = Math.max(...DTE_PATTERN.map(d => Math.abs(d.pnl)))
  const maxDowPnl = Math.max(...DOW_PATTERN.map(d => Math.abs(d.pnl)))
  const maxStratPnl = Math.max(...STRATEGY_SCORECARD.map(s => Math.abs(s.pnl)))

  return (
    <>
      <Card style={{ marginBottom: '1.1rem', background: `linear-gradient(135deg, ${RAMPS.red[50]}, #fff 70%)` }} ramp="red">
        <SectionLabel icon="ti-microscope" sub={`Source: ${TRADE_HISTORY_META.source} · ${TRADE_HISTORY_META.scope} · analysed ${TRADE_HISTORY_META.analysedOn}`}>
          The single most important finding in your trading history
        </SectionLabel>
        <div style={{ fontSize: 14, color: RAMPS.red[800], lineHeight: 1.7, marginBottom: 10 }}>{BIG_LOSS_FINGERPRINT.summary}</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
          <Metric label="Trades over ₹30k loss" value={BIG_LOSS_FINGERPRINT.count} ramp="red" />
          <Metric label="Total damage" value={`₹${(BIG_LOSS_FINGERPRINT.totalDamage / 100000).toFixed(2)}L`} ramp="red" />
          <Metric label="Were Iron Condor-style" value={`${BIG_LOSS_FINGERPRINT.ironCondorCount}/${BIG_LOSS_FINGERPRINT.count}`} ramp="amber" />
          <Metric label="Were DTE 0-1" value={`${BIG_LOSS_FINGERPRINT.dte0or1Count}/${BIG_LOSS_FINGERPRINT.count}`} ramp="amber" />
        </div>
      </Card>

      <SectionLabel icon="ti-shield-check" sub="Every rule below traces to a specific number in this tab — none are asserted without evidence">Hard rules the trade engine now enforces</SectionLabel>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 10, marginBottom: '1.1rem' }}>
        {HARD_RULES.map(r => (
          <Card key={r.id} ramp={r.severity === 'critical' ? 'red' : r.severity === 'high' ? 'amber' : 'blue'}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 6 }}>
              <Pill text={r.severity} ramp={r.severity === 'critical' ? 'red' : r.severity === 'high' ? 'amber' : 'blue'} />
            </div>
            <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 5, lineHeight: 1.4 }}>{r.rule}</div>
            <div style={{ fontSize: 11.5, color: '#5F5E5A', lineHeight: 1.55 }}>{r.evidence}</div>
          </Card>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: '1.1rem' }}>
        <Card>
          <SectionLabel icon="ti-calendar-time" sub="All strategies combined, NIFTY only">Win rate &amp; P&amp;L by days-to-expiry at entry</SectionLabel>
          {DTE_PATTERN.map(d => {
            const pos = d.pnl >= 0
            const pct = Math.abs(d.pnl) / maxDtePnl * 100
            return (
              <div key={d.dte} style={{ marginBottom: 9 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}>
                  <span style={{ fontWeight: 500 }}>DTE {d.dte} <span style={{ color: '#888780', fontWeight: 400 }}>({d.trades} trades, {d.winRatePct}% win)</span></span>
                  <strong style={{ color: pos ? RAMPS.green[600] : RAMPS.red[600] }}>{pos ? '+' : ''}₹{(d.pnl / 1000).toFixed(0)}k</strong>
                </div>
                <div style={{ height: 7, background: '#F1EFE8', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{ width: `${pct}%`, height: 7, background: pos ? RAMPS.green[600] : RAMPS.red[600], borderRadius: 4 }} />
                </div>
                <div style={{ fontSize: 10.5, color: '#888780', marginTop: 2 }}>{d.note}</div>
              </div>
            )
          })}
        </Card>

        <Card>
          <SectionLabel icon="ti-calendar-week" sub="All strategies combined, NIFTY only">Win rate &amp; P&amp;L by day of week entered</SectionLabel>
          {DOW_PATTERN.map(d => {
            const pos = d.pnl >= 0
            const pct = Math.abs(d.pnl) / maxDowPnl * 100
            return (
              <div key={d.day} style={{ marginBottom: 9 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}>
                  <span style={{ fontWeight: 500 }}>{d.day} <span style={{ color: '#888780', fontWeight: 400 }}>({d.trades} trades, {d.winRatePct}% win)</span></span>
                  <strong style={{ color: pos ? RAMPS.green[600] : RAMPS.red[600] }}>{pos ? '+' : ''}₹{(d.pnl / 1000).toFixed(0)}k</strong>
                </div>
                <div style={{ height: 7, background: '#F1EFE8', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{ width: `${pct}%`, height: 7, background: pos ? RAMPS.green[600] : RAMPS.red[600], borderRadius: 4 }} />
                </div>
              </div>
            )
          })}
        </Card>
      </div>

      <Card style={{ marginBottom: '1.1rem' }}>
        <SectionLabel icon="ti-chart-bar" sub="Every structure you actually used in 14 months, NIFTY only — sell-side structures (green) dominate, buy-side structures (red) lost 100% of the time">Strategy scorecard</SectionLabel>
        {STRATEGY_SCORECARD.map(s => {
          const pos = s.pnl >= 0
          const pct = Math.abs(s.pnl) / maxStratPnl * 100
          return (
            <div key={s.strategy} style={{ marginBottom: 9 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}>
                <span style={{ fontWeight: 500 }}>
                  {s.strategy} <Pill text={s.type} ramp={s.type === 'sell' ? 'green' : s.type === 'buy' ? 'red' : 'gray'} />
                  <span style={{ color: '#888780', fontWeight: 400 }}> ({s.trades} trades, {s.winRatePct}% win)</span>
                </span>
                <strong style={{ color: pos ? RAMPS.green[600] : RAMPS.red[600] }}>{pos ? '+' : ''}₹{(s.pnl / 1000).toFixed(0)}k</strong>
              </div>
              <div style={{ height: 7, background: '#F1EFE8', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{ width: `${pct}%`, height: 7, background: pos ? RAMPS.green[600] : RAMPS.red[600], borderRadius: 4 }} />
              </div>
            </div>
          )
        })}
      </Card>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: '1.1rem' }}>
        <Card ramp="red">
          <SectionLabel icon="ti-trending-down" sub="The exact trades that drove the loss column above">Top losses</SectionLabel>
          {TOP_LOSSES.slice(0, 6).map((t, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, padding: '5px 0', borderBottom: i < 5 ? '0.5px solid #F1EFE8' : 'none' }}>
              <span style={{ color: '#5F5E5A' }}>{t.date} · DTE {t.dte} · {t.strategy.replace(/_/g, ' ')}</span>
              <strong style={{ color: RAMPS.red[600] }}>₹{(t.pnl / 1000).toFixed(0)}k</strong>
            </div>
          ))}
        </Card>
        <Card ramp="green">
          <SectionLabel icon="ti-trending-up" sub="The exact trades that drove the win column above">Top wins</SectionLabel>
          {TOP_WINS.slice(0, 6).map((t, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, padding: '5px 0', borderBottom: i < 4 ? '0.5px solid #F1EFE8' : 'none' }}>
              <span style={{ color: '#5F5E5A' }}>{t.date} · DTE {t.dte} · {t.strategy.replace(/_/g, ' ')}</span>
              <strong style={{ color: RAMPS.green[600] }}>+₹{(t.pnl / 1000).toFixed(0)}k</strong>
            </div>
          ))}
        </Card>
      </div>

      <Card style={{ marginBottom: '1.1rem' }}>
        <SectionLabel icon="ti-receipt-rupee" sub="Average entry premium per trade combo, NIFTY only">Premium zone — where you actually make money</SectionLabel>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
          {PREMIUM_ZONE_PATTERN.map(p => (
            <div key={p.zone} style={{ background: p.verdict === 'sweet-spot' ? RAMPS.green[50] : p.verdict === 'avoid' ? RAMPS.red[50] : RAMPS.gray[50], borderRadius: 9, padding: '10px 11px', textAlign: 'center' }}>
              <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 4 }}>{p.zone}</div>
              <div style={{ fontSize: 11, color: '#888780' }}>{p.trades} trades</div>
              <div style={{ fontSize: 13, fontWeight: 500, marginTop: 4, color: p.pnl >= 0 ? RAMPS.green[600] : RAMPS.red[600] }}>{p.winRatePct}% win</div>
              <div style={{ fontSize: 11.5, color: p.pnl >= 0 ? RAMPS.green[600] : RAMPS.red[600] }}>{p.pnl >= 0 ? '+' : ''}₹{(p.pnl / 1000).toFixed(0)}k</div>
            </div>
          ))}
        </div>
      </Card>

      <Card style={{ marginBottom: '1.1rem' }} ramp="blue">
        <SectionLabel icon="ti-ruler-2">Bull Put Spread width finding</SectionLabel>
        <div style={{ fontSize: 13, color: RAMPS.blue[800], lineHeight: 1.7, marginBottom: 4 }}>{BULL_PUT_SPREAD_WIDTH_PATTERN.finding}</div>
        <div style={{ fontSize: 12, color: RAMPS.blue[600], fontWeight: 500 }}>{BULL_PUT_SPREAD_WIDTH_PATTERN.recommendation}</div>
      </Card>

      <Card>
        <SectionLabel icon="ti-calendar" sub="Monthly win rate and P&L across the full 14-month history">Monthly trend</SectionLabel>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #E5E3DC' }}>
                {['Month', 'Trades', 'Win %', 'P&L'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '6px 10px', color: '#888780', fontWeight: 500, fontSize: 10.5, textTransform: 'uppercase' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {MONTHLY_TREND.map(m => (
                <tr key={m.month} style={{ borderBottom: '0.5px solid #F1EFE8' }}>
                  <td style={{ padding: '6px 10px' }}>{m.month}</td>
                  <td style={{ padding: '6px 10px', color: '#888780' }}>{m.trades}</td>
                  <td style={{ padding: '6px 10px' }}>{m.winRatePct}%</td>
                  <td style={{ padding: '6px 10px', fontWeight: 500, color: m.pnl >= 0 ? RAMPS.green[600] : RAMPS.red[600] }}>{m.pnl >= 0 ? '+' : ''}₹{m.pnl.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  )
}

function Playbook() {
  const items = [
    {
      icon: 'ti-target-arrow', ramp: 'green', title: 'Win-size vs loss-size, not win-rate, decides monthly P&L — and the engine no longer recommends debit spreads to chase it',
      body: 'A system that wins 40% of the time but wins 3x its average loss is more profitable than one that wins 70% of the time at 1:1. An earlier version of this dashboard tried to solve this with debit spreads (buying premium outright) — but the user\'s own 14-month trade history shows every buy-side structure they ever attempted lost 100% of the time across 8 trades. That contradiction has been fixed: debit spreads were removed entirely from the engine. The sell-side ratio spread (sell 1, buy 2 further out) is now the structure used when a profit-can-exceed-loss shape is wanted, because it keeps the position a net seller of premium throughout.',
    },
    {
      icon: 'ti-database', ramp: 'red', title: 'Data sources — what is genuinely live, and what is not',
      body: 'Be precise about this rather than implying more freshness than exists: NIFTY close, India VIX, and the option chain pull live from NSE\'s public endpoints when reachable (lib/nse.js) — this is the one genuinely live, auto-refreshing source. FII/DII figures, GIFT Nifty, global indices, crude oil, and all News & Catalyst Watch items are manually researched and verified against 2+ independent sources at the time they are added, then held as static fallback values until a future session refreshes them — they are not pulled from a live feed automatically. This dashboard does not have a paid multi-vendor data subscription; treat every non-NSE number as "verified as of its stated date," not "live right now," and re-verify anything market-moving before sizing a real trade on it.',
    },
    {
      icon: 'ti-calendar-time', ramp: 'amber', title: 'Holding longer has outperformed holding short in your own data',
      body: 'DTE 4-5 entries: 89-100% win rate. DTE 0-1 entries: 25-43% win rate. This is now reflected directly in the forecast structure — three horizons (next session, next expiry, next week) instead of one — rather than buried in a backtest table you have to go find separately.',
    },
    {
      icon: 'ti-fingerprint', ramp: 'purple', title: 'The evidence chain is real option-chain literacy, not invented pattern-matching',
      body: 'The four OI-buildup patterns (long buildup, short buildup, short covering, long unwinding) used here are standard, published techniques — sourced this session from PL Capital, AlgoTest, and NiftyTrader educational material, not proprietary. Every professional source reviewed gives the same caution: OI alone can reflect hedging, not conviction, and must be combined with price and volume. The dashboard\'s evidence chain follows that same caution — it states a source for every dot, and does not claim to see live order-book depth, which would require a paid data feed this system does not have.',
    },
    {
      icon: 'ti-droplet', ramp: 'coral', title: 'Track commodity and FX correlation as leading indicators, not just confirming ones',
      body: "Brent crude and USD/INR both move NIFTY with a short lag through import costs, inflation expectations, and FII flows. The MCX tab exists specifically so a crude or gold move can be read as an early signal for NIFTY the next session, not just analysed in isolation. The 24 Jun miss happened precisely because crude's move was real and visible but not yet wired into the NIFTY score at the time.",
    },
    {
      icon: 'ti-filter', ramp: 'blue', title: 'Trade only where conviction is high — skip the rest, deliberately',
      body: 'The MCX tab now splits commodities into tradable (HIGH conviction) and watch only (everything else) instead of presenting all five as equally actionable. The same discipline applies to NIFTY: when the score sits inside ±30, the dashboard recommends no trade, not a low-conviction one. Sitting out is a valid, recorded outcome.',
    },
    {
      icon: 'ti-stack-2', ramp: 'gray', title: 'Keep the model auditable — every factor traces to a real miss or a real source',
      body: 'Every factor currently in the model was added because of a specific, named, dated prediction failure with a documented root cause, or because of a feature request that exposed a real structural gap (like the credit-spread ratio issue fixed in v5). The model grows only when it has actually been wrong or incomplete in a way the new factor addresses, not speculatively.',
    },
  ]

  return (
    <>
      <Card style={{ marginBottom: '1.1rem', background: `linear-gradient(135deg, ${RAMPS.blue[50]}, #fff 70%)` }} ramp="blue">
        <SectionLabel icon="ti-bulb">What this system needs to keep improving</SectionLabel>
        <div style={{ fontSize: 13, color: RAMPS.blue[800], lineHeight: 1.7 }}>
          Structural notes for building a system that compounds small edges reliably, rather than chasing a single perfect prediction.
        </div>
      </Card>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 12 }}>
        {items.map((it, i) => (
          <Card key={i} ramp={it.ramp}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 8 }}>
              <span style={{ width: 30, height: 30, borderRadius: 9, background: RAMPS[it.ramp][50], display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon name={it.icon} size={16} style={{ color: RAMPS[it.ramp][600] }} />
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

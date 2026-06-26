// lib/nse.js
//
// Fetches from NSE India's public, unauthenticated JSON endpoints.
// These are the same endpoints nseindia.com's own frontend calls — no
// broker account, no API key, no payment. They are NOT an official
// documented API: NSE can change them without notice, and they rate-limit
// aggressively (roughly 3-4 requests/minute per IP before a 403/CAPTCHA).
//
// Because of that, every function here:
//   1. Does the cookie handshake NSE requires (hit the homepage first)
//   2. Sets browser-like headers
//   3. Fails LOUDLY with a clear error rather than returning fabricated data
//   4. Should be called sparingly — cache the result, don't poll

const BASE = 'https://www.nseindia.com'

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Referer': 'https://www.nseindia.com/option-chain',
}

async function getSessionCookies() {
  const res = await fetch(BASE, { headers: BROWSER_HEADERS })
  const cookie = res.headers.get('set-cookie')
  if (!cookie) {
    throw new Error('NSE did not return session cookies — they may have changed their anti-bot setup. This function needs updating, not retrying blindly.')
  }
  return cookie
}

async function nseGet(path) {
  const cookie = await getSessionCookies()
  const res = await fetch(`${BASE}${path}`, {
    headers: { ...BROWSER_HEADERS, Cookie: cookie },
  })
  if (!res.ok) {
    throw new Error(`NSE returned ${res.status} for ${path}. Likely rate-limited (their stated tolerance is ~3-4 req/min/IP) or the endpoint moved. Do not retry in a tight loop.`)
  }
  const text = await res.text()
  try {
    return JSON.parse(text)
  } catch {
    throw new Error(`NSE returned non-JSON for ${path} — almost always means a CAPTCHA/block page came back instead of data.`)
  }
}

// Option chain for an index: NIFTY, BANKNIFTY, FINNIFTY
export async function getOptionChain(symbol = 'NIFTY') {
  const data = await nseGet(`/api/option-chain-indices?symbol=${symbol}`)
  const records = data?.records
  if (!records) throw new Error('Unexpected option chain shape from NSE — schema may have changed.')

  const nearestExpiry = records.expiryDates?.[0]
  const rows = (records.data || []).filter(r => r.expiryDate === nearestExpiry)

  const strikes = rows.map(r => ({
    strike: r.strikePrice,
    callOI: r.CE?.openInterest ?? null,
    callLTP: r.CE?.lastPrice ?? null,
    callIV: r.CE?.impliedVolatility ?? null,
    putOI: r.PE?.openInterest ?? null,
    putLTP: r.PE?.lastPrice ?? null,
    putIV: r.PE?.impliedVolatility ?? null,
  })).sort((a, b) => a.strike - b.strike)

  const totalCallOI = strikes.reduce((s, r) => s + (r.callOI || 0), 0)
  const totalPutOI = strikes.reduce((s, r) => s + (r.putOI || 0), 0)
  const pcr = totalCallOI > 0 ? +(totalPutOI / totalCallOI).toFixed(2) : null

  return {
    symbol,
    underlyingValue: records.underlyingValue,
    expiry: nearestExpiry,
    strikes,
    pcr,
    totalCallOI,
    totalPutOI,
    fetchedAt: new Date().toISOString(),
  }
}

// India VIX — current value comes bundled in the option chain underlying
// data for some symbols; for a dedicated VIX read, NSE's indices snapshot
// endpoint is used instead.
export async function getIndiaVIX() {
  const data = await nseGet('/api/allIndices')
  const row = (data?.data || []).find(r => r.index === 'INDIA VIX')
  if (!row) throw new Error('INDIA VIX not found in NSE allIndices response — schema may have changed.')
  return {
    value: row.last,
    change: row.variation,
    changePct: row.percentChange,
    fetchedAt: new Date().toISOString(),
  }
}

// NIFTY 50 index snapshot (last, change, etc.)
export async function getNifty50() {
  const data = await nseGet('/api/allIndices')
  const row = (data?.data || []).find(r => r.index === 'NIFTY 50')
  if (!row) throw new Error('NIFTY 50 not found in NSE allIndices response.')
  return {
    last: row.last,
    change: row.variation,
    changePct: row.percentChange,
    open: row.open,
    high: row.dayHigh,
    low: row.dayLow,
    previousClose: row.previousClose,
    fetchedAt: new Date().toISOString(),
  }
}

// FII/DII net flow — NSE does not expose this on the same domain in JSON;
// it's published as a daily report by NSE/SEBI. This is the one data point
// in the whole system that genuinely has no clean public JSON endpoint as
// of this writing. Documented honestly rather than faked:
export async function getFiiDiiFlow() {
  throw new Error(
    'No public, unauthenticated JSON endpoint for FII/DII flow is known to exist. ' +
    'NSE/SEBI publish this as a daily bhavcopy-style report (HTML/PDF), not JSON. ' +
    'Workaround: scrape https://www.nseindia.com/all-reports (FII/DII section) and ' +
    'parse the report file manually, or enter the day\'s number by hand from ' +
    'nseindia.com / moneycontrol\'s FII-DII page each morning. Left as a manual ' +
    'input in the dashboard rather than silently guessed.'
  )
}

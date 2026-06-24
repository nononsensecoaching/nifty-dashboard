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

export async function getOptionChain(symbol = 'NIFTY') {
  const data = await nseGet(`/api/option-chain-indices?symbol=${symbol}`)
  const records = data?.records
  if (!records) throw new Error('Unexpected option chain shape from NSE — schema may have changed.')
  const nearestExpiry = records.expiryDates?.[0]
  const rows = (records.data || []).filter(r => r.expiryDate === nearestExpiry)
  const strikes = rows.map(r => ({ strike: r.strikePrice, callOI: r.CE?.openInterest ?? null, callLTP: r.CE?.lastPrice ?? null, callIV: r.CE?.impliedVolatility ?? null, putOI: r.PE?.openInterest ?? null, putLTP: r.PE?.lastPrice ?? null, putIV: r.PE?.impliedVolatility ?? null })).sort((a, b) => a.strike - b.strike)
  const totalCallOI = strikes.reduce((s, r) => s + (r.callOI || 0), 0)
  const totalPutOI = strikes.reduce((s, r) => s + (r.putOI || 0), 0)
  const pcr = totalCallOI > 0 ? +(totalPutOI / totalCallOI).toFixed(2) : null
  return { symbol, underlyingValue: records.underlyingValue, expiry: nearestExpiry, strikes, pcr, totalCallOI, totalPutOI, fetchedAt: new Date().toISOString() }
}
export async function getIndiaVIX() {
  const data = await nseGet('/api/allIndices')
  const row = (data?.data || []).find(r => r.index === 'INDIA VIX')
  if (!row) throw new Error('INDIA VIX not found in NSE allIndices response.')
  return { value: row.last, change: row.variation, changePct: row.percentChange, fetchedAt: new Date().toISOString() }
}
export async function getNifty50() {
  const data = await nseGet('/api/allIndices')
  const row = (data?.data || []).find(r => r.index === 'NIFTY 50')
  if (!row) throw new Error('NIFTY 50 not found in NSE allIndices response.')
  return { last: row.last, change: row.variation, changePct: row.percentChange, open: row.open, high: row.dayHigh, low: row.dayLow, previousClose: row.previousClose, fetchedAt: new Date().toISOString() }
}
export async function getFiiDiiFlow() { throw new Error('No public JSON endpoint for FII/DII flow.') }

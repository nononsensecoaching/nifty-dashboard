// middleware.js
//
// Site-wide password protection, added 28 Jun 2026 per explicit request:
// "Check whether the site access can be restricted only to me... so that
// public is not able to access our data and logics."
//
// Vercel's own Password Protection feature requires either the Enterprise
// plan or a $150/month Advanced Deployment Protection add-on on Pro —
// confirmed via Vercel's own docs (vercel.com/docs/deployment-protection),
// not assumed. That is not proportionate for a personal dashboard, so this
// uses HTTP Basic Auth implemented directly in Next.js Middleware instead —
// free on every plan including Hobby, runs at the edge before any page or
// API route executes, and requires no third-party package.
//
// HOW TO SET YOUR PASSWORD (do this in Vercel, not in this file):
// 1. Vercel dashboard -> your project -> Settings -> Environment Variables
// 2. Add a variable named SITE_PASSWORD with whatever password you want
// 3. Add a variable named SITE_USERNAME (e.g. "mithun") — optional, defaults below
// 4. Redeploy
// Never hardcode the real password in this file or commit it to GitHub —
// environment variables are the correct place for it.
//
// HONEST RESIDUAL EXPOSURE: /api/* routes are deliberately excluded from
// this password check (see below) so Vercel's cron jobs keep working.
// This means /api/live-snapshot is reachable without a password — but it
// only re-serves NSE's OWN already-public data (NIFTY price, VIX, option
// chain), not anything proprietary. Your actual trade history, hard
// rules, and strategy logic live in lib/ and are never served as raw
// JSON by any API route — they only render through the password-protected
// page itself. If this residual gap matters for your threat model, the
// fix is adding a separate shared-secret header check inside each /api
// route rather than relying on this page-level middleware — ask if you
// want that built.

export function middleware(request) {
  // Cron-triggered API routes must stay reachable WITHOUT Basic Auth —
  // Vercel's cron caller does not send these credentials, and those
  // routes already have their own check (x-vercel-cron header) in
  // pages/api/daily-run.js and pages/api/verify-forecast.js. Blocking
  // /api/* here would silently break the 3:15 PM and Monday 10 AM
  // automation this dashboard depends on.
  if (request.nextUrl.pathname.startsWith('/api/')) {
    return undefined
  }

  const basicAuth = request.headers.get('authorization')

  const expectedUser = process.env.SITE_USERNAME || 'admin'
  const expectedPass = process.env.SITE_PASSWORD

  // Safety: if SITE_PASSWORD was never set in Vercel, FAIL OPEN with a
  // visible warning in the response rather than silently locking out the
  // owner or silently leaving the site unprotected without telling anyone.
  if (!expectedPass) {
    return new Response(
      'Site password not configured. Set SITE_PASSWORD in Vercel project environment variables, then redeploy. The site is currently NOT password protected.',
      { status: 200 }
    )
  }

  if (basicAuth) {
    const authValue = basicAuth.split(' ')[1]
    const [user, pass] = Buffer.from(authValue, 'base64').toString().split(':')
    if (user === expectedUser && pass === expectedPass) {
      return undefined // allow the request through
    }
  }

  return new Response('Authentication required.', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="NIFTY Dashboard"' },
  })
}

export const config = {
  matcher: '/((?!_next/static|_next/image|favicon.ico).*)',
}

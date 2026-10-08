import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Cache-Control': 'no-store',
}
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const WINDOW_MS = 60_000
const MAX_LOOKUPS_PER_WINDOW = 8
const requestWindows = new Map<string, { startedAt: number; count: number }>()

function respond(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function isWithinRateLimit(request: Request) {
  const forwardedFor = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  const ip = request.headers.get('cf-connecting-ip') || forwardedFor || request.headers.get('x-real-ip') || 'unknown'
  const now = Date.now()
  if (requestWindows.size > 1000) {
    for (const [key, window] of requestWindows) {
      if (now - window.startedAt >= WINDOW_MS) requestWindows.delete(key)
    }
  }
  const current = requestWindows.get(ip)
  if (!current || now - current.startedAt >= WINDOW_MS) {
    requestWindows.set(ip, { startedAt: now, count: 1 })
    return true
  }
  if (current.count >= MAX_LOOKUPS_PER_WINDOW) return false
  current.count += 1
  return true
}

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return respond({ error: 'Method not allowed.' }, 405)
  if (!isWithinRateLimit(request)) return respond({ error: 'Too many attempts. Please try again shortly.' }, 429)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !anonKey || !serviceRoleKey) return respond({ error: 'Account lookup is unavailable.' }, 503)
  if (request.headers.get('apikey') !== anonKey) return respond({ error: 'Unauthorized.' }, 401)

  try {
    const body = await request.json()
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
    if (email.length > 254 || !EMAIL_PATTERN.test(email)) return respond({ error: 'A valid email address is required.' }, 400)

    const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { data, error } = await serviceClient.from('profiles')
      .select('id')
      .eq('email', email)
      .maybeSingle()
    if (error) throw error

    return respond({ exists: Boolean(data) })
  } catch (cause) {
    console.error('check-email-account failed:', cause?.message || cause)
    return respond({ error: 'Account lookup is unavailable.' }, 503)
  }
})

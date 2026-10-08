import { supabase } from '../lib/supabase'

export async function checkEmailAccountExists(email) {
  if (!supabase) throw new Error('Supabase is not configured.')
  const { data, error } = await supabase.functions.invoke('check-email-account', {
    body: { email },
  })
  if (error) throw error
  if (typeof data?.exists !== 'boolean') throw new Error('Account lookup returned an invalid response.')
  return data.exists
}

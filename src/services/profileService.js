import { supabase } from '../lib/supabase'

export const AVATAR_MAX_BYTES = 5 * 1024 * 1024
export const AVATAR_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const PROFILE_FIELDS = ['username', 'full_name', 'avatar_url', 'is_library_public']

function requireClient() {
  if (!supabase) throw new Error('Supabase is not configured.')
  return supabase
}

export async function getProfile(userId) {
  const client = requireClient()
  const { data, error } = await client.from('profiles')
    .select('id,email,username,full_name,avatar_url,role,is_library_public,created_at,updated_at')
    .eq('id', userId)
    .maybeSingle()
  if (error) throw error
  return data
}

export async function updateProfile(userId, changes) {
  const client = requireClient()
  const values = Object.fromEntries(Object.entries(changes).filter(([key]) => PROFILE_FIELDS.includes(key)))
  const { data, error } = await client.from('profiles').update(values).eq('id', userId)
    .select('id,email,username,full_name,avatar_url,role,is_library_public,created_at,updated_at').single()
  if (error) throw error
  return data
}

export function validateAvatar(file) {
  if (!file) return 'Choose an image to upload.'
  if (!AVATAR_TYPES.includes(file.type)) return 'Use a JPG, PNG, or WEBP image.'
  if (file.size > AVATAR_MAX_BYTES) return 'Avatar images must be 5 MB or smaller.'
  return null
}

export async function uploadAvatar(userId, file) {
  const client = requireClient()
  const validationError = validateAvatar(file)
  if (validationError) throw new Error(validationError)
  const extension = file.type === 'image/jpeg' ? 'jpg' : file.type.split('/')[1]
  const path = `${userId}/${crypto.randomUUID()}.${extension}`
  const { error } = await client.storage.from('avatars').upload(path, file, {
    cacheControl: '3600',
    contentType: file.type,
    upsert: false,
  })
  if (error) throw error
  const { data } = client.storage.from('avatars').getPublicUrl(path)
  return { path, url: data.publicUrl }
}

export async function removeAvatar(path) {
  if (!path) return
  const { error } = await requireClient().storage.from('avatars').remove([path])
  if (error) throw error
}

export function avatarPathFromUrl(url, userId) {
  if (!url) return null
  try {
    const pathname = new URL(url).pathname
    const marker = '/storage/v1/object/public/avatars/'
    const index = pathname.indexOf(marker)
    if (index < 0) return null
    const path = decodeURIComponent(pathname.slice(index + marker.length))
    return path.startsWith(`${userId}/`) ? path : null
  } catch {
    return null
  }
}

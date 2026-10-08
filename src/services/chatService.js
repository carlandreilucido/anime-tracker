import { supabase } from '../lib/supabase'
import { normalizeAssistantMessage } from '../../supabase/functions/anime-assistant/chatResponse.mjs'

function client() {
  if (!supabase) throw new Error('Connect Supabase before opening the anime assistant.')
  return supabase
}

function readableChatError(error) {
  const status = error?.context?.status
  if (status === 401) return 'Your session expired. Please sign in again.'
  if (status === 429) return 'You’ve reached the assistant’s message limit. Please wait a minute and try again.'
  if (status === 404) return 'This conversation is no longer available.'
  return 'The anime assistant could not respond just now. Please try again.'
}

function readableDataError(error, operation) {
  if (error?.code === 'PGRST301' || /jwt expired|invalid jwt/i.test(error?.message || '')) return new Error('Your session expired. Please sign in again.')
  if (error?.code === '42P01' || error?.code === 'PGRST205') return new Error('Chat history is not set up yet. Apply the AI assistant database migration first.')
  return new Error(`Could not ${operation}. Please retry.`)
}

export async function listChatConversations(offset = 0, limit = 30) {
  const { data, error, count } = await client().from('ai_chat_conversations')
    .select('id,title,created_at,updated_at', { count: 'exact' })
    .order('updated_at', { ascending: false })
    .range(offset, offset + limit - 1)
  if (error) throw readableDataError(error, 'load chat history')
  const items = data || []
  return { items, hasMore: offset + items.length < (count || 0) }
}

export async function createChatConversation(title = 'New conversation') {
  const { data, error } = await client().from('ai_chat_conversations')
    .insert({ title: title.slice(0, 120) || 'New conversation' })
    .select('id,title,created_at,updated_at')
    .single()
  if (error) throw readableDataError(error, 'start a conversation')
  return data
}

export async function deleteChatConversation(conversationId) {
  const { error } = await client().from('ai_chat_conversations').delete().eq('id', conversationId)
  if (error) throw readableDataError(error, 'delete this conversation')
}

export async function getChatMessages(conversationId, limit = 50, before = null) {
  let query = client().from('ai_chat_messages')
    .select('id,role,content,metadata,client_request_id,created_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (before) query = query.lt('created_at', before)
  const { data, error } = await query
  if (error) throw readableDataError(error, 'load chat messages')
  return (data || []).reverse().map(normalizeAssistantMessage)
}

export async function sendChatMessage(conversationId, message, requestId = crypto.randomUUID()) {
  const { data, error } = await client().functions.invoke('anime-assistant', {
    body: { conversation_id: conversationId, request_id: requestId, message },
  })
  if (error) {
    let serverMessage = ''
    try { serverMessage = (await error.context?.json())?.error || '' } catch { /* Use a friendly fallback. */ }
    const friendly = readableChatError(error)
    throw Object.assign(new Error(serverMessage && error.context?.status !== 500 ? serverMessage : friendly), { requestId, status: error.context?.status })
  }
  if (!data?.assistant_message || !data?.user_message) throw new Error('The assistant returned an incomplete response. Please retry.')
  return { ...data, assistant_message: normalizeAssistantMessage(data.assistant_message) }
}

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { normalizeUserSearchTerm } from './userSearch.js'

test('user search accepts username queries with or without a leading @', () => {
  const variants = [
    'jessica',
    '@jessica',
    'jessicaresaba7',
    '@jessicaresaba7',
    '@jessicaresaba7_ceb9fedb',
  ]
  assert.deepEqual(variants.map(normalizeUserSearchTerm), [
    'jessica',
    'jessica',
    'jessicaresaba7',
    'jessicaresaba7',
    'jessicaresaba7_ceb9fedb',
  ])
})

test('user search trims whitespace, removes only one @, and ignores a bare @', () => {
  assert.equal(normalizeUserSearchTerm('  @Jessica  '), 'Jessica')
  assert.equal(normalizeUserSearchTerm('@@jessica'), '@jessica')
  assert.equal(normalizeUserSearchTerm('@'), '')
  assert.equal(normalizeUserSearchTerm('   '), '')
  assert.equal(normalizeUserSearchTerm('@  '), '')
})

test('the Supabase search RPC uses safe case-insensitive substring matching on both profile fields', async () => {
  const migration = await readFile(new URL('../../supabase/migrations/202610110002_user_search_at_prefix.sql', import.meta.url), 'utf8')
  assert.match(migration, /username ilike q\.partial_pattern escape/)
  assert.match(migration, /full_name ilike q\.partial_pattern escape/)
  assert.match(migration, /replace\(replace\(replace\(value, E'\\\\'/)
  assert.match(migration, /pg_catalog\.length\(q\.value\) >= 2/)
})

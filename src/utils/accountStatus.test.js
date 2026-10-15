import test from 'node:test'
import assert from 'node:assert/strict'
import { hasVerifiedEmail, verificationStatusLabel } from './accountStatus.js'

test('email verification gate requires Supabase email_confirmed_at for email accounts', () => {
  assert.equal(hasVerifiedEmail({ email: 'pending@example.com', email_confirmed_at: null }), false)
  assert.equal(hasVerifiedEmail({ email: 'verified@example.com', email_confirmed_at: '2026-10-16T12:00:00Z' }), true)
  assert.equal(hasVerifiedEmail({}), true)
})

test('admin account states have explicit labels and unknown states are not presented as verified', () => {
  assert.equal(verificationStatusLabel('verified'), 'Verified')
  assert.equal(verificationStatusLabel('pending_verification'), 'Pending Verification')
  assert.equal(verificationStatusLabel('disabled'), 'Disabled')
  assert.equal(verificationStatusLabel('unexpected'), 'Unknown')
})

import test from 'node:test'
import assert from 'node:assert/strict'
import { getInstallPlatform, isRunningStandalone } from './pwa.js'

test('standalone detection follows display mode and iOS standalone mode only', () => {
  assert.equal(isRunningStandalone({ matchMedia: () => ({ matches: true }), navigator: {} }), true)
  assert.equal(isRunningStandalone({ matchMedia: () => ({ matches: false }), navigator: { standalone: true } }), true)
  assert.equal(isRunningStandalone({ matchMedia: () => ({ matches: false }), navigator: { standalone: false } }), false)
  assert.equal(isRunningStandalone({ matchMedia: () => ({ matches: false }), navigator: {} }), false)
})

test('install platform detection covers iOS, iPadOS, Android, and other browsers', () => {
  assert.equal(getInstallPlatform({ userAgent: 'Mozilla/5.0 (iPhone)' }), 'ios')
  assert.equal(getInstallPlatform({ platform: 'MacIntel', maxTouchPoints: 5 }), 'ios')
  assert.equal(getInstallPlatform({ userAgent: 'Mozilla/5.0 (Linux; Android 15)' }), 'android')
  assert.equal(getInstallPlatform({ userAgent: 'Mozilla/5.0 (Windows NT 10.0)' }), 'other')
})

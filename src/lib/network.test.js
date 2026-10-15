import test from 'node:test'
import assert from 'node:assert/strict'
import { authErrorMessage, classifyNetworkError } from './network.js'

test('network failures are distinguished from incorrect credentials', () => {
  assert.equal(classifyNetworkError(new TypeError('Failed to fetch'), true), 'interrupted')
  assert.equal(classifyNetworkError(new Error('request failed'), false), 'offline')
  assert.equal(classifyNetworkError({ status: 504 }), 'timeout')
  assert.equal(classifyNetworkError({ status: 503 }), 'server')
  assert.equal(classifyNetworkError({ status: 401, code: 'invalid_credentials' }), 'auth')
  assert.equal(authErrorMessage({ code: 'invalid_credentials', message: 'Invalid login credentials' }), 'Invalid email or password. Please try again.')
  assert.equal(authErrorMessage(new TypeError('Failed to fetch')), 'Unable to connect. Please check your internet connection and try again.')
  assert.equal(authErrorMessage({ status: 503 }), 'Unable to connect to the server. Please check your connection and try again.')
  assert.equal(authErrorMessage({ status: 429 }), 'Too many attempts. Please wait before trying again.')
})

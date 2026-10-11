import test from 'node:test'
import assert from 'node:assert/strict'
import { createSerialQueue } from './serialQueue.js'

test('serial queue applies rapid episode increments in order without losing writes', async () => {
  const enqueue = createSerialQueue()
  let storedEpisode = 5
  const saves = [1, 1, 1, 1].map(increment => enqueue(async () => {
    const current = storedEpisode
    await Promise.resolve()
    storedEpisode = current + increment
  }))
  await Promise.all(saves)
  assert.equal(storedEpisode, 9)
})

test('serial queue continues later saves after an earlier failure', async () => {
  const enqueue = createSerialQueue()
  const order = []
  const rejected = enqueue(async () => { order.push('failed'); throw new Error('offline') })
  const recovered = enqueue(async () => { order.push('saved') })
  await assert.rejects(rejected, /offline/)
  await recovered
  assert.deepEqual(order, ['failed', 'saved'])
})

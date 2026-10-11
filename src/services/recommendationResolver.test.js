import test from 'node:test'
import assert from 'node:assert/strict'
import { findExactAnimeMatch, normalizeAnimeTitle } from './recommendationResolver.js'

test('anime title normalization handles punctuation, capitalization, and full-width forms', () => {
  assert.equal(normalizeAnimeTitle('Parasyte –the maxim–'), normalizeAnimeTitle('PARASYTE: The Maxim'))
  assert.equal(normalizeAnimeTitle('Ｙｕ　Ｙｕ　Ｈａｋｕｓｈｏ'), normalizeAnimeTitle('Yu Yu Hakusho'))
})

test('recommendation matching accepts exact normalized provider names and alternate-language titles', () => {
  const parasyte = { id: 1, name: 'Parasyte: The Maxim' }
  const yuYu = { id: 2, name: 'Yu Yu Hakusho' }
  const shows = [parasyte, yuYu]
  assert.equal(findExactAnimeMatch('Parasyte –the maxim–', shows), parasyte)
  assert.equal(findExactAnimeMatch('yu yu hakusho', shows), yuYu)
  assert.equal(findExactAnimeMatch('寄生獣 セイの格率', shows, new Map([[1, [{ name: '寄生獣 セイの格率' }]]])), parasyte)
  assert.equal(findExactAnimeMatch('Yu Yu', shows), null)
})

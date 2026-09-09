import { describe, expect, it } from 'vitest'
import { loadPieces, pieceById } from '../../content/pieceSchema'
import type { ChunkSummary } from '../chunks/ledger'
import {
  buildPieceItems,
  buildPieceSession,
  choosePieces,
  innerSentence,
  ITEMS_PER_PIECE,
  ledgerEntries,
  pieceChunkKey,
  pieceStatus,
  PIECES_PER_SESSION,
} from './piecesSession'

const set = loadPieces()

function seeded(seed: number): () => number {
  let state = seed
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296
    return state / 4294967296
  }
}

function summary(overrides: Partial<ChunkSummary>): ChunkSummary {
  return {
    seen: 0,
    said: 0,
    contexts: 0,
    lastAt: null,
    before: { seen: 0, said: 0, contexts: 0 },
    ...overrides,
  }
}

describe('choosePieces', () => {
  it('はじめは教材の順に 3 つ', () => {
    expect(choosePieces({ pieces: set.pieces, stage: 'fit', summaries: new Map() }).map((piece) => piece.id))
      .toEqual(['p01', 'p02', 'p03'])
    expect(choosePieces({ pieces: set.pieces, stage: 'link', summaries: new Map() }).map((piece) => piece.id))
      .toEqual(['p35', 'p36', 'p37'])
  })

  it('身についたものは後ろ、言えた回数が少ないものと長く触れていないものが先', () => {
    const summaries = new Map<string, ChunkSummary>([
      [pieceChunkKey('p01'), summary({ seen: 9, said: 4, contexts: 3, lastAt: 1 })],
      [pieceChunkKey('p02'), summary({ seen: 5, said: 1, contexts: 2, lastAt: 200 })],
      [pieceChunkKey('p03'), summary({ seen: 5, said: 1, contexts: 2, lastAt: 100 })],
    ])
    const ranked = choosePieces({ pieces: set.pieces, stage: 'fit', summaries, count: 34 }).map((piece) => piece.id)
    // まだ触れていないもの(p04〜)が先、言えた 1 回の p02/p03 は後ろ、身についた p01 は最後
    expect(ranked.slice(0, 3)).toEqual(['p04', 'p05', 'p06'])
    expect(ranked.indexOf('p03')).toBeLessThan(ranked.indexOf('p02'))
    expect(ranked[ranked.length - 1]).toBe('p01')
    expect(choosePieces({ pieces: set.pieces, stage: 'fit', summaries }).map((piece) => piece.id)).toEqual(['p04', 'p05', 'p06'])
  })

  it('一覧から選んだピースは先頭に入る', () => {
    const chosen = choosePieces({ pieces: set.pieces, stage: 'fit', summaries: new Map(), preferred: 'p30' })
    expect(chosen.map((piece) => piece.id)).toEqual(['p30', 'p01', 'p02'])
    expect(chosen).toHaveLength(PIECES_PER_SESSION)
  })

  it('pieceStatus は台帳の数を写す', () => {
    const summaries = new Map([[pieceChunkKey('p05'), summary({ seen: 8, said: 3, contexts: 2, lastAt: 5 })]])
    expect(pieceStatus(summaries, 'p05')).toEqual({ seen: 8, said: 3, acquired: true, lastAt: 5 })
    expect(pieceStatus(summaries, 'p06')).toEqual({ seen: 0, said: 0, acquired: false, lastAt: null })
  })
})

describe('buildPieceItems', () => {
  it('はめる: 5 項目。本体と言い換えを混ぜ、日常のかたまりを 1 つ足す', () => {
    const piece = pieceById('p08')!
    const items = buildPieceItems(piece, { small: set.small, random: seeded(1) })
    expect(items).toHaveLength(ITEMS_PER_PIECE)
    const heads = [piece.text, ...piece.variants.map((variant) => variant.text)]
    for (const item of items) {
      expect(heads.some((head) => item.answer.startsWith(head)), item.answer).toBe(true)
      expect(item.cueJa.length).toBeGreaterThan(0)
    }
    const fromSmall = items.filter((item) => item.fromSmall)
    expect(fromSmall).toHaveLength(1)
    expect(fromSmall[0].answer).toMatch(/^I have to .+\.$/)
    expect(items.filter((item) => !item.variant && !item.fromSmall).length).toBeGreaterThanOrEqual(2)
  })

  it('動詞のかたまりが入らないピース(It looks 〜)には日常のかたまりを足さない', () => {
    const items = buildPieceItems(pieceById('p33')!, { small: set.small, random: seeded(2) })
    expect(items.every((item) => !item.fromSmall)).toBe(true)
    expect(items).toHaveLength(ITEMS_PER_PIECE)
  })

  it('つなぐ: 中の文を先に見せ、ラージピースの記号に合わせる', () => {
    const items = buildPieceItems(pieceById('p46')!, { random: seeded(3) })
    expect(items).toHaveLength(ITEMS_PER_PIECE)
    for (const item of items) {
      expect(item.inner).toMatch(/^[A-Z].*\?$/)
      expect(item.answer).toMatch(/^Did I tell you .*\?$/)
      expect(item.combo.uses?.length).toBeGreaterThan(0)
    }
    expect(innerSentence(pieceById('p45')!, { text: 'you were coming', ja: '' })).toBe('You were coming.')
  })

  it('組み合わせが 5 未満のピースはある分だけ', () => {
    const items = buildPieceItems(pieceById('p59')!, { random: seeded(4) })
    expect(items).toHaveLength(pieceById('p59')!.combos.length)
  })
})

describe('buildPieceSession と台帳', () => {
  it('ピースごとに項目を持つ', () => {
    const pieces = choosePieces({ pieces: set.pieces, stage: 'link', summaries: new Map() })
    const session = buildPieceSession({ stage: 'link', pieces, small: set.small, random: seeded(5) })
    expect(session.items).toHaveLength(PIECES_PER_SESSION)
    expect(session.items.every((items) => items.length > 0)).toBe(true)
  })

  it('はめるは自分のピースだけ、つなぐは中の文のミディアムピースにも出会いを付ける', () => {
    const fit = buildPieceItems(pieceById('p01')!, { random: seeded(6) })[0]
    expect(ledgerEntries(fit, true)).toEqual([
      { chunkKey: 'piece:p01', mode: 'pieces', kind: 'said', context: fit.combo.text },
    ])

    const link = buildPieceItems(pieceById('p45')!, { random: seeded(7) })[0]
    const entries = ledgerEntries(link, false)
    expect(entries[0]).toEqual({ chunkKey: 'piece:p45', mode: 'pieces', kind: 'seen', context: link.combo.text })
    expect(entries.slice(1).every((entry) => entry.kind === 'seen' && entry.context === 'p45')).toBe(true)
    expect(entries.slice(1).map((entry) => entry.chunkKey)).toEqual((link.combo.uses ?? []).map(pieceChunkKey))
  })
})

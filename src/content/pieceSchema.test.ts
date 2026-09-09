import { describe, expect, it } from 'vitest'
import { buildSentence, loadPieces, pieceById, sentencesOf, PIECE_ID_PATTERN } from './pieceSchema'

const set = loadPieces()

describe('ピースの読み込み', () => {
  it('ミディアム 34 とラージ 36 の 70 ピース、スモールピース 50', () => {
    expect(set.pieces.filter((piece) => piece.kind === 'medium')).toHaveLength(34)
    expect(set.pieces.filter((piece) => piece.kind === 'large')).toHaveLength(36)
    expect(set.small).toHaveLength(50)
  })

  it('id は p01 から p70 まで連続し、重複しない', () => {
    expect(set.pieces.map((piece) => piece.no)).toEqual(Array.from({ length: 70 }, (_, index) => index + 1))
    expect(new Set(set.pieces.map((piece) => piece.id)).size).toBe(70)
    expect(set.pieces.every((piece) => PIECE_ID_PATTERN.test(piece.id))).toBe(true)
  })

  it('ラージピースの uses は実在するミディアムピースを指す', () => {
    const mediumIds = new Set(set.pieces.filter((piece) => piece.kind === 'medium').map((piece) => piece.id))
    for (const piece of set.pieces.filter((item) => item.kind === 'large')) {
      for (const combo of piece.combos) {
        expect(combo.uses, `${piece.id} の「${combo.text}」に uses がありません`).toBeDefined()
        for (const id of combo.uses ?? []) {
          expect(mediumIds.has(id), `${piece.id}: ${id} はミディアムピースではありません`).toBe(true)
        }
      }
    }
  })

  it('どのピースも組み合わせを 3 つ以上持つ', () => {
    for (const piece of set.pieces) {
      const total = piece.combos.length + piece.variants.reduce((sum, variant) => sum + variant.combos.length, 0)
      expect(total, `${piece.id} の組み合わせが少なすぎます`).toBeGreaterThanOrEqual(3)
    }
  })
})

describe('buildSentence', () => {
  const canPiece = pieceById('p01')!

  it('ピースとかたまりをつないで 1 文にする', () => {
    expect(buildSentence(canPiece, { text: 'show you', ja: '見せる' })).toBe('I can show you.')
  })

  it('言い換えは疑問符と末尾の語を扱う', () => {
    const question = canPiece.variants.find((variant) => variant.text === 'Can I')!
    expect(buildSentence(canPiece, { text: 'try', ja: 'やってみる' }, question)).toBe('Can I try?')

    const yet = pieceById('p28')!.variants.find((variant) => variant.suffix === 'yet')!
    expect(buildSentence(pieceById('p28')!, { text: 'finished it', ja: '終わらせる' }, yet)).toBe("I haven't finished it yet.")
  })

  it('もともと記号がある文はそのまま', () => {
    expect(buildSentence(canPiece, { text: 'do it!', ja: 'やる' })).toBe('I can do it!')
  })

  it('sentencesOf は本体と言い換えの全部を返す', () => {
    const sentences = sentencesOf(canPiece)
    expect(sentences.map((item) => item.text)).toContain('I can show you.')
    expect(sentences.map((item) => item.text)).toContain('You can park here.')
    expect(sentences.map((item) => item.text)).toContain('Can you call me?')
  })
})

describe('ピース本体の末尾の語と記号', () => {
  it("I've 〜 before は before を末尾に付ける", () => {
    const piece = pieceById('p26')!
    expect(buildSentence(piece, piece.combos[0])).toBe("I've heard of it before.")
    const haveYou = piece.variants.find((variant) => variant.text === 'Have you')!
    expect(buildSentence(piece, haveYou.combos[0], haveYou)).toBe('Have you met him before?')
  })

  it('疑問のラージピースは ? で、驚きは ! で終わる', () => {
    const piece = pieceById('p46')!
    expect(buildSentence(piece, piece.combos[0])).toBe('Did I tell you I got to meet Lauren in Tokyo?')
    const believe = pieceById('p52')!
    expect(buildSentence(believe, believe.combos[0])).toBe("I can't believe I'm going to the US!")
  })

  it('There is と There are を分けている', () => {
    for (const sentence of sentencesOf(pieceById('p10')!)) {
      expect(sentence.text, sentence.text).not.toMatch(/^(There is|Is there) (mosquitoes|files|many|people|any)/)
    }
  })
})

describe('ラージピースは文をつなぐ', () => {
  it('ミディアムで作った文を後ろに置く', () => {
    const piece = pieceById('p45')!
    expect(piece.display).toBe("I didn't know (that) 〜")
    expect(buildSentence(piece, piece.combos[3])).toBe("I didn't know you were coming.")
    expect(piece.combos[3].uses).toContain('p07')
  })
})

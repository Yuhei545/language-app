import { Type } from '@google/genai'

export const parentReplySchema = {
  type: Type.OBJECT,
  properties: {
    reply: { type: Type.STRING },
    simpler: { type: Type.STRING },
    ja: { type: Type.STRING },
    new_words: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
    },
  },
  required: ['reply', 'simpler', 'ja', 'new_words'],
}

export const vocabListSchema = {
  type: Type.OBJECT,
  properties: {
    items: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          text: { type: Type.STRING },
          emoji: { type: Type.STRING },
          hint_ja: { type: Type.STRING },
          example: { type: Type.STRING },
        },
        required: ['text', 'emoji', 'hint_ja', 'example'],
      },
    },
  },
  required: ['items'],
}

export const mixingCheckSchema = {
  type: Type.OBJECT,
  properties: {
    understood: { type: Type.BOOLEAN },
    recast: { type: Type.STRING },
    ja: { type: Type.STRING },
  },
  required: ['understood', 'recast', 'ja'],
}

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

export const dialogueSchema = {
  type: Type.OBJECT,
  properties: {
    title_ja: { type: Type.STRING },
    scene_ja: { type: Type.STRING },
    turns: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          speaker: { type: Type.STRING, format: 'enum', enum: ['A', 'B'] },
          text: { type: Type.STRING },
          ja: { type: Type.STRING },
        },
        required: ['speaker', 'text', 'ja'],
      },
    },
    new_expressions: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          text: { type: Type.STRING },
          ja: { type: Type.STRING },
          note_ja: { type: Type.STRING },
          turn_index: { type: Type.INTEGER },
        },
        required: ['text', 'ja', 'note_ja', 'turn_index'],
      },
    },
  },
  required: ['title_ja', 'scene_ja', 'turns', 'new_expressions'],
}

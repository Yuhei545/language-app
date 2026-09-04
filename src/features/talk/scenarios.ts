import type { Interest } from '../../services/settings'
import type { PrepEventRow } from '../../services/supabase/types'

export type Scenario = {
  id: string
  labelJa: string
  prompt: string
  prepEventId?: string
}

type PrepEvent = Pick<PrepEventRow, 'id' | 'title'>

const scenariosByInterest: Record<'en' | 'ko', Record<Interest, Scenario[]>> = {
  en: {
    travel: [
      {
        id: 'travel-cafe',
        labelJa: 'カフェで注文する',
        prompt: 'You are a barista at a small cafe. The learner is a customer ordering a drink and food.',
      },
      {
        id: 'travel-directions',
        labelJa: '道を尋ねる',
        prompt: 'You are a friendly local. The learner is asking you for directions in town.',
      },
      {
        id: 'travel-shopping',
        labelJa: '店で買い物する',
        prompt: 'You work at a small shop. The learner wants to ask about an item and buy it.',
      },
    ],
    friends: [
      {
        id: 'friends-catch-up',
        labelJa: '近況を話す',
        prompt: 'You are a close friend catching up with the learner about their recent days.',
      },
      {
        id: 'friends-favorites',
        labelJa: '好きなものについて話す',
        prompt: 'You are a friend chatting with the learner about things you both like.',
      },
    ],
    content: [
      {
        id: 'content-reaction',
        labelJa: 'ドラマや動画の感想を話す',
        prompt: 'You are a friend discussing a drama or video the learner watched recently.',
      },
    ],
  },
  ko: {
    travel: [
      {
        id: 'travel-cafe',
        labelJa: 'カフェで注文する',
        prompt: '당신은 작은 카페의 바리스타입니다. 학습자는 음료와 음식을 주문하는 손님입니다.',
      },
      {
        id: 'travel-directions',
        labelJa: '道を尋ねる',
        prompt: '당신은 친절한 동네 사람입니다. 학습자가 길을 묻고 있습니다.',
      },
      {
        id: 'travel-shopping',
        labelJa: '店で買い物する',
        prompt: '당신은 작은 가게의 직원입니다. 학습자가 물건을 물어보고 사려고 합니다.',
      },
    ],
    friends: [
      {
        id: 'friends-catch-up',
        labelJa: '近況を話す',
        prompt: '당신은 친한 친구입니다. 학습자와 요즘 어떻게 지내는지 이야기합니다.',
      },
      {
        id: 'friends-favorites',
        labelJa: '好きなものについて話す',
        prompt: '당신은 친구입니다. 학습자와 서로 좋아하는 것에 대해 이야기합니다.',
      },
    ],
    content: [
      {
        id: 'content-reaction',
        labelJa: 'ドラマや動画の感想を話す',
        prompt: '당신은 친구입니다. 학습자가 최근에 본 드라마나 영상의 감상을 이야기합니다.',
      },
    ],
  },
}

const freeScenarios: Record<'en' | 'ko', Scenario> = {
  en: {
    id: 'free-talk',
    labelJa: '自由に話す',
    prompt: 'You are a warm friend having a relaxed, everyday conversation with the learner.',
  },
  ko: {
    id: 'free-talk',
    labelJa: '自由に話す',
    prompt: '당신은 따뜻한 친구입니다. 학습자와 편안한 일상 대화를 나눕니다.',
  },
}

function prepScenario(lang: 'en' | 'ko', event: PrepEvent): Scenario {
  return {
    id: `prep-${event.id}`,
    labelJa: `予定に備える：${event.title}`,
    prompt: lang === 'en'
      ? `Help the learner practice a realistic conversation for their upcoming event: ${event.title}.`
      : `학습자의 예정된 일정에 필요한 실제 대화를 연습합니다: ${event.title}.`,
    prepEventId: event.id,
  }
}

export function buildScenarios(
  lang: 'en' | 'ko',
  interests: Interest[],
  prepEvents: PrepEvent[],
): Scenario[] {
  const prepScenarios = prepEvents.map((event) => prepScenario(lang, event))

  if (interests.length === 0) {
    return [...prepScenarios, freeScenarios[lang]]
  }

  const uniqueInterests = [...new Set(interests)]
  return [
    ...prepScenarios,
    ...uniqueInterests.flatMap((interest) => scenariosByInterest[lang][interest]),
  ]
}

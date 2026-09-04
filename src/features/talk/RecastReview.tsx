type ReviewMessage = {
  id: string
  role: 'user' | 'assistant'
  text: string
}

type ReviewTurn = {
  id: string
  userText: string
  parentText: string
}

function pairMessages(messages: ReviewMessage[]): ReviewTurn[] {
  const turns: ReviewTurn[] = []
  let pendingUser: ReviewMessage | null = null

  for (const message of messages) {
    if (message.role === 'user') {
      pendingUser = message
    } else if (pendingUser) {
      turns.push({
        id: `${pendingUser.id}-${message.id}`,
        userText: pendingUser.text,
        parentText: message.text,
      })
      pendingUser = null
    }
  }

  return turns
}

export function RecastReview({ messages }: { messages: ReviewMessage[] }) {
  const turns = pairMessages(messages)

  if (turns.length === 0) {
    return <p className="text-sm leading-6 text-slate-500">振り返る会話はまだありません。</p>
  }

  return (
    <div className="space-y-4">
      {turns.map((turn) => (
        <article key={turn.id} className="overflow-hidden rounded-2xl border border-teal-900/10 bg-white shadow-sm">
          <div className="border-b border-teal-900/10 bg-sky-50 px-4 py-3">
            <p className="text-xs font-bold text-sky-700">あなたの言い方</p>
            <p className="mt-1 leading-7 text-slate-800">{turn.userText}</p>
          </div>
          <div className="bg-teal-50 px-4 py-3">
            <p className="text-xs font-bold text-teal-700">ペアレントの言い方</p>
            <p className="mt-1 leading-7 text-slate-800">{turn.parentText}</p>
          </div>
        </article>
      ))}
    </div>
  )
}

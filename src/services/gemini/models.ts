import { getGeminiClient } from './client'
import { toGeminiError } from './errors'

export type AvailableModel = {
  id: string
  displayName: string
  description: string
}

export async function listAvailableModels(): Promise<AvailableModel[]> {
  try {
    const pager = await getGeminiClient().models.list()
    const models: AvailableModel[] = []

    for await (const model of pager) {
      if (!model.name || !model.supportedActions?.includes('generateContent')) {
        continue
      }

      const id = model.name.replace(/^models\//, '')
      models.push({
        id,
        displayName: model.displayName || id,
        description: model.description || '',
      })
    }

    return models.sort((left, right) => {
      const leftIsFlash = left.id.toLowerCase().includes('flash')
      const rightIsFlash = right.id.toLowerCase().includes('flash')
      return Number(rightIsFlash) - Number(leftIsFlash)
    })
  } catch (error) {
    throw toGeminiError(error)
  }
}

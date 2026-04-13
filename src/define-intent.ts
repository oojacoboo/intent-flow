import { z } from 'zod'

/**
 * Minimal reference implementation of defineIntent from the IntentFlow spec.
 */

export interface IntentDefinition<TSchema extends z.ZodType = z.ZodType> {
  intentId: string
  extractionSchema: TSchema
  examples: string[]
  keywords: string[]
  disambiguateFrom?: string[]
  contextRequires?: {
    activeFlow?: string
  }
  meta?: {
    title: string
    description: string
    category: string
    capabilities?: string[]
    limitations?: string[]
    related?: string[]
  }
}

export function defineIntent<TSchema extends z.ZodType>(
  config: IntentDefinition<TSchema>
): IntentDefinition<TSchema> {
  if (!/^[a-z_]+\.[a-z_]+$/.test(config.intentId)) {
    throw new Error(
      `Invalid intentId "${config.intentId}": must be lowercase domain.action format`
    )
  }

  if (config.examples.length === 0) {
    throw new Error(`Intent "${config.intentId}": must have at least one example utterance`)
  }

  if (config.keywords.length === 0) {
    throw new Error(`Intent "${config.intentId}": must have at least one keyword`)
  }

  return config
}

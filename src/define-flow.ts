import { z } from 'zod'
import { type MachineConfig } from 'xstate'

/**
 * Minimal reference implementation of defineFlow from the IntentFlow spec.
 * This is NOT the production implementation — it validates that the spec's
 * TypeScript examples are structurally sound and testable.
 */

export interface FlowMeta {
  title: string
  description: string
  category: string
  capabilities?: string[]
  limitations?: string[]
  related?: string[]
}

export interface FlowDefinition<TSchema extends z.ZodType = z.ZodType> {
  intentId: string
  meta: FlowMeta
  schema: TSchema
  machine: MachineConfig<any, any, any>
  version?: string
}

export function defineFlow<TSchema extends z.ZodType>(
  config: FlowDefinition<TSchema>
): FlowDefinition<TSchema> {
  // Validate intentId format: domain.action
  if (!/^[a-z_]+\.[a-z_]+$/.test(config.intentId)) {
    throw new Error(
      `Invalid intentId "${config.intentId}": must be lowercase domain.action format`
    )
  }

  // Validate meta fields
  if (!config.meta.title || !config.meta.description || !config.meta.category) {
    throw new Error(`Flow "${config.intentId}": meta requires title, description, and category`)
  }

  return config
}

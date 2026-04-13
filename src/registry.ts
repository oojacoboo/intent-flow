import { type FlowDefinition } from './define-flow'

/**
 * Minimal reference implementation of FlowRegistry from the IntentFlow spec.
 */

export interface FlowRegistration {
  definition: FlowDefinition
  version?: string
}

export interface FlowFilter {
  category?: string
}

export class FlowRegistry {
  private flows = new Map<string, FlowRegistration>()

  register(registration: FlowRegistration): void {
    const { intentId } = registration.definition
    if (this.flows.has(intentId)) {
      throw new Error(`Flow "${intentId}" is already registered`)
    }
    this.flows.set(intentId, registration)
  }

  getFlow(intentId: string): FlowRegistration | undefined {
    return this.flows.get(intentId)
  }

  hasFlow(intentId: string): boolean {
    return this.flows.has(intentId)
  }

  getFlows(filter?: FlowFilter): FlowRegistration[] {
    const all = Array.from(this.flows.values())
    if (!filter) return all

    return all.filter((reg) => {
      if (filter.category && reg.definition.meta.category !== filter.category) {
        return false
      }
      return true
    })
  }

  getCategories(): string[] {
    const categories = new Set<string>()
    for (const reg of this.flows.values()) {
      categories.add(reg.definition.meta.category)
    }
    return Array.from(categories)
  }

  toToolDefinitions(): Array<{
    type: 'function'
    function: { name: string; description: string }
  }> {
    return Array.from(this.flows.values()).map((reg) => ({
      type: 'function' as const,
      function: {
        name: reg.definition.intentId,
        description: reg.definition.meta.description,
      },
    }))
  }
}

export function createRegistry(config: {
  flows: FlowRegistration[]
}): FlowRegistry {
  const registry = new FlowRegistry()
  for (const flow of config.flows) {
    registry.register(flow)
  }
  return registry
}

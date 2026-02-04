# AI Orchestration

This guide covers connecting the AI layer to IntentFlow—how natural language becomes Flow invocations.

## Overview

The AI orchestration layer sits between user input and Flow rendering:

```
User Input → AI Orchestration → Flow Invocation → Rendering
     │              │                  │              │
  "Order a      Intent Match      Hydration       Protocol
   latte"       + Extraction      + Props         Message
```

IntentFlow is agnostic to your AI implementation. This guide shows common patterns.

## Architecture

```typescript
// Orchestration service interface
interface OrchestrationService {
  // Process natural language input
  processPrompt(input: PromptInput): Promise<OrchestrationResult>

  // Continue conversation in context
  continueConversation(input: ConversationInput): Promise<OrchestrationResult>
}

interface PromptInput {
  text: string
  sessionId: string
  userId?: string
  attachments?: Attachment[]
}

interface OrchestrationResult {
  // What to render
  render?: RenderInstruction
  // Or text response
  text?: string
  // Or request clarification
  clarification?: ClarificationRequest
}
```

## Implementation Patterns

### Pattern 1: LLM as Router

The simplest pattern—use the LLM to select which Flow to invoke.

```typescript
import { OpenAI } from 'openai'
import { registry } from './registry'

class LLMOrchestrator implements OrchestrationService {
  private openai = new OpenAI()

  async processPrompt(input: PromptInput): Promise<OrchestrationResult> {
    // Convert Flows to tool definitions
    const tools = registry.getFlows().map(flow => ({
      type: 'function' as const,
      function: {
        name: flow.intentId,
        description: flow.meta.description,
        parameters: zodToJsonSchema(flow.extractionSchema),
      },
    }))

    // Let LLM decide which Flow to invoke
    const response = await this.openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: `You are an assistant for a coffee shop app.
                    Use the available tools to help the user.
                    If no tool matches, respond conversationally.`,
        },
        { role: 'user', content: input.text },
      ],
      tools,
      tool_choice: 'auto',
    })

    const message = response.choices[0].message

    // Handle tool call
    if (message.tool_calls?.length) {
      const toolCall = message.tool_calls[0]
      const intentId = toolCall.function.name
      const entities = JSON.parse(toolCall.function.arguments)

      return this.invokeFlow(intentId, entities, input)
    }

    // No tool call - return text response
    return { text: message.content ?? '' }
  }

  private async invokeFlow(
    intentId: string,
    entities: Record<string, unknown>,
    input: PromptInput
  ): Promise<OrchestrationResult> {
    const flow = registry.getFlow(intentId)
    if (!flow) {
      return { text: "I couldn't find a way to help with that." }
    }

    // Hydrate props
    const props = await hydrateFlow(intentId, {
      entities,
      userId: input.userId,
      sessionId: input.sessionId,
    })

    // Return render instruction
    return {
      render: {
        type: 'RENDER',
        intentId,
        instanceId: generateInstanceId(),
        props,
        displayMode: flow.meta.displayMode ?? 'fullscreen',
      },
    }
  }
}
```

### Pattern 2: Embedding-Based Matching

For lower latency and cost, use embeddings to match intents.

```typescript
import { embed } from './embedding-service'

class EmbeddingOrchestrator implements OrchestrationService {
  private intentEmbeddings: Map<string, number[]>

  async initialize() {
    // Pre-compute embeddings for all intent examples
    this.intentEmbeddings = new Map()

    for (const intent of registry.getIntents()) {
      const embedding = await embed(intent.examples.join(' '))
      this.intentEmbeddings.set(intent.intentId, embedding)
    }
  }

  async processPrompt(input: PromptInput): Promise<OrchestrationResult> {
    // Embed user input
    const inputEmbedding = await embed(input.text)

    // Find closest intent
    let bestMatch = { intentId: '', similarity: 0 }

    for (const [intentId, embedding] of this.intentEmbeddings) {
      const similarity = cosineSimilarity(inputEmbedding, embedding)
      if (similarity > bestMatch.similarity) {
        bestMatch = { intentId, similarity }
      }
    }

    // Threshold check
    if (bestMatch.similarity < 0.7) {
      return { text: "I'm not sure what you're asking. Could you rephrase?" }
    }

    // Extract entities (could use LLM or regex here)
    const entities = await this.extractEntities(input.text, bestMatch.intentId)

    return this.invokeFlow(bestMatch.intentId, entities, input)
  }

  private async extractEntities(
    text: string,
    intentId: string
  ): Promise<Record<string, unknown>> {
    const intent = registry.getIntent(intentId)

    // Use lightweight model for entity extraction
    const response = await this.openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `Extract entities from the user message.
                    Schema: ${JSON.stringify(zodToJsonSchema(intent.extractionSchema))}
                    Return JSON only.`,
        },
        { role: 'user', content: text },
      ],
      response_format: { type: 'json_object' },
    })

    return JSON.parse(response.choices[0].message.content ?? '{}')
  }
}
```

### Pattern 3: Hybrid Approach

Combine embeddings for speed with LLM fallback for accuracy.

```typescript
class HybridOrchestrator implements OrchestrationService {
  private embeddingMatcher: EmbeddingMatcher
  private llmRouter: LLMRouter

  async processPrompt(input: PromptInput): Promise<OrchestrationResult> {
    // Fast path: embedding match
    const embeddingMatch = await this.embeddingMatcher.match(input.text)

    if (embeddingMatch.confidence > 0.9) {
      // High confidence - proceed directly
      const entities = await this.extractEntities(input.text, embeddingMatch.intentId)
      return this.invokeFlow(embeddingMatch.intentId, entities, input)
    }

    if (embeddingMatch.confidence > 0.6) {
      // Medium confidence - verify with LLM
      const verified = await this.llmRouter.verify(input.text, embeddingMatch)
      if (verified.confirmed) {
        return this.invokeFlow(verified.intentId, verified.entities, input)
      }
    }

    // Low confidence - full LLM routing
    return this.llmRouter.route(input)
  }
}
```

## Conversation Context

Maintain context across turns for better understanding.

```typescript
class ContextualOrchestrator implements OrchestrationService {
  private sessionStore: SessionStore

  async processPrompt(input: PromptInput): Promise<OrchestrationResult> {
    // Load session context
    const session = await this.sessionStore.get(input.sessionId)

    // Build conversation history
    const messages = [
      { role: 'system', content: this.getSystemPrompt() },
      ...session.history.map(h => ({
        role: h.role,
        content: h.content,
      })),
      { role: 'user', content: input.text },
    ]

    // Include active Flow context
    if (session.activeFlow) {
      messages.push({
        role: 'system',
        content: `Current context: User is viewing ${session.activeFlow.intentId}
                  with state: ${session.activeFlow.state}`,
      })
    }

    // Route with full context
    const result = await this.llmRouter.route(messages, input)

    // Update session history
    await this.sessionStore.addMessage(input.sessionId, {
      role: 'user',
      content: input.text,
    })

    if (result.text) {
      await this.sessionStore.addMessage(input.sessionId, {
        role: 'assistant',
        content: result.text,
      })
    }

    return result
  }

  private getSystemPrompt(): string {
    return `You are an assistant for a coffee shop app.

Available capabilities:
${registry.getFlows().map(f => `- ${f.intentId}: ${f.meta.description}`).join('\n')}

Guidelines:
- Use tools to help users accomplish tasks
- If a tool matches the user's intent, use it
- Ask clarifying questions if the request is ambiguous
- Be concise and helpful`
  }
}
```

## Handling Ambiguity

When intent is unclear, prompt for clarification.

```typescript
async processPrompt(input: PromptInput): Promise<OrchestrationResult> {
  const matches = await this.findMatchingIntents(input.text)

  // Multiple strong matches - clarify
  if (matches.length > 1 && matches[0].confidence - matches[1].confidence < 0.1) {
    return {
      clarification: {
        message: "I can help with a few things. What would you like to do?",
        options: matches.slice(0, 3).map(m => ({
          intentId: m.intentId,
          label: registry.getFlow(m.intentId).meta.title,
          description: registry.getFlow(m.intentId).meta.description,
        })),
      },
    }
  }

  // Missing required entities - prompt
  const intent = registry.getIntent(matches[0].intentId)
  const extracted = await this.extractEntities(input.text, intent)
  const missing = this.findMissingRequired(extracted, intent.extractionSchema)

  if (missing.length > 0) {
    return {
      clarification: {
        message: this.generatePrompt(missing[0], intent),
        field: missing[0],
      },
    }
  }

  return this.invokeFlow(matches[0].intentId, extracted, input)
}

private generatePrompt(field: string, intent: Intent): string {
  const prompts: Record<string, string> = {
    size: "What size would you like?",
    quantity: "How many would you like?",
    item: "What would you like to order?",
  }
  return prompts[field] ?? `Please specify the ${field}.`
}
```

## In-Flow Conversations

Handle user input while a Flow is active.

```typescript
async continueConversation(input: ConversationInput): Promise<OrchestrationResult> {
  const session = await this.sessionStore.get(input.sessionId)
  const activeFlow = session.activeFlow

  if (!activeFlow) {
    // No active Flow - treat as new prompt
    return this.processPrompt(input)
  }

  // Check if user wants to interact with current Flow
  const flowAction = await this.classifyFlowInput(input.text, activeFlow)

  switch (flowAction.type) {
    case 'event':
      // User action on current Flow
      return {
        event: {
          instanceId: activeFlow.instanceId,
          event: flowAction.event,
          payload: flowAction.payload,
        },
      }

    case 'modify':
      // User wants to change something in the Flow
      return {
        event: {
          instanceId: activeFlow.instanceId,
          event: 'MODIFY',
          payload: flowAction.changes,
        },
      }

    case 'dismiss':
      // User wants to leave current Flow
      return {
        dismiss: { instanceId: activeFlow.instanceId },
        then: flowAction.nextIntent
          ? this.invokeFlow(flowAction.nextIntent, {}, input)
          : undefined,
      }

    case 'unrelated':
      // New intent while Flow is active
      return this.handleNewIntentDuringFlow(input, activeFlow)
  }
}

private async classifyFlowInput(
  text: string,
  activeFlow: ActiveFlowState
): Promise<FlowAction> {
  const flow = registry.getFlow(activeFlow.intentId)
  const allowedEvents = flow.machine.getAllowedEvents(activeFlow.state)

  const response = await this.openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: `User is in the "${flow.meta.title}" flow, state: ${activeFlow.state}.
                  Allowed actions: ${allowedEvents.join(', ')}

                  Classify the user's message:
                  - event: User wants to take an allowed action
                  - modify: User wants to change something
                  - dismiss: User wants to leave/cancel
                  - unrelated: User is asking about something else

                  Return JSON: { type, event?, payload?, changes?, nextIntent? }`,
      },
      { role: 'user', content: text },
    ],
    response_format: { type: 'json_object' },
  })

  return JSON.parse(response.choices[0].message.content ?? '{}')
}
```

## Streaming Responses

For better UX, stream the orchestration process.

```typescript
async *processPromptStream(input: PromptInput): AsyncGenerator<StreamEvent> {
  // Show thinking indicator
  yield { type: 'thinking', message: 'Understanding your request...' }

  // Match intent
  const match = await this.matchIntent(input.text)
  yield { type: 'matched', intentId: match.intentId }

  // Hydrate props
  yield { type: 'thinking', message: 'Fetching your information...' }
  const props = await this.hydrateFlow(match.intentId, match.entities, input)

  // Render
  yield {
    type: 'render',
    instruction: {
      type: 'RENDER',
      intentId: match.intentId,
      instanceId: generateInstanceId(),
      props,
      displayMode: 'fullscreen',
    },
  }
}
```

## Error Handling

Handle orchestration failures gracefully.

```typescript
async processPrompt(input: PromptInput): Promise<OrchestrationResult> {
  try {
    return await this.doProcess(input)
  } catch (error) {
    // Log for debugging
    logger.error('Orchestration error', { error, input })

    // Classify error
    if (error instanceof HydrationError) {
      return {
        text: error.userMessage,
        suggestion: error.suggestedIntent,
      }
    }

    if (error instanceof RateLimitError) {
      return {
        text: "I'm a bit busy right now. Please try again in a moment.",
        retryAfter: error.retryAfter,
      }
    }

    // Generic fallback
    return {
      text: "I had trouble understanding that. Could you try again?",
    }
  }
}
```

## Monitoring

Track orchestration metrics for optimization.

```typescript
async processPrompt(input: PromptInput): Promise<OrchestrationResult> {
  const startTime = Date.now()
  let matchMethod: string
  let intentId: string | null = null

  try {
    // ... orchestration logic

    // Track success
    metrics.increment('orchestration.success', {
      matchMethod,
      intentId,
    })

    return result
  } catch (error) {
    metrics.increment('orchestration.error', {
      errorType: error.constructor.name,
    })
    throw error
  } finally {
    metrics.timing('orchestration.latency', Date.now() - startTime, {
      matchMethod,
    })
  }
}
```

## Testing Orchestration

```typescript
describe('Orchestrator', () => {
  it('routes "order a latte" to order.place', async () => {
    const result = await orchestrator.processPrompt({
      text: 'I want to order a large oat milk latte',
      sessionId: 'test',
      userId: 'user_123',
    })

    expect(result.render).toBeDefined()
    expect(result.render.intentId).toBe('order.place')
    expect(result.render.props.items[0].name).toContain('Latte')
  })

  it('asks for clarification on ambiguous input', async () => {
    const result = await orchestrator.processPrompt({
      text: 'coffee',
      sessionId: 'test',
    })

    expect(result.clarification).toBeDefined()
    expect(result.clarification.options.length).toBeGreaterThan(1)
  })

  it('handles in-flow modifications', async () => {
    // Setup: user has active order Flow
    await sessionStore.setActiveFlow('test', {
      instanceId: 'flow_123',
      intentId: 'order.place',
      state: 'review',
    })

    const result = await orchestrator.continueConversation({
      text: 'actually make that a medium',
      sessionId: 'test',
    })

    expect(result.event).toBeDefined()
    expect(result.event.event).toBe('MODIFY')
    expect(result.event.payload.size).toBe('medium')
  })
})
```

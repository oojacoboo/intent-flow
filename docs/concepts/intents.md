# Intents

An **Intent** is the bridge between natural language and structured action. It represents what the user wants to accomplish, extracted from ambiguous input and mapped to a specific Flow.

## The Intent Model

When a user says "I need a large oat milk latte," the system must:

1. **Recognize** this is an order request (not a question, not a cancellation)
2. **Extract** the entities: item="latte", size="large", milk="oat"
3. **Resolve** to a specific Flow: `order.place`
4. **Construct** the initial props for that Flow

```typescript
// Raw user input
"I need a large oat milk latte"

// Parsed Intent
{
  intentId: "order.place",
  confidence: 0.94,
  entities: {
    item: "latte",
    size: "large",
    modifiers: ["oat milk"]
  }
}
```

## Intent Identifiers

Every Flow declares an `intentId`—a unique, hierarchical identifier:

```
<domain>.<action>
```

Examples:
- `order.place`
- `order.track`
- `order.cancel`
- `menu.browse`
- `menu.search`
- `account.update_payment`
- `support.contact`

### Naming Conventions

| Pattern | Use Case | Examples |
|---------|----------|----------|
| `<noun>.<verb>` | Primary actions | `order.place`, `account.create` |
| `<noun>.view_<thing>` | Display flows | `order.view_history`, `menu.view_item` |
| `<noun>.<action>_<target>` | Specific mutations | `account.update_payment`, `order.add_item` |

Keep identifiers:
- **Lowercase** with underscores for multi-word segments
- **Two levels deep** (domain.action) for most cases
- **Descriptive** enough that the purpose is clear from the ID alone

## Intent Schemas

The Intent Schema defines what data can be extracted from user input to pre-populate a Flow. This is separate from the Flow's props schema—intent schemas capture *user-provided* information, while props schemas define *all* required data (including server-fetched data).

```typescript
import { z } from 'zod'
import { defineIntent } from '@intentflow/core'

export const placeOrderIntent = defineIntent({
  intentId: 'order.place',

  // What can be extracted from natural language
  extractionSchema: z.object({
    item: z.string().optional(),
    quantity: z.number().int().positive().default(1),
    size: z.enum(['small', 'medium', 'large']).optional(),
    modifiers: z.array(z.string()).optional(),
  }),

  // Example utterances for training/matching
  examples: [
    "I want to order a coffee",
    "Can I get a large latte?",
    "Order my usual",
    "I'll have two cappuccinos",
    "Get me a medium cold brew with oat milk",
  ],

  // Keywords that strongly indicate this intent
  keywords: ['order', 'get', 'want', 'buy', 'purchase', 'have'],

  // Intents this could be confused with
  disambiguateFrom: ['menu.browse', 'order.reorder'],
})
```

### Extraction vs. Props

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  User Input: "Large oat latte please"                           │
│                          │                                      │
│                          ▼                                      │
│  ┌─────────────────────────────────────┐                        │
│  │     Intent Extraction Schema        │                        │
│  │     (from natural language)         │                        │
│  │                                     │                        │
│  │  { item: "latte",                   │                        │
│  │    size: "large",                   │                        │
│  │    modifiers: ["oat milk"] }        │                        │
│  └─────────────────────────────────────┘                        │
│                          │                                      │
│                          ▼                                      │
│  ┌─────────────────────────────────────┐                        │
│  │        Hydration Layer              │                        │
│  │     (server fetches rest)           │                        │
│  │                                     │                        │
│  │  + menu item details                │                        │
│  │  + pricing                          │                        │
│  │  + location info                    │                        │
│  │  + payment methods                  │                        │
│  └─────────────────────────────────────┘                        │
│                          │                                      │
│                          ▼                                      │
│  ┌─────────────────────────────────────┐                        │
│  │        Flow Props Schema            │                        │
│  │     (complete, validated)           │                        │
│  │                                     │                        │
│  │  { items: [...],                    │                        │
│  │    location: {...},                 │                        │
│  │    paymentMethods: [...] }          │                        │
│  └─────────────────────────────────────┘                        │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Intent Matching Strategies

IntentFlow is agnostic to how intent matching is implemented. The framework defines the interface; you choose the implementation.

### Strategy 1: LLM Tool Calling

The most flexible approach. The LLM receives available Flows as tools and decides which to invoke.

```typescript
// Register Flows as tools
const tools = registry.getFlows().map(flow => ({
  name: flow.intentId,
  description: flow.meta.description,
  parameters: zodToJsonSchema(flow.extractionSchema),
}))

// LLM decides which tool to call
const response = await llm.chat({
  messages: [{ role: 'user', content: userInput }],
  tools,
})

// Response includes tool_call with intentId and extracted params
```

**Pros:** Handles ambiguity well, can ask clarifying questions
**Cons:** Latency, cost, requires LLM call for every interaction

### Strategy 2: Embedding Similarity

Pre-compute embeddings for intent examples. Match user input by vector similarity.

```typescript
// At startup: embed all example utterances
const intentEmbeddings = await embedIntentExamples(registry.getIntents())

// At runtime: embed user input and find nearest
const userEmbedding = await embed(userInput)
const match = findNearestIntent(userEmbedding, intentEmbeddings)

if (match.similarity > THRESHOLD) {
  return { intentId: match.intentId, confidence: match.similarity }
}
```

**Pros:** Fast, cheap, works offline
**Cons:** Struggles with novel phrasings, no entity extraction

### Strategy 3: Hybrid Approach

Use embeddings for fast initial matching, fall back to LLM for edge cases.

```typescript
async function resolveIntent(userInput: string): Promise<ResolvedIntent> {
  // Fast path: embedding match
  const embeddingMatch = await matchByEmbedding(userInput)

  if (embeddingMatch.confidence > 0.9) {
    // High confidence: extract entities with lightweight model
    const entities = await extractEntities(userInput, embeddingMatch.intentId)
    return { ...embeddingMatch, entities }
  }

  if (embeddingMatch.confidence > 0.7) {
    // Medium confidence: verify with LLM
    return await verifyWithLLM(userInput, embeddingMatch)
  }

  // Low confidence: full LLM resolution
  return await resolveWithLLM(userInput)
}
```

### Strategy 4: Explicit Selection

For MCP or programmatic contexts, the intent is specified directly.

```typescript
// MCP tool call specifies intent explicitly
{
  "tool": "intentflow.invoke",
  "arguments": {
    "intentId": "order.place",
    "entities": { "item": "latte", "size": "large" }
  }
}
```

No matching needed—the caller knows exactly what Flow they want.

## Intent Resolution

Once an intent is matched, resolution fills in the gaps:

```typescript
interface ResolvedIntent {
  intentId: string
  confidence: number
  entities: Record<string, unknown>
  ambiguities?: AmbiguityPrompt[]
}

interface AmbiguityPrompt {
  field: string
  question: string
  options?: string[]
}
```

### Handling Ambiguity

When extraction is incomplete or uncertain, the system can prompt for clarification:

```typescript
// User: "Order a coffee"
// System detects missing information

{
  intentId: "order.place",
  confidence: 0.88,
  entities: { item: "coffee" },
  ambiguities: [
    {
      field: "size",
      question: "What size would you like?",
      options: ["Small", "Medium", "Large"]
    }
  ]
}
```

The client can render these ambiguities as quick-reply buttons or inline prompts before invoking the full Flow.

### Entity Normalization

Raw extracted entities need normalization before hydration:

```typescript
// Raw extraction
{ item: "oat latte", size: "lg" }

// Normalized
{
  itemId: "item_latte_001",
  size: "large",
  modifiers: [{ id: "mod_oat_milk", name: "Oat Milk" }]
}
```

This mapping happens in the hydration layer, using your domain's catalog/database.

## Contextual Intents

Some intents only make sense in context:

```typescript
defineIntent({
  intentId: 'order.add_item',

  // Only valid when an order Flow is active
  contextRequires: {
    activeFlow: 'order.place',
  },

  extractionSchema: z.object({
    item: z.string(),
    quantity: z.number().default(1),
  }),

  examples: [
    "Add a muffin",
    "Also get me a cookie",
    "And a water",
  ],
})
```

### Context Stack

The orchestration layer maintains a context stack:

```typescript
interface OrchestrationContext {
  // Currently active Flow (if any)
  activeFlow?: {
    intentId: string
    instanceId: string
    state: string
  }

  // Recent conversation for context
  recentExchanges: Exchange[]

  // User preferences/defaults
  userContext: {
    preferredLocation?: string
    defaultPayment?: string
    orderHistory?: string[]
  }
}
```

This context influences both intent matching and Flow hydration.

## Intent Metadata

Rich metadata improves discoverability and helps AI systems understand capabilities:

```typescript
defineIntent({
  intentId: 'order.place',

  meta: {
    title: 'Place Order',
    description: 'Create a new order for pickup or delivery',
    category: 'orders',

    // For AI understanding
    capabilities: [
      'Create new orders',
      'Customize items with modifiers',
      'Select payment method',
      'Choose pickup location',
    ],

    // What this intent cannot do
    limitations: [
      'Cannot schedule future orders',
      'Cannot split payment across methods',
    ],

    // Related intents for suggestion
    related: ['order.reorder', 'menu.browse'],
  },
})
```

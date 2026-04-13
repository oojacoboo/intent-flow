# Testing IntentFlow Applications

This guide covers testing strategies for applications built with IntentFlow. Each layer of the Flow primitive—schema, state machine, and component—has distinct testing approaches.

## Testing Layers

IntentFlow applications have a natural testing pyramid:

```
         ┌───────────────┐
         │  Integration  │  Flow composition, intent→render pipeline
         ├───────────────┤
         │  State Machine│  Transitions, paths, final states
         ├───────────────┤
         │    Schema     │  Validation, edge cases, defaults
         └───────────────┘
```

Each layer is independently testable because Flows are **self-contained units** with explicit contracts.

## Schema Testing (Zod)

Schemas define what data a Flow accepts. Test valid inputs, boundary conditions, and rejection cases.

```typescript
import { describe, it, expect } from 'vitest'

describe('order.place schema', () => {
  it('accepts valid props', () => {
    const result = placeOrderFlow.schema.safeParse(validProps)
    expect(result.success).toBe(true)
  })

  it('rejects empty items array', () => {
    const result = placeOrderFlow.schema.safeParse({ ...validProps, items: [] })
    expect(result.success).toBe(false)
  })

  it('rejects invalid payment type', () => {
    const result = placeOrderFlow.schema.safeParse({
      ...validProps,
      paymentMethods: [{ id: '...', label: 'BTC', type: 'crypto' }],
    })
    expect(result.success).toBe(false)
  })
})
```

### What to test

| Category | Examples |
|----------|----------|
| **Valid inputs** | Complete props, minimal required props, optional fields |
| **Boundary values** | Empty arrays with `.min(1)`, zero/negative numbers with `.positive()` |
| **Type safety** | Invalid enum values, wrong types, missing required fields |
| **Defaults** | Fields with `.default()` apply correctly |
| **Nested schemas** | Shared schemas (like `menuItemSchema`) validate independently |

## State Machine Testing (XState)

State machines define the behavioral contract of a Flow. Test all transitions, paths to final states, and invalid transition handling.

```typescript
import { createMachine, createActor } from 'xstate'

describe('order.place state machine', () => {
  const machine = createMachine(placeOrderFlow.machine)

  it('completes happy path: review → processing → confirmed', () => {
    const actor = createActor(machine).start()
    actor.send({ type: 'CONFIRM' })
    actor.send({ type: 'SUCCESS' })
    expect(actor.getSnapshot().value).toBe('confirmed')
    expect(actor.getSnapshot().status).toBe('done')
    actor.stop()
  })

  it('handles error recovery: processing → error → retry → confirmed', () => {
    const actor = createActor(machine).start()
    actor.send({ type: 'CONFIRM' })
    actor.send({ type: 'FAILURE' })
    actor.send({ type: 'RETRY' })
    actor.send({ type: 'SUCCESS' })
    expect(actor.getSnapshot().value).toBe('confirmed')
    actor.stop()
  })

  it('ignores invalid transitions', () => {
    const actor = createActor(machine).start()
    actor.send({ type: 'SUCCESS' }) // not valid from 'review'
    expect(actor.getSnapshot().value).toBe('review')
    actor.stop()
  })
})
```

### What to test

| Category | Examples |
|----------|----------|
| **Initial state** | Machine starts in the expected state |
| **Happy path** | Shortest path to successful completion |
| **Error paths** | Failure → retry → success, failure → cancel |
| **All final states** | Each `type: 'final'` state is reachable |
| **Invalid transitions** | Events that don't match current state are ignored |
| **Self-transitions** | Actions like REMOVE_ITEM that stay in the same state |
| **Edge paths** | Edit → cancel back to review, multiple retries |

### Model-Based Testing

For comprehensive coverage, use `@xstate/test` to automatically generate test paths from the state machine definition:

```typescript
import { createTestModel } from '@xstate/test'

const model = createTestModel(machine)
const paths = model.getShortestPaths()

paths.forEach((path) => {
  it(`reaches ${path.state.value} via ${path.description}`, async () => {
    await path.test()
  })
})
```

This generates a test for every reachable state, ensuring no dead states exist.

## Registry Testing

The Registry constrains what the AI can invoke. Test registration, lookup, filtering, and the AI integration surface.

```typescript
describe('FlowRegistry', () => {
  it('constrains AI to registered flows only', () => {
    const registry = createRegistry({ flows: [{ definition: orderPlaceFlow }] })

    expect(registry.hasFlow('order.place')).toBe(true)
    expect(registry.hasFlow('admin.drop_database')).toBe(false)
  })

  it('generates tool definitions for LLM integration', () => {
    const tools = registry.toToolDefinitions()
    expect(tools[0].function.name).toBe('order.place')
  })
})
```

### What to test

| Category | Examples |
|----------|----------|
| **Registration** | Flows register successfully, duplicates rejected |
| **Lookup** | Known flows found, unknown flows return undefined |
| **Filtering** | Category filter returns correct subset |
| **AI tools** | Tool definitions match registered flows exactly |
| **Constraint** | Unregistered intents cannot be invoked |

## Intent Testing

Intents bridge natural language to Flows. Test extraction schemas and matching behavior.

```typescript
describe('Intent extraction', () => {
  it('extracts entities from structured input', () => {
    const result = placeOrderIntent.extractionSchema.safeParse({
      item: 'latte',
      size: 'large',
      modifiers: ['oat milk'],
    })
    expect(result.success).toBe(true)
  })

  it('applies defaults for missing fields', () => {
    const result = placeOrderIntent.extractionSchema.safeParse({})
    expect(result.success).toBe(true)
    expect(result.data.quantity).toBe(1)
  })
})
```

## Running Tests

```bash
# Run all tests
npm test

# Run in watch mode during development
npm run test:watch

# Run specific test file
npx vitest run tests/flows.test.ts
```

## Test Organization

```
/tests
├── flows.test.ts       # Schema + state machine tests per Flow
├── intents.test.ts     # Extraction schema + validation tests
├── registry.test.ts    # Registration, lookup, filtering, AI tools
└── integration/        # (future) Full pipeline tests
    ├── hydration.test.ts
    └── mcp.test.ts
```

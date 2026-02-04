# Flows

The **Flow** is the fundamental primitive in IntentFlow. Understanding Flows is understanding the framework.

## What is a Flow?

A Flow is a self-contained unit of application functionality. Unlike a "page" or "screen" that exists at a URL, a Flow exists as a capability that can be invoked by intent.

Examples of Flows:
- `order.place` — Build and submit a new order
- `order.track` — Display order status and ETA
- `order.cancel` — Cancel a pending order
- `menu.browse` — Explore available items
- `account.update_payment` — Change default payment method

Each Flow packages three things together:

| Aspect | Purpose | Implementation |
|--------|---------|----------------|
| **Intent Schema** | What data is needed to start this Flow | Zod schema |
| **State Machine** | What states and transitions are valid | XState machine |
| **Component** | How the Flow renders visually | React component |

## Flow Anatomy

A Flow lives in a directory with this structure:

```
/flows/order/place/
├── definition.ts    # Intent schema + state machine
├── component.tsx    # Universal React component
└── index.ts         # Exports
```

### The Definition (`definition.ts`)

The definition declares the Flow's identity, input requirements, and behavioral rules.

```typescript
import { z } from 'zod'
import { createMachine } from 'xstate'
import { defineFlow } from '@intentflow/core'

// Shared schemas
const menuItemSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  price: z.number().positive(),
  options: z.array(z.object({
    id: z.string(),
    name: z.string(),
    choices: z.array(z.object({
      id: z.string(),
      label: z.string(),
      priceModifier: z.number().default(0),
    })),
  })).optional(),
})

const orderItemSchema = z.object({
  item: menuItemSchema,
  quantity: z.number().int().positive(),
  selectedOptions: z.record(z.string()).optional(),
  specialInstructions: z.string().optional(),
})

export const placeOrderFlow = defineFlow({
  // Unique identifier used for intent matching
  intentId: 'order.place',

  // Human-readable metadata for registry/documentation
  meta: {
    title: 'Place Order',
    description: 'Build and submit a new order',
    category: 'orders',
  },

  // Schema defining required and optional props
  schema: z.object({
    items: z.array(orderItemSchema).min(1),
    location: z.object({
      id: z.string().uuid(),
      name: z.string(),
      address: z.string(),
      estimatedTime: z.number(), // minutes
    }),
    paymentMethods: z.array(z.object({
      id: z.string().uuid(),
      label: z.string(),
      type: z.enum(['card', 'wallet', 'gift_card']),
    })).min(1),
  }),

  // State machine governing Flow lifecycle
  machine: createMachine({
    id: 'placeOrder',
    initial: 'review',
    states: {
      review: {
        on: {
          CONFIRM: 'processing',
          EDIT_ITEM: 'editing',
          REMOVE_ITEM: {
            actions: 'removeItem',
            target: 'review',
          },
          CANCEL: 'cancelled',
        },
      },
      editing: {
        on: {
          SAVE: 'review',
          CANCEL: 'review',
        },
      },
      processing: {
        on: {
          SUCCESS: 'confirmed',
          FAILURE: 'error',
        },
      },
      confirmed: {
        type: 'final',
        meta: {
          followUp: 'order.track', // Suggest next Flow
        },
      },
      error: {
        on: {
          RETRY: 'processing',
          CANCEL: 'cancelled',
        },
      },
      cancelled: {
        type: 'final',
      },
    },
  }),
})
```

### The Component (`component.tsx`)

The component renders the Flow's visual representation. It receives validated props and the current state machine context.

```tsx
import { Stack, Text, Button, Card } from '@intentflow/ui'
import { useFlowState, useFlowDispatch } from '@intentflow/react'
import type { PlaceOrderFlowProps } from './definition'

export function PlaceOrderFlow(props: PlaceOrderFlowProps) {
  const state = useFlowState()
  const dispatch = useFlowDispatch()

  if (state.matches('review')) {
    const total = calculateTotal(props.items)

    return (
      <Stack padding="$4" gap="$3">
        <Text variant="heading">Review Order</Text>
        <Text variant="caption">{props.location.name} · {props.location.estimatedTime} min</Text>

        {props.items.map((orderItem, index) => (
          <OrderItemCard
            key={index}
            item={orderItem}
            onEdit={() => dispatch({ type: 'EDIT_ITEM', index })}
            onRemove={() => dispatch({ type: 'REMOVE_ITEM', index })}
          />
        ))}

        <Card variant="subtle">
          <Stack direction="row" justify="between">
            <Text>Total</Text>
            <Text variant="bold">${total.toFixed(2)}</Text>
          </Stack>
        </Card>

        <PaymentSelector
          methods={props.paymentMethods}
          selected={state.context.selectedPaymentId}
          onSelect={(id) => dispatch({ type: 'SELECT_PAYMENT', id })}
        />

        <Stack direction="row" gap="$2">
          <Button variant="secondary" onPress={() => dispatch('CANCEL')}>
            Cancel
          </Button>
          <Button variant="primary" onPress={() => dispatch('CONFIRM')}>
            Place Order · ${total.toFixed(2)}
          </Button>
        </Stack>
      </Stack>
    )
  }

  if (state.matches('processing')) {
    return <ProcessingSpinner message="Placing your order..." />
  }

  if (state.matches('confirmed')) {
    return (
      <SuccessCard
        title="Order Placed!"
        message={`Your order will be ready in ~${props.location.estimatedTime} minutes`}
        orderId={state.context.orderId}
        action={{
          label: 'Track Order',
          onPress: () => dispatch({ type: 'NAVIGATE', to: 'order.track' }),
        }}
      />
    )
  }

  if (state.matches('error')) {
    return (
      <ErrorCard
        message={state.context.errorMessage}
        onRetry={() => dispatch('RETRY')}
        onCancel={() => dispatch('CANCEL')}
      />
    )
  }

  return null
}
```

## Flow Lifecycle

A Flow moves through a predictable lifecycle:

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  1. INVOKE                                                  │
│     AI matches user intent → selects Flow from Registry     │
│                                                             │
│  2. HYDRATE                                                 │
│     Server fetches required data → validates against schema │
│                                                             │
│  3. RENDER                                                  │
│     Server emits protocol instruction → client renders UI   │
│                                                             │
│  4. INTERACT                                                │
│     User actions dispatch events → state machine transitions│
│                                                             │
│  5. MUTATE (if applicable)                                  │
│     Terminal states may trigger server-side mutations       │
│                                                             │
│  6. COMPLETE                                                │
│     Flow reaches final state → dismissed or replaced        │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Invoke

The AI layer receives user input and determines which Flow to invoke:

```
User: "I want to order a cappuccino"
AI:   Intent detected → order.place
      Entities extracted → { item: "cappuccino", quantity: 1 }
```

Intent matching can use embeddings, keyword matching, or explicit tool selection—the mechanism is pluggable. What matters is the output: a specific `intentId` and optional extracted entities.

### Hydrate

The server fetches data needed to populate the Flow's props:

```typescript
// Server-side orchestration
const props = await hydrateFlow('order.place', {
  userId: session.userId,
  entities: { item: 'cappuccino', quantity: 1 },
  context: { locationId: session.preferredLocation }
})

// Returns validated props:
// {
//   items: [{ item: { id: '...', name: 'Cappuccino', price: 4.50 }, quantity: 1 }],
//   location: { id: '...', name: 'Main St', estimatedTime: 8 },
//   paymentMethods: [...]
// }
```

The schema ensures props are complete and correctly typed before rendering.

### Render

The server emits a protocol instruction:

```json
{
  "type": "RENDER",
  "intentId": "order.place",
  "instanceId": "flow_abc123",
  "props": {
    "items": [{
      "item": { "id": "item_123", "name": "Cappuccino", "price": 4.50 },
      "quantity": 1
    }],
    "location": {
      "id": "loc_456",
      "name": "123 Main St",
      "estimatedTime": 8
    },
    "paymentMethods": [
      { "id": "pm_789", "label": "Visa ••4242", "type": "card" }
    ]
  }
}
```

The client looks up `order.place` in its component registry and renders the corresponding component with the provided props.

### Interact

User interactions dispatch events to the state machine:

```typescript
// User taps "Place Order"
dispatch('CONFIRM')

// State transitions: review → processing
// Client re-renders to show processing state
```

For events that require server involvement (like submitting the order), the client sends an event to the server:

```json
{
  "type": "EVENT",
  "instanceId": "flow_abc123",
  "event": "CONFIRM",
  "payload": {
    "selectedPaymentId": "pm_789"
  }
}
```

The server processes the event, executes the order mutation, and responds with the next state.

### Complete

When the state machine reaches a final state (`confirmed`, `cancelled`), the Flow is complete. The orchestration layer may:

- Dismiss the Flow and return to ambient listening
- Automatically invoke a follow-up Flow (e.g., `order.track`)
- Present options for next actions

## Flow Categories

Flows generally fall into patterns:

### Display Flows
Read-only presentation of information.

```typescript
defineFlow({
  intentId: 'order.track',
  schema: z.object({
    orderId: z.string(),
    status: z.enum(['received', 'preparing', 'ready', 'picked_up']),
    items: z.array(orderItemSchema),
    estimatedReadyTime: z.string().datetime(),
    location: locationSchema,
  }),
  machine: createMachine({
    id: 'trackOrder',
    initial: 'viewing',
    states: {
      viewing: {
        on: {
          REFRESH: 'viewing',
          DISMISS: 'done',
        },
      },
      done: { type: 'final' },
    },
  }),
})
```

### Action Flows
Collect input and execute a mutation.

State pattern: `review → processing → success/error`

### Wizard Flows
Multi-step processes with branching paths.

State pattern: `step1 → step2 → step3 → review → submit → complete`

### Confirmation Flows
Simple yes/no decisions.

```typescript
defineFlow({
  intentId: 'order.cancel',
  schema: z.object({
    orderId: z.string(),
    orderSummary: z.string(),
    refundAmount: z.number().optional(),
    refundEligible: z.boolean(),
  }),
  machine: createMachine({
    id: 'cancelOrder',
    initial: 'confirming',
    states: {
      confirming: {
        on: {
          CONFIRM: 'processing',
          DECLINE: 'declined',
        },
      },
      processing: {
        on: {
          SUCCESS: 'cancelled',
          FAILURE: 'error',
        },
      },
      cancelled: { type: 'final' },
      declined: { type: 'final' },
      error: {
        on: {
          RETRY: 'processing',
          DECLINE: 'declined',
        },
      },
    },
  }),
})
```

## Composing Flows

Flows can invoke other Flows. A "Reorder Previous" flow might compose:

1. `order.history` (Display Flow) — Show past orders
2. `order.place` (Action Flow) — Place the selected order
3. `order.track` (Display Flow) — Track the new order

The parent Flow's state machine manages the composition:

```typescript
machine: createMachine({
  id: 'reorderFlow',
  initial: 'selectingOrder',
  states: {
    selectingOrder: {
      invoke: { src: 'order.history' },
      on: {
        'done.selected': 'placingOrder',
        'done.dismissed': 'cancelled',
      },
    },
    placingOrder: {
      invoke: { src: 'order.place' },
      on: {
        'done.confirmed': 'tracking',
        'done.cancelled': 'cancelled',
      },
    },
    tracking: {
      invoke: { src: 'order.track' },
      on: { 'done.*': 'complete' },
    },
    complete: { type: 'final' },
    cancelled: { type: 'final' },
  },
})
```

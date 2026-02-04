# Building Flows

This guide walks through creating a Flow from scratch.

## Prerequisites

```bash
npm install @intentflow/core @intentflow/react @intentflow/ui zod xstate
```

## Step 1: Define the Flow

Start with the Flow definition. This establishes the contract: what data is required and what states are valid.

### Create the Directory

```bash
mkdir -p flows/order/track
```

### Write the Definition

```typescript
// flows/order/track/definition.ts
import { z } from 'zod'
import { createMachine } from 'xstate'
import { defineFlow } from '@intentflow/core'

// Define schemas for reusable types
const orderItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  quantity: z.number().int().positive(),
  price: z.number().positive(),
})

// Define the Flow
export const trackOrderFlow = defineFlow({
  intentId: 'order.track',

  meta: {
    title: 'Track Order',
    description: 'View the status and ETA of an order',
    category: 'orders',
  },

  // Props schema: what data this Flow needs to render
  schema: z.object({
    orderId: z.string(),
    status: z.enum(['received', 'preparing', 'ready', 'picked_up', 'cancelled']),
    items: z.array(orderItemSchema),
    total: z.number().positive(),
    location: z.object({
      name: z.string(),
      address: z.string(),
    }),
    estimatedReadyTime: z.string().datetime().nullable(),
    placedAt: z.string().datetime(),
  }),

  // State machine: what states and transitions are valid
  machine: createMachine({
    id: 'trackOrder',
    initial: 'viewing',
    states: {
      viewing: {
        on: {
          REFRESH: 'refreshing',
          CANCEL_ORDER: 'confirmingCancel',
          DISMISS: 'done',
        },
      },
      refreshing: {
        on: {
          REFRESH_SUCCESS: 'viewing',
          REFRESH_ERROR: 'viewing',
        },
      },
      confirmingCancel: {
        on: {
          CONFIRM_CANCEL: 'cancelling',
          ABORT_CANCEL: 'viewing',
        },
      },
      cancelling: {
        on: {
          CANCEL_SUCCESS: 'cancelled',
          CANCEL_ERROR: 'viewing',
        },
      },
      cancelled: {
        type: 'final',
      },
      done: {
        type: 'final',
      },
    },
  }),
})

// Export inferred types
export type TrackOrderFlowProps = z.infer<typeof trackOrderFlow.schema>
```

### Key Decisions

**Schema Design:**
- Include all data needed to render the complete UI
- Use specific types (enums for status, datetime for timestamps)
- Make optional fields explicit with `.nullable()` or `.optional()`

**State Machine Design:**
- Start with the primary viewing state
- Add transitions for user actions (refresh, cancel)
- Include intermediate states for async operations
- End with final states (done, cancelled)

## Step 2: Build the Component

The component renders the Flow's UI based on current state and props.

```tsx
// flows/order/track/component.tsx
import { Stack, Text, Button, Card, XStack, YStack, Separator } from '@intentflow/ui'
import { useFlowState, useFlowDispatch, useFlowProps } from '@intentflow/react'
import type { TrackOrderFlowProps } from './definition'

export function TrackOrderFlow() {
  const props = useFlowProps<TrackOrderFlowProps>()
  const state = useFlowState()
  const dispatch = useFlowDispatch()

  // Render based on current state
  if (state.matches('confirmingCancel')) {
    return <CancelConfirmation props={props} dispatch={dispatch} />
  }

  if (state.matches('cancelling')) {
    return <ProcessingView message="Cancelling your order..." />
  }

  if (state.matches('cancelled')) {
    return <CancelledView props={props} dispatch={dispatch} />
  }

  // Default: viewing state
  return (
    <YStack padding="$4" gap="$4">
      {/* Header */}
      <YStack gap="$1">
        <Text variant="heading">Order #{props.orderId.slice(-6)}</Text>
        <Text variant="caption" color="$textMuted">
          Placed {formatTime(props.placedAt)}
        </Text>
      </YStack>

      {/* Status */}
      <StatusTracker status={props.status} />

      {/* ETA */}
      {props.estimatedReadyTime && props.status !== 'ready' && (
        <Card variant="highlight">
          <XStack justifyContent="space-between" alignItems="center">
            <Text>Estimated ready</Text>
            <Text variant="bold">{formatTime(props.estimatedReadyTime)}</Text>
          </XStack>
        </Card>
      )}

      {props.status === 'ready' && (
        <Card variant="success">
          <Text variant="bold">Your order is ready!</Text>
          <Text>Pick up at {props.location.name}</Text>
        </Card>
      )}

      {/* Order Details */}
      <Card>
        <YStack gap="$2">
          <Text variant="label">Order Details</Text>
          <Separator />
          {props.items.map(item => (
            <XStack key={item.id} justifyContent="space-between">
              <Text>{item.quantity}x {item.name}</Text>
              <Text>${(item.price * item.quantity).toFixed(2)}</Text>
            </XStack>
          ))}
          <Separator />
          <XStack justifyContent="space-between">
            <Text variant="bold">Total</Text>
            <Text variant="bold">${props.total.toFixed(2)}</Text>
          </XStack>
        </YStack>
      </Card>

      {/* Location */}
      <Card>
        <YStack gap="$1">
          <Text variant="label">Pickup Location</Text>
          <Text variant="bold">{props.location.name}</Text>
          <Text color="$textMuted">{props.location.address}</Text>
        </YStack>
      </Card>

      {/* Actions */}
      <XStack gap="$2">
        <Button
          flex={1}
          variant="secondary"
          onPress={() => dispatch('REFRESH')}
          disabled={state.matches('refreshing')}
        >
          {state.matches('refreshing') ? 'Refreshing...' : 'Refresh'}
        </Button>

        {['received', 'preparing'].includes(props.status) && (
          <Button
            flex={1}
            variant="destructive"
            onPress={() => dispatch('CANCEL_ORDER')}
          >
            Cancel Order
          </Button>
        )}
      </XStack>

      <Button variant="ghost" onPress={() => dispatch('DISMISS')}>
        Done
      </Button>
    </YStack>
  )
}

// Sub-components

function StatusTracker({ status }: { status: string }) {
  const steps = ['received', 'preparing', 'ready']
  const currentIndex = steps.indexOf(status)

  return (
    <XStack justifyContent="space-between" paddingVertical="$2">
      {steps.map((step, index) => (
        <YStack key={step} alignItems="center" gap="$1">
          <StatusDot
            active={index <= currentIndex}
            current={index === currentIndex}
          />
          <Text
            variant="caption"
            color={index <= currentIndex ? '$text' : '$textMuted'}
          >
            {step.charAt(0).toUpperCase() + step.slice(1)}
          </Text>
        </YStack>
      ))}
    </XStack>
  )
}

function CancelConfirmation({ props, dispatch }) {
  return (
    <YStack padding="$4" gap="$4" alignItems="center">
      <Text variant="heading">Cancel Order?</Text>
      <Text textAlign="center">
        Are you sure you want to cancel your order for ${props.total.toFixed(2)}?
      </Text>
      <XStack gap="$2">
        <Button variant="secondary" onPress={() => dispatch('ABORT_CANCEL')}>
          Keep Order
        </Button>
        <Button variant="destructive" onPress={() => dispatch('CONFIRM_CANCEL')}>
          Yes, Cancel
        </Button>
      </XStack>
    </YStack>
  )
}

function CancelledView({ props, dispatch }) {
  return (
    <YStack padding="$4" gap="$4" alignItems="center">
      <Text variant="heading">Order Cancelled</Text>
      <Text textAlign="center">
        Your order has been cancelled. A refund of ${props.total.toFixed(2)} will be processed.
      </Text>
      <Button onPress={() => dispatch('DISMISS')}>Done</Button>
    </YStack>
  )
}

function ProcessingView({ message }: { message: string }) {
  return (
    <YStack padding="$4" alignItems="center" justifyContent="center" minHeight={200}>
      <Spinner />
      <Text>{message}</Text>
    </YStack>
  )
}

function formatTime(isoString: string): string {
  return new Date(isoString).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  })
}
```

### Component Patterns

**State-based rendering:**
```tsx
if (state.matches('loading')) return <Loading />
if (state.matches('error')) return <Error />
return <MainContent />
```

**Dispatching events:**
```tsx
<Button onPress={() => dispatch('CONFIRM')}>Confirm</Button>
<Button onPress={() => dispatch({ type: 'SELECT', id: item.id })}>Select</Button>
```

**Accessing context:**
```tsx
const state = useFlowState()
const errorMessage = state.context.errorMessage
```

## Step 3: Export the Flow

```typescript
// flows/order/track/index.ts
export { trackOrderFlow } from './definition'
export { TrackOrderFlow } from './component'
export type { TrackOrderFlowProps } from './definition'
```

## Step 4: Register the Flow

### Server-Side Registry

```typescript
// server/registry.ts
import { createRegistry } from '@intentflow/core'
import { trackOrderFlow } from '../flows/order/track'
import { placeOrderFlow } from '../flows/order/place'
// ... other flows

export const registry = createRegistry({
  flows: [
    { definition: trackOrderFlow },
    { definition: placeOrderFlow },
    // ... other flows
  ],
})
```

### Client-Side Registry

```typescript
// client/registry.ts
import { createClientRegistry } from '@intentflow/react'
import { TrackOrderFlow } from '../flows/order/track'
import { PlaceOrderFlow } from '../flows/order/place'

export const clientRegistry = createClientRegistry({
  'order.track': TrackOrderFlow,
  'order.place': PlaceOrderFlow,
})
```

## Step 5: Implement Hydration

The hydration layer fetches data to populate Flow props.

```typescript
// server/hydration/order.track.ts
import { defineHydrator } from '@intentflow/core'
import { trackOrderFlow } from '../../flows/order/track'

export const trackOrderHydrator = defineHydrator({
  flow: trackOrderFlow,

  // What entities can be extracted from user input
  extractionSchema: z.object({
    orderId: z.string().optional(),
  }),

  // Hydrate props from extracted entities + context
  async hydrate({ entities, context, db }) {
    // Get order ID from entities or most recent order
    const orderId = entities.orderId ?? await db.orders.getMostRecent(context.userId)

    if (!orderId) {
      throw new HydrationError('NO_ACTIVE_ORDER', 'You don\'t have any active orders')
    }

    // Fetch order data
    const order = await db.orders.findById(orderId)

    if (!order) {
      throw new HydrationError('ORDER_NOT_FOUND', 'Order not found')
    }

    if (order.userId !== context.userId) {
      throw new HydrationError('PERMISSION_DENIED', 'You cannot view this order')
    }

    // Return props matching the schema
    return {
      orderId: order.id,
      status: order.status,
      items: order.items.map(item => ({
        id: item.id,
        name: item.product.name,
        quantity: item.quantity,
        price: item.price,
      })),
      total: order.total,
      location: {
        name: order.location.name,
        address: order.location.address,
      },
      estimatedReadyTime: order.estimatedReadyAt?.toISOString() ?? null,
      placedAt: order.createdAt.toISOString(),
    }
  },
})
```

## Step 6: Handle Events

Implement server-side event handlers for state transitions that require backend work.

```typescript
// server/handlers/order.track.ts
import { defineEventHandlers } from '@intentflow/core'
import { trackOrderFlow } from '../../flows/order/track'

export const trackOrderHandlers = defineEventHandlers({
  flow: trackOrderFlow,

  handlers: {
    // Refresh order data
    async REFRESH({ instanceId, context, db }) {
      const order = await db.orders.findById(context.orderId)

      return {
        event: 'REFRESH_SUCCESS',
        propsUpdate: {
          status: order.status,
          estimatedReadyTime: order.estimatedReadyAt?.toISOString() ?? null,
        },
      }
    },

    // Cancel the order
    async CONFIRM_CANCEL({ instanceId, context, db }) {
      try {
        await db.orders.cancel(context.orderId)
        await payments.refund(context.orderId)

        return { event: 'CANCEL_SUCCESS' }
      } catch (error) {
        return {
          event: 'CANCEL_ERROR',
          contextUpdate: {
            errorMessage: 'Failed to cancel order. Please try again.',
          },
        }
      }
    },
  },
})
```

## Step 7: Define the Intent

Connect the Flow to natural language understanding.

```typescript
// server/intents/order.track.ts
import { defineIntent } from '@intentflow/core'

export const trackOrderIntent = defineIntent({
  intentId: 'order.track',

  // Example utterances for matching
  examples: [
    "Where's my order?",
    "Track my order",
    "What's the status of my order?",
    "How long until my order is ready?",
    "Check on my coffee",
    "Is my order ready yet?",
  ],

  // Keywords that suggest this intent
  keywords: ['track', 'status', 'where', 'ready', 'order', 'check'],

  // Extraction schema for entity parsing
  extractionSchema: z.object({
    orderId: z.string().optional().describe('Order ID if mentioned'),
  }),
})
```

## Testing Flows

### Unit Test the Definition

```typescript
// flows/order/track/definition.test.ts
import { trackOrderFlow } from './definition'

describe('trackOrderFlow', () => {
  describe('schema', () => {
    it('validates correct props', () => {
      const props = {
        orderId: 'order_123',
        status: 'preparing',
        items: [{ id: '1', name: 'Latte', quantity: 1, price: 4.50 }],
        total: 4.50,
        location: { name: 'Main St', address: '123 Main St' },
        estimatedReadyTime: '2025-01-15T10:30:00Z',
        placedAt: '2025-01-15T10:15:00Z',
      }

      expect(trackOrderFlow.schema.safeParse(props).success).toBe(true)
    })

    it('rejects invalid status', () => {
      const props = { ...validProps, status: 'invalid' }
      expect(trackOrderFlow.schema.safeParse(props).success).toBe(false)
    })
  })

  describe('machine', () => {
    it('allows CANCEL_ORDER from viewing', () => {
      const machine = trackOrderFlow.machine
      expect(machine.transition('viewing', 'CANCEL_ORDER').value).toBe('confirmingCancel')
    })

    it('prevents CANCEL_ORDER from cancelled', () => {
      const machine = trackOrderFlow.machine
      expect(machine.transition('cancelled', 'CANCEL_ORDER').value).toBe('cancelled')
    })
  })
})
```

### Integration Test the Component

```typescript
// flows/order/track/component.test.tsx
import { render, fireEvent } from '@testing-library/react'
import { FlowTestProvider } from '@intentflow/react/testing'
import { TrackOrderFlow } from './component'
import { trackOrderFlow } from './definition'

describe('TrackOrderFlow', () => {
  const defaultProps = {
    orderId: 'order_123',
    status: 'preparing' as const,
    items: [{ id: '1', name: 'Latte', quantity: 1, price: 4.50 }],
    total: 4.50,
    location: { name: 'Main St', address: '123 Main St' },
    estimatedReadyTime: '2025-01-15T10:30:00Z',
    placedAt: '2025-01-15T10:15:00Z',
  }

  it('renders order details', () => {
    const { getByText } = render(
      <FlowTestProvider flow={trackOrderFlow} props={defaultProps}>
        <TrackOrderFlow />
      </FlowTestProvider>
    )

    expect(getByText('Latte')).toBeInTheDocument()
    expect(getByText('$4.50')).toBeInTheDocument()
  })

  it('shows cancel confirmation on cancel press', () => {
    const { getByText } = render(
      <FlowTestProvider flow={trackOrderFlow} props={defaultProps}>
        <TrackOrderFlow />
      </FlowTestProvider>
    )

    fireEvent.press(getByText('Cancel Order'))
    expect(getByText('Cancel Order?')).toBeInTheDocument()
  })
})
```

## Summary

Building a Flow involves:

1. **Define** the schema (props) and state machine (behavior)
2. **Build** the component (UI for each state)
3. **Export** from index file
4. **Register** on server and client
5. **Hydrate** with data fetching logic
6. **Handle** server-side events
7. **Connect** to intent matching
8. **Test** at each layer

Each Flow is self-contained and portable—it works anywhere the IntentFlow protocol is spoken.

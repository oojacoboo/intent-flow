# Protocol Messages

IntentFlow uses [AG-UI Protocol](https://docs.ag-ui.com) events as its transport layer. This document specifies the IntentFlow-specific events sent via AG-UI's `CUSTOM` event type.

## AG-UI Base Events

IntentFlow relies on these standard AG-UI events:

| Event | Direction | Purpose |
|-------|-----------|---------|
| `RUN_STARTED` | Server → Client | Agent run begins |
| `RUN_FINISHED` | Server → Client | Agent run completes |
| `RUN_ERROR` | Server → Client | Agent run failed |
| `STATE_SNAPSHOT` | Server → Client | Full state sync |
| `STATE_DELTA` | Server → Client | Incremental state update |

See the [AG-UI documentation](https://docs.ag-ui.com) for full event specifications.

## IntentFlow Custom Events

IntentFlow extends AG-UI with custom events for Flow management:

```typescript
// All IntentFlow events use AG-UI's CUSTOM type
interface IntentFlowEvent {
  type: 'CUSTOM'
  name: string        // e.g., 'intentflow.render'
  value: unknown      // IntentFlow-specific payload
}
```

## Server → Client Events

### intentflow.render

Instructs the client to display a Flow.

```typescript
interface RenderPayload {
  // Flow identification
  intentId: string          // e.g., "order.place"
  instanceId: string        // Unique instance ID, e.g., "flow_abc123"

  // Flow data
  props: Record<string, unknown>  // Validated against Flow schema
  initialState?: string           // Starting state (defaults to machine's initial)
  context?: Record<string, unknown>  // Initial state machine context

  // Presentation
  displayMode: 'inline' | 'modal' | 'fullscreen' | 'sheet'
  priority?: 'normal' | 'high'    // High priority interrupts current view

  // Hierarchy
  parentInstanceId?: string       // If this is a nested/child Flow

  // Options
  streaming?: boolean             // Expect props_update events
  dismissable?: boolean           // User can dismiss without completing (default: true)
}
```

**Example:**

```json
{
  "type": "CUSTOM",
  "name": "intentflow.render",
  "value": {
    "intentId": "order.place",
    "instanceId": "flow_abc123",
    "props": {
      "items": [
        {
          "item": { "id": "item_001", "name": "Cappuccino", "price": 4.50 },
          "quantity": 1,
          "selectedOptions": { "size": "large", "milk": "oat" }
        }
      ],
      "location": {
        "id": "loc_001",
        "name": "123 Main Street",
        "estimatedTime": 8
      },
      "paymentMethods": [
        { "id": "pm_001", "label": "Visa ••4242", "type": "card" }
      ]
    },
    "displayMode": "fullscreen",
    "dismissable": true
  }
}
```

---

### intentflow.transition

Updates the state of an active Flow.

```typescript
interface TransitionPayload {
  // Target Flow
  instanceId: string

  // State change
  toState: string                       // New state name
  context?: Record<string, unknown>     // Updated context (merged with existing)

  // Optional follow-up
  followUp?: {
    intentId: string                    // Suggested next Flow
    props?: Record<string, unknown>     // Pre-populated props
  }
}
```

**Example:**

```json
{
  "type": "CUSTOM",
  "name": "intentflow.transition",
  "value": {
    "instanceId": "flow_abc123",
    "toState": "confirmed",
    "context": {
      "orderId": "order_789",
      "confirmationNumber": "CF-12345"
    },
    "followUp": {
      "intentId": "order.track",
      "props": { "orderId": "order_789" }
    }
  }
}
```

---

### intentflow.props_update

Patches props of an active Flow (for streaming/real-time updates).

```typescript
interface PropsUpdatePayload {
  // Target Flow
  instanceId: string

  // Props changes (shallow merge)
  patch?: Record<string, unknown>

  // Or deep patch operations
  operations?: PatchOperation[]
}

interface PatchOperation {
  op: 'set' | 'delete' | 'append' | 'prepend'
  path: string      // JSON path, e.g., "items[0].quantity"
  value?: unknown   // Value for set/append/prepend
}
```

**Example (shallow patch):**

```json
{
  "type": "CUSTOM",
  "name": "intentflow.props_update",
  "value": {
    "instanceId": "flow_track123",
    "patch": {
      "status": "ready",
      "estimatedTime": 0
    }
  }
}
```

**Example (deep patch):**

```json
{
  "type": "CUSTOM",
  "name": "intentflow.props_update",
  "value": {
    "instanceId": "flow_abc123",
    "operations": [
      { "op": "set", "path": "items[0].quantity", "value": 2 },
      { "op": "append", "path": "items", "value": { "item": {...}, "quantity": 1 } }
    ]
  }
}
```

---

### intentflow.dismiss

Removes a Flow from display.

```typescript
interface DismissPayload {
  // Target Flow
  instanceId: string

  // Reason for dismissal
  reason: 'completed' | 'cancelled' | 'replaced' | 'timeout' | 'error'

  // Optional result data
  result?: Record<string, unknown>
}
```

**Example:**

```json
{
  "type": "CUSTOM",
  "name": "intentflow.dismiss",
  "value": {
    "instanceId": "flow_abc123",
    "reason": "completed",
    "result": {
      "orderId": "order_789",
      "total": 5.25
    }
  }
}
```

---

### intentflow.error

Reports an IntentFlow-specific error. For general agent errors, use AG-UI's `RUN_ERROR` event.

```typescript
interface ErrorPayload {
  // Error identification
  code: ErrorCode
  message: string         // Human-readable description

  // Context
  instanceId?: string     // Related Flow, if any

  // Details
  details?: Record<string, unknown>

  // Recovery options
  recoverable: boolean
  retryAfter?: number     // Seconds until retry is appropriate
}

type ErrorCode =
  | 'INVALID_PROPS'
  | 'INVALID_TRANSITION'
  | 'FLOW_NOT_FOUND'
  | 'INSTANCE_NOT_FOUND'
  | 'PERMISSION_DENIED'
  | 'HYDRATION_FAILED'
  | 'MUTATION_FAILED'
```

**Example:**

```json
{
  "type": "CUSTOM",
  "name": "intentflow.error",
  "value": {
    "code": "MUTATION_FAILED",
    "message": "Payment declined by processor",
    "instanceId": "flow_abc123",
    "details": {
      "processorCode": "insufficient_funds",
      "processorMessage": "Card declined"
    },
    "recoverable": true
  }
}
```

---

### intentflow.action

Requests the client perform a platform capability.

```typescript
interface ActionPayload {
  // Action type
  action: ActionType
  config: Record<string, unknown>

  // Context
  instanceId?: string     // Related Flow, if any

  // Response handling
  responseRequired: boolean
}

type ActionType =
  | 'biometric_auth'
  | 'camera_capture'
  | 'location_request'
  | 'share'
  | 'open_url'
  | 'copy_to_clipboard'
  | 'haptic_feedback'
  | 'notification'
```

**Example:**

```json
{
  "type": "CUSTOM",
  "name": "intentflow.action",
  "value": {
    "action": "biometric_auth",
    "config": {
      "reason": "Authorize payment of $5.25",
      "fallback": "passcode"
    },
    "instanceId": "flow_abc123",
    "responseRequired": true
  }
}
```

---

### Text Messages

For conversational text, use AG-UI's `TEXT_MESSAGE_CONTENT` event:

```json
{
  "type": "TEXT_MESSAGE_CONTENT",
  "messageId": "msg_008",
  "delta": "I've placed your order for a large oat milk cappuccino."
}
```

---

## Client → Server Events

### intentflow.event

Reports a user interaction or state machine event.

```typescript
interface EventPayload {
  // Target Flow
  instanceId: string

  // Event details
  event: string                         // Event name, e.g., "CONFIRM"
  payload?: Record<string, unknown>     // Event data
}
```

**Example:**

```json
{
  "type": "CUSTOM",
  "name": "intentflow.event",
  "value": {
    "instanceId": "flow_abc123",
    "event": "CONFIRM",
    "payload": {
      "selectedPaymentId": "pm_001",
      "tip": 1.00
    }
  }
}
```

---

### User Prompts

For natural language input, use AG-UI's standard input handling. The AG-UI agent receives the prompt and IntentFlow's orchestration layer matches it to a Flow.

---

### intentflow.action_response

Returns result of an action request.

```typescript
interface ActionResponsePayload {
  // Correlation
  actionId: string     // ID from the action request

  // Result
  success: boolean
  result?: Record<string, unknown>
  error?: {
    code: string
    message: string
  }
}
```

**Example:**

```json
{
  "type": "CUSTOM",
  "name": "intentflow.action_response",
  "value": {
    "actionId": "action_007",
    "success": true,
    "result": {
      "authenticated": true,
      "method": "face_id"
    }
  }
}
```

---

### intentflow.dismiss_request

Client requests to dismiss a Flow.

```typescript
interface DismissRequestPayload {
  // Target Flow
  instanceId: string

  // Reason
  reason: 'user_cancelled' | 'navigation' | 'timeout'
}
```

**Example:**

```json
{
  "type": "CUSTOM",
  "name": "intentflow.dismiss_request",
  "value": {
    "instanceId": "flow_abc123",
    "reason": "user_cancelled"
  }
}
```

---

## State Synchronization

AG-UI provides state synchronization via `STATE_SNAPSHOT` and `STATE_DELTA` events. IntentFlow uses these for Flow instance state:

```json
{
  "type": "STATE_SNAPSHOT",
  "snapshot": {
    "activeFlows": {
      "flow_abc123": {
        "intentId": "order.place",
        "state": "review",
        "props": {...}
      }
    }
  }
}
```

---

## Event Ordering

### Sequence Guarantees

AG-UI provides ordering guarantees for events within a run. IntentFlow adds:

1. Events for a single `instanceId` are delivered in order
2. Events across different Flow instances may interleave
3. State transitions are atomic per instance

### Idempotency

Clients should handle duplicate events gracefully:

```typescript
const processedEvents = new Set<string>()

function handleEvent(event: CustomEvent) {
  const eventId = `${event.name}-${event.value.instanceId}-${Date.now()}`
  if (processedEvents.has(eventId)) {
    return // Already processed
  }
  processedEvents.add(eventId)
  // Process event...
}
```

---

## Schema Validation

IntentFlow uses Zod schemas for type-safe validation of custom event payloads:

```typescript
// Importing schemas for validation
import {
  renderPayloadSchema,
  transitionPayloadSchema,
  eventPayloadSchema,
  // ...
} from '@intentflow/core'

// Validate incoming IntentFlow custom event
function handleCustomEvent(event: AGUICustomEvent) {
  if (event.name === 'intentflow.render') {
    const result = renderPayloadSchema.safeParse(event.value)
    if (!result.success) {
      throw new FlowError('INVALID_PAYLOAD', result.error)
    }
    return handleRender(result.data)
  }
  // ... handle other event types
}
```

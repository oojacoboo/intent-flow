# Protocol Messages

This document specifies all message types in the IntentFlow Protocol.

## Server → Client Messages

### RENDER

Instructs the client to display a Flow.

```typescript
interface RenderMessage {
  type: 'RENDER'
  messageId: string
  timestamp: string
  version: '1.0'

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
  streaming?: boolean             // Expect PROPS_UPDATE messages
  dismissable?: boolean           // User can dismiss without completing (default: true)
}
```

**Example:**

```json
{
  "type": "RENDER",
  "messageId": "msg_001",
  "timestamp": "2025-01-15T10:30:00Z",
  "version": "1.0",
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
```

---

### TRANSITION

Updates the state of an active Flow.

```typescript
interface TransitionMessage {
  type: 'TRANSITION'
  messageId: string
  timestamp: string
  version: '1.0'

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
  "type": "TRANSITION",
  "messageId": "msg_002",
  "timestamp": "2025-01-15T10:30:05Z",
  "version": "1.0",
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
```

---

### PROPS_UPDATE

Patches props of an active Flow (for streaming/real-time updates).

```typescript
interface PropsUpdateMessage {
  type: 'PROPS_UPDATE'
  messageId: string
  timestamp: string
  version: '1.0'

  // Target Flow
  instanceId: string

  // Props changes (shallow merge)
  patch: Record<string, unknown>

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
  "type": "PROPS_UPDATE",
  "messageId": "msg_003",
  "timestamp": "2025-01-15T10:30:10Z",
  "version": "1.0",
  "instanceId": "flow_track123",
  "patch": {
    "status": "ready",
    "estimatedTime": 0
  }
}
```

**Example (deep patch):**

```json
{
  "type": "PROPS_UPDATE",
  "messageId": "msg_004",
  "timestamp": "2025-01-15T10:30:15Z",
  "version": "1.0",
  "instanceId": "flow_abc123",
  "operations": [
    { "op": "set", "path": "items[0].quantity", "value": 2 },
    { "op": "append", "path": "items", "value": { "item": {...}, "quantity": 1 } }
  ]
}
```

---

### DISMISS

Removes a Flow from display.

```typescript
interface DismissMessage {
  type: 'DISMISS'
  messageId: string
  timestamp: string
  version: '1.0'

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
  "type": "DISMISS",
  "messageId": "msg_005",
  "timestamp": "2025-01-15T10:30:20Z",
  "version": "1.0",
  "instanceId": "flow_abc123",
  "reason": "completed",
  "result": {
    "orderId": "order_789",
    "total": 5.25
  }
}
```

---

### ERROR

Reports an error condition.

```typescript
interface ErrorMessage {
  type: 'ERROR'
  messageId: string
  timestamp: string
  version: '1.0'

  // Error identification
  code: ErrorCode
  message: string         // Human-readable description

  // Context
  instanceId?: string     // Related Flow, if any
  inReplyTo?: string      // Message that caused the error

  // Details
  details?: Record<string, unknown>

  // Recovery options
  recoverable: boolean
  retryAfter?: number     // Seconds until retry is appropriate
}

type ErrorCode =
  | 'INVALID_MESSAGE'
  | 'INVALID_PROPS'
  | 'INVALID_TRANSITION'
  | 'FLOW_NOT_FOUND'
  | 'INSTANCE_NOT_FOUND'
  | 'PERMISSION_DENIED'
  | 'HYDRATION_FAILED'
  | 'MUTATION_FAILED'
  | 'TIMEOUT'
  | 'INTERNAL_ERROR'
```

**Example:**

```json
{
  "type": "ERROR",
  "messageId": "msg_006",
  "timestamp": "2025-01-15T10:30:25Z",
  "version": "1.0",
  "code": "MUTATION_FAILED",
  "message": "Payment declined by processor",
  "instanceId": "flow_abc123",
  "inReplyTo": "msg_client_005",
  "details": {
    "processorCode": "insufficient_funds",
    "processorMessage": "Card declined"
  },
  "recoverable": true
}
```

---

### ACTION

Requests the client perform a platform capability.

```typescript
interface ActionMessage {
  type: 'ACTION'
  messageId: string
  timestamp: string
  version: '1.0'

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
  "type": "ACTION",
  "messageId": "msg_007",
  "timestamp": "2025-01-15T10:30:30Z",
  "version": "1.0",
  "action": "biometric_auth",
  "config": {
    "reason": "Authorize payment of $5.25",
    "fallback": "passcode"
  },
  "instanceId": "flow_abc123",
  "responseRequired": true
}
```

---

### TEXT

Sends a plain text message (for conversational context).

```typescript
interface TextMessage {
  type: 'TEXT'
  messageId: string
  timestamp: string
  version: '1.0'

  // Content
  content: string
  format?: 'plain' | 'markdown'

  // Presentation
  role: 'assistant' | 'system'
}
```

**Example:**

```json
{
  "type": "TEXT",
  "messageId": "msg_008",
  "timestamp": "2025-01-15T10:30:35Z",
  "version": "1.0",
  "content": "I've placed your order for a large oat milk cappuccino. It'll be ready in about 8 minutes.",
  "format": "plain",
  "role": "assistant"
}
```

---

## Client → Server Messages

### EVENT

Reports a user interaction or state machine event.

```typescript
interface EventMessage {
  type: 'EVENT'
  messageId: string
  timestamp: string
  version: '1.0'

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
  "type": "EVENT",
  "messageId": "msg_client_001",
  "timestamp": "2025-01-15T10:30:40Z",
  "version": "1.0",
  "instanceId": "flow_abc123",
  "event": "CONFIRM",
  "payload": {
    "selectedPaymentId": "pm_001",
    "tip": 1.00
  }
}
```

---

### PROMPT

Sends user natural language input.

```typescript
interface PromptMessage {
  type: 'PROMPT'
  messageId: string
  timestamp: string
  version: '1.0'

  // User input
  text: string

  // Optional context
  activeInstanceId?: string   // If prompt is in context of a Flow
  attachments?: Attachment[]
}

interface Attachment {
  type: 'image' | 'file' | 'location'
  data: string | Record<string, unknown>
}
```

**Example:**

```json
{
  "type": "PROMPT",
  "messageId": "msg_client_002",
  "timestamp": "2025-01-15T10:30:45Z",
  "version": "1.0",
  "text": "Actually, make that a large with oat milk"
}
```

---

### ACTION_RESPONSE

Returns result of an ACTION request.

```typescript
interface ActionResponseMessage {
  type: 'ACTION_RESPONSE'
  messageId: string
  timestamp: string
  version: '1.0'

  // Correlation
  inReplyTo: string     // messageId of ACTION request

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
  "type": "ACTION_RESPONSE",
  "messageId": "msg_client_003",
  "timestamp": "2025-01-15T10:30:50Z",
  "version": "1.0",
  "inReplyTo": "msg_007",
  "success": true,
  "result": {
    "authenticated": true,
    "method": "face_id"
  }
}
```

---

### DISMISS_REQUEST

Client requests to dismiss a Flow.

```typescript
interface DismissRequestMessage {
  type: 'DISMISS_REQUEST'
  messageId: string
  timestamp: string
  version: '1.0'

  // Target Flow
  instanceId: string

  // Reason
  reason: 'user_cancelled' | 'navigation' | 'timeout'
}
```

**Example:**

```json
{
  "type": "DISMISS_REQUEST",
  "messageId": "msg_client_004",
  "timestamp": "2025-01-15T10:30:55Z",
  "version": "1.0",
  "instanceId": "flow_abc123",
  "reason": "user_cancelled"
}
```

---

## Bidirectional Messages

### PING / PONG

Connection health check.

```typescript
interface PingMessage {
  type: 'PING'
  messageId: string
  timestamp: string
}

interface PongMessage {
  type: 'PONG'
  messageId: string
  timestamp: string
  inReplyTo: string
}
```

---

### SYNC

Synchronizes session state (recovery after disconnect).

```typescript
interface SyncRequestMessage {
  type: 'SYNC_REQUEST'
  messageId: string
  timestamp: string
  version: '1.0'

  // Client's known state
  sessionId: string
  knownInstances: Array<{
    instanceId: string
    lastMessageId: string
  }>
}

interface SyncResponseMessage {
  type: 'SYNC_RESPONSE'
  messageId: string
  timestamp: string
  version: '1.0'

  // Current state
  activeInstances: FlowInstanceState[]
  missedMessages: ProtocolMessage[]
}
```

---

## Message Ordering

### Sequence Guarantees

1. Messages for a single `instanceId` are delivered in order
2. Messages across different instances may interleave
3. `inReplyTo` establishes causal relationships

### Idempotency

Clients should handle duplicate messages gracefully:

```typescript
const processedMessages = new Set<string>()

function handleMessage(message: ProtocolMessage) {
  if (processedMessages.has(message.messageId)) {
    return // Already processed
  }
  processedMessages.add(message.messageId)
  // Process message...
}
```

---

## JSON Schema

Full JSON Schema definitions for all message types are available in the [reference documentation](../reference/protocol-schema.md).

```typescript
// Importing schemas for validation
import {
  renderMessageSchema,
  transitionMessageSchema,
  eventMessageSchema,
  // ...
} from '@intentflow/protocol'

// Validate incoming message
const result = eventMessageSchema.safeParse(rawMessage)
if (!result.success) {
  throw new ProtocolError('INVALID_MESSAGE', result.error)
}
```

# Protocol Overview

The IntentFlow Protocol is the communication contract between the server (the "Brain") and clients (the "Body"). It defines how the server instructs clients to render Flows, how clients report user interactions, and how state synchronizes across the system.

## Design Principles

### 1. Declarative, Not Imperative

The server declares **what** should be displayed, not **how** to display it.

```json
// Good: Declarative instruction
{
  "type": "RENDER",
  "intentId": "order.place",
  "props": { "items": [...] }
}

// Bad: Imperative commands
{
  "commands": [
    { "action": "createElement", "tag": "div" },
    { "action": "setText", "value": "Review Order" }
  ]
}
```

The client owns rendering. The server owns logic.

### 2. Minimal Surface Area

The protocol has few message types with clear purposes. Complexity lives in props and context, not in protocol variations.

Core message types:
- `RENDER` — Display a Flow
- `TRANSITION` — Update Flow state
- `EVENT` — User interaction occurred
- `DISMISS` — Remove a Flow
- `ERROR` — Something went wrong

### 3. Stateless Messages, Stateful Sessions

Each message is self-contained and interpretable without prior context. But messages reference session state via `instanceId` for continuity.

```json
{
  "type": "TRANSITION",
  "instanceId": "flow_abc123",
  "toState": "processing"
}
```

The client maintains local state per `instanceId`. The server is the source of truth for state transitions.

### 4. Schema-Validated

All props conform to the Flow's declared schema. Invalid props are rejected before rendering:

```typescript
// Server-side validation
const validated = flow.schema.safeParse(props)
if (!validated.success) {
  throw new ProtocolError('INVALID_PROPS', validated.error)
}
```

### 5. Transport Agnostic

The protocol doesn't mandate a transport. Implementations can use:
- **HTTP** — Request/response for simple interactions
- **WebSocket** — Bidirectional for real-time updates
- **SSE** — Server-push for streaming
- **Message Queue** — For async/decoupled systems

## Message Envelope

All protocol messages share a common envelope:

```typescript
interface ProtocolMessage {
  // Message type discriminator
  type: MessageType

  // Unique message ID for correlation
  messageId: string

  // Timestamp of message creation
  timestamp: string // ISO 8601

  // Protocol version
  version: '1.0'

  // Optional correlation to previous message
  inReplyTo?: string
}
```

## Session Model

A **session** represents an ongoing conversation between user and system. Sessions contain:

```typescript
interface Session {
  // Unique session identifier
  sessionId: string

  // User identity (if authenticated)
  userId?: string

  // Active Flow instances
  activeFlows: Map<InstanceId, FlowInstance>

  // Session-scoped context
  context: SessionContext
}

interface FlowInstance {
  instanceId: string
  intentId: string
  currentState: string
  props: Record<string, unknown>
  context: Record<string, unknown>
  createdAt: string
  updatedAt: string
}
```

Multiple Flows can be active simultaneously (e.g., a main Flow with a confirmation sub-Flow).

## Message Flow Patterns

### Pattern 1: Simple Request-Response

User makes request → Server renders Flow → User confirms → Done.

```
Client                          Server
  │                               │
  │  ──── User Prompt ────────►   │
  │                               │
  │  ◄──── RENDER ────────────    │
  │       (order.place)           │
  │                               │
  │  ──── EVENT (CONFIRM) ────►   │
  │                               │
  │  ◄──── TRANSITION ────────    │
  │       (→ processing)          │
  │                               │
  │  ◄──── TRANSITION ────────    │
  │       (→ success)             │
  │                               │
  │  ◄──── DISMISS ───────────    │
  │                               │
```

### Pattern 2: Streaming Updates

Flow receives real-time updates (e.g., order tracking).

```
Client                          Server
  │                               │
  │  ──── User Prompt ────────►   │
  │                               │
  │  ◄──── RENDER ────────────    │
  │       (order.track)           │
  │                               │
  │  ◄──── PROPS_UPDATE ──────    │  (status: preparing)
  │                               │
  │  ◄──── PROPS_UPDATE ──────    │  (status: ready)
  │                               │
  │  ──── EVENT (DISMISS) ────►   │
  │                               │
  │  ◄──── DISMISS ───────────    │
  │                               │
```

### Pattern 3: Nested Flows

Parent Flow invokes child Flow for sub-task.

```
Client                          Server
  │                               │
  │  ◄──── RENDER ────────────    │  (order.place)
  │       instanceId: flow_1      │
  │                               │
  │  ──── EVENT (ADD_ITEM) ───►   │
  │                               │
  │  ◄──── RENDER ────────────    │  (menu.browse)
  │       instanceId: flow_2      │  parent: flow_1
  │       displayMode: modal      │
  │                               │
  │  ──── EVENT (SELECT) ─────►   │  (on flow_2)
  │                               │
  │  ◄──── DISMISS ───────────    │  (flow_2)
  │                               │
  │  ◄──── PROPS_UPDATE ──────    │  (flow_1 with new item)
  │                               │
```

### Pattern 4: Error Recovery

Mutation fails, user retries.

```
Client                          Server
  │                               │
  │  ──── EVENT (CONFIRM) ────►   │
  │                               │
  │  ◄──── TRANSITION ────────    │  (→ processing)
  │                               │
  │  ◄──── TRANSITION ────────    │  (→ error)
  │       context: {              │
  │         errorMessage: "..."   │
  │       }                       │
  │                               │
  │  ──── EVENT (RETRY) ──────►   │
  │                               │
  │  ◄──── TRANSITION ────────    │  (→ processing)
  │                               │
  │  ◄──── TRANSITION ────────    │  (→ success)
  │                               │
```

## Versioning

The protocol uses semantic versioning. The `version` field in messages indicates protocol version.

```json
{
  "type": "RENDER",
  "version": "1.0",
  ...
}
```

### Compatibility Rules

- **Patch versions** (1.0.x): Bug fixes, no message changes
- **Minor versions** (1.x.0): New optional fields, backward compatible
- **Major versions** (x.0.0): Breaking changes, negotiation required

### Version Negotiation

Clients declare supported versions at connection:

```json
{
  "type": "HANDSHAKE",
  "supportedVersions": ["1.0", "1.1"],
  "preferredVersion": "1.1"
}
```

Server responds with selected version:

```json
{
  "type": "HANDSHAKE_ACK",
  "selectedVersion": "1.0",
  "serverCapabilities": ["streaming", "nested_flows"]
}
```

## Security Considerations

### Message Validation

All incoming messages are validated:

```typescript
// Server validates client events
const event = eventSchema.safeParse(message)
if (!event.success) {
  return { type: 'ERROR', code: 'INVALID_MESSAGE', details: event.error }
}

// Verify event is valid for current Flow state
if (!flow.machine.can(event.data.event)) {
  return { type: 'ERROR', code: 'INVALID_TRANSITION' }
}
```

### Authentication

Session authentication is transport-layer concern, but the protocol supports auth context:

```json
{
  "type": "RENDER",
  "intentId": "account.settings",
  "auth": {
    "userId": "user_123",
    "roles": ["customer"],
    "permissions": ["read:account", "write:account"]
  },
  ...
}
```

Flows can check permissions:

```typescript
defineFlow({
  intentId: 'account.settings',
  permissions: {
    required: ['read:account'],
  },
})
```

### Prop Sanitization

Props are validated against schemas. Clients should never trust raw prop data for:
- Rendering HTML (XSS risk)
- Constructing URLs
- Executing code

The universal component system handles sanitization internally.

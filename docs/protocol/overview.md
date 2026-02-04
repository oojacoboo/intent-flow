# Protocol Overview

IntentFlow builds on the [AG-UI Protocol](https://docs.ag-ui.com) (Agent-User Interaction Protocol) for runtime communication between server and clients. This document describes how IntentFlow extends AG-UI with Flow-specific semantics.

## Protocol Stack

```
┌─────────────────────────────────────────────────────────────────┐
│                         INTENTFLOW                              │
│        Flow orchestration, schemas, state machines, registry    │
├─────────────────────────────────────────────────────────────────┤
│                            AG-UI                                │
│        Runtime protocol: events, streaming, state sync          │
├─────────────────────────────────────────────────────────────────┤
│                            A2UI                                 │
│        Declarative UI format: JSON → components                 │
├─────────────────────────────────────────────────────────────────┤
│                    TRANSPORT (MCP / HTTP)                       │
└─────────────────────────────────────────────────────────────────┘
```

IntentFlow doesn't define its own wire protocol—it uses AG-UI for the runtime layer and A2UI for UI component format.

## What AG-UI Provides

AG-UI handles the fundamental agent↔frontend communication:

- **Event streaming** — Server pushes events to client
- **State synchronization** — Consistent state across agent runs
- **Bidirectional messaging** — Client can send events back
- **Run lifecycle** — Start, progress, completion semantics

See the [AG-UI documentation](https://docs.ag-ui.com) for the full protocol specification.

## What IntentFlow Adds

IntentFlow extends AG-UI with Flow-specific concepts:

| IntentFlow Concept | Built On |
|-------------------|----------|
| **Flow Registry** | Constrains what AG-UI agents can invoke |
| **Intent Matching** | Routes user input to specific Flows |
| **Hydration** | Populates Flow props before rendering |
| **State Machines** | XState machines govern Flow transitions |
| **Schemas** | Zod schemas validate Flow props |

## Design Principles

### 1. Declarative, Not Imperative

The server declares **what** should be displayed, not **how** to display it:

```json
// IntentFlow sends AG-UI CUSTOM events with declarative payloads
{
  "type": "CUSTOM",
  "name": "intentflow.render",
  "value": {
    "intentId": "order.place",
    "props": { "items": [...] }
  }
}
```

The client owns rendering. The server owns logic.

### 2. AG-UI Events + IntentFlow Semantics

IntentFlow uses AG-UI's `CUSTOM` event type for Flow-specific operations:

- `intentflow.render` — Display a Flow
- `intentflow.transition` — Update Flow state
- `intentflow.props_update` — Patch props (streaming)
- `intentflow.dismiss` — Remove a Flow

### 3. Stateless Messages, Stateful Sessions

AG-UI provides `threadId` and `runId` for session continuity. IntentFlow adds `instanceId` to track individual Flow instances within a session.

```json
{
  "type": "CUSTOM",
  "name": "intentflow.transition",
  "value": {
    "instanceId": "flow_abc123",
    "toState": "processing"
  }
}
```

### 4. Schema-Validated

All props conform to the Flow's declared Zod schema. Invalid props are rejected before rendering:

```typescript
// Server-side validation
const validated = flow.schema.safeParse(props)
if (!validated.success) {
  throw new FlowError('INVALID_PROPS', validated.error)
}
```

### 5. Transport via AG-UI

AG-UI supports multiple transports:
- **HTTP + SSE** — Server-sent events for streaming
- **WebSocket** — Bidirectional real-time
- **MCP** — Model Context Protocol integration

IntentFlow inherits these transport options from AG-UI.

## Message Structure

IntentFlow events are wrapped in AG-UI's event envelope:

```typescript
// AG-UI base event (from AG-UI protocol)
interface BaseEvent {
  type: string        // AG-UI event type
  timestamp?: number  // Unix timestamp
}

// IntentFlow CUSTOM events add:
interface IntentFlowEvent extends BaseEvent {
  type: 'CUSTOM'
  name: string        // e.g., 'intentflow.render'
  value: unknown      // Flow-specific payload
}
```

The `value` field contains IntentFlow-specific data (props, state transitions, etc.).

## Session Model

IntentFlow sessions map to AG-UI's thread and run concepts:

```typescript
// AG-UI provides thread/run semantics
interface AGUIContext {
  threadId: string    // Conversation thread (AG-UI)
  runId: string       // Current agent run (AG-UI)
}

// IntentFlow adds Flow instance tracking
interface IntentFlowSession extends AGUIContext {
  // User identity (if authenticated)
  userId?: string

  // Active Flow instances within this thread
  activeFlows: Map<InstanceId, FlowInstance>

  // Session-scoped context
  context: SessionContext
}

interface FlowInstance {
  instanceId: string            // Unique Flow instance ID
  intentId: string              // Flow type (e.g., 'order.place')
  currentState: string          // XState machine state
  props: Record<string, unknown>
  context: Record<string, unknown>
  createdAt: string
  updatedAt: string
}
```

Multiple Flows can be active simultaneously within a single AG-UI thread.

## Message Flow Patterns

### Pattern 1: Simple Request-Response

User makes request → Server renders Flow → User confirms → Done.

```
Client                          Server
  │                               │
  │  ──── User Prompt ────────►   │
  │                               │
  │  ◄──── RUN_STARTED ───────    │  (AG-UI)
  │                               │
  │  ◄──── CUSTOM ────────────    │  (intentflow.render)
  │       (order.place)           │
  │                               │
  │  ──── CUSTOM ─────────────►   │  (intentflow.event: CONFIRM)
  │                               │
  │  ◄──── CUSTOM ────────────    │  (intentflow.transition → processing)
  │                               │
  │  ◄──── CUSTOM ────────────    │  (intentflow.transition → success)
  │                               │
  │  ◄──── CUSTOM ────────────    │  (intentflow.dismiss)
  │                               │
  │  ◄──── RUN_FINISHED ──────    │  (AG-UI)
  │                               │
```

### Pattern 2: Streaming Updates

Flow receives real-time updates (e.g., order tracking). AG-UI's streaming capability enables this.

```
Client                          Server
  │                               │
  │  ──── User Prompt ────────►   │
  │                               │
  │  ◄──── RUN_STARTED ───────    │  (AG-UI)
  │                               │
  │  ◄──── CUSTOM ────────────    │  (intentflow.render: order.track)
  │                               │
  │  ◄──── CUSTOM ────────────    │  (intentflow.props_update: preparing)
  │                               │
  │  ◄──── CUSTOM ────────────    │  (intentflow.props_update: ready)
  │                               │
  │  ──── CUSTOM ─────────────►   │  (intentflow.event: DISMISS)
  │                               │
  │  ◄──── CUSTOM ────────────    │  (intentflow.dismiss)
  │                               │
  │  ◄──── RUN_FINISHED ──────    │  (AG-UI)
  │                               │
```

### Pattern 3: Nested Flows

Parent Flow invokes child Flow for sub-task.

```
Client                          Server
  │                               │
  │  ◄──── CUSTOM ────────────    │  (intentflow.render: order.place)
  │       instanceId: flow_1      │
  │                               │
  │  ──── CUSTOM ─────────────►   │  (intentflow.event: ADD_ITEM)
  │                               │
  │  ◄──── CUSTOM ────────────    │  (intentflow.render: menu.browse)
  │       instanceId: flow_2      │  parent: flow_1
  │       displayMode: modal      │
  │                               │
  │  ──── CUSTOM ─────────────►   │  (intentflow.event: SELECT on flow_2)
  │                               │
  │  ◄──── CUSTOM ────────────    │  (intentflow.dismiss: flow_2)
  │                               │
  │  ◄──── CUSTOM ────────────    │  (intentflow.props_update: flow_1)
  │                               │
```

### Pattern 4: Error Recovery

Mutation fails, user retries.

```
Client                          Server
  │                               │
  │  ──── CUSTOM ─────────────►   │  (intentflow.event: CONFIRM)
  │                               │
  │  ◄──── CUSTOM ────────────    │  (intentflow.transition → processing)
  │                               │
  │  ◄──── CUSTOM ────────────    │  (intentflow.transition → error)
  │       context: {              │
  │         errorMessage: "..."   │
  │       }                       │
  │                               │
  │  ──── CUSTOM ─────────────►   │  (intentflow.event: RETRY)
  │                               │
  │  ◄──── CUSTOM ────────────    │  (intentflow.transition → processing)
  │                               │
  │  ◄──── CUSTOM ────────────    │  (intentflow.transition → success)
  │                               │
```

## Versioning

IntentFlow follows semantic versioning for its custom event schemas. AG-UI protocol versioning is handled separately by the AG-UI specification.

### IntentFlow Event Versions

```json
{
  "type": "CUSTOM",
  "name": "intentflow.render",
  "value": {
    "version": "1.0",
    "intentId": "order.place",
    ...
  }
}
```

### Compatibility Rules

- **Patch versions** (1.0.x): Bug fixes, no schema changes
- **Minor versions** (1.x.0): New optional fields, backward compatible
- **Major versions** (x.0.0): Breaking changes require client updates

## Security Considerations

### Message Validation

All incoming events are validated at both AG-UI and IntentFlow levels:

```typescript
// Server validates IntentFlow custom event payloads
const payload = renderPayloadSchema.safeParse(event.value)
if (!payload.success) {
  // Send AG-UI error event
  return { type: 'ERROR', message: 'Invalid IntentFlow payload' }
}

// Verify event is valid for current Flow state
if (!flow.machine.can(payload.data.event)) {
  return { type: 'ERROR', message: 'Invalid state transition' }
}
```

### Authentication

Authentication is handled at the AG-UI/transport layer. IntentFlow adds Flow-level permission checking:

```typescript
defineFlow({
  intentId: 'account.settings',
  permissions: {
    required: ['read:account'],
  },
})
```

The server validates permissions before rendering:

```typescript
// Check permissions before hydrating
if (!hasPermissions(user, flow.permissions.required)) {
  throw new FlowError('PERMISSION_DENIED')
}
```

### Prop Sanitization

Props are validated against Zod schemas. Clients should never trust raw prop data for:
- Rendering HTML (XSS risk)
- Constructing URLs
- Executing code

The universal component system handles sanitization internally.

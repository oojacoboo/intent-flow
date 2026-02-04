# IntentFlow Documentation

IntentFlow is a framework for building AI-orchestrated applications. It connects natural language understanding to type-safe UI rendering, built on top of the [AG-UI Protocol](https://docs.ag-ui.com) (for agent↔frontend communication) and [A2UI](https://github.com/nickarls/A2UI) (for declarative UI format).

## Quick Navigation

### Getting Started
- [Philosophy](./philosophy.md) — Why IntentFlow exists and the problems it solves

### Core Concepts
- [Flows](./concepts/flows.md) — The fundamental building block
- [Intents](./concepts/intents.md) — Mapping natural language to actions
- [Registry](./concepts/registry.md) — Flow discovery and management
- [Rendering](./concepts/rendering.md) — Universal UI across platforms

### Protocol Specification
- [Protocol Overview](./protocol/overview.md) — Design principles and session model
- [Messages](./protocol/messages.md) — Complete message type reference
- [Transport](./protocol/transport.md) — HTTP, WebSocket, SSE, and MCP
- [Errors](./protocol/errors.md) — Error handling patterns

### Guides
- [Building Flows](./guides/building-flows.md) — Step-by-step Flow development
- [AI Orchestration](./guides/ai-orchestration.md) — Connecting the AI layer
- [MCP Integration](./guides/mcp-integration.md) — Exposing Flows to Claude/ChatGPT

### Reference
- Protocol Schema (coming soon)
- Flow Definition API (coming soon)
- Glossary (coming soon)

## Architecture Overview

### Protocol Stack

```
┌─────────────────────────────────────────────────────────────────┐
│                         INTENTFLOW                              │
│           Flows, Schemas (Zod), State Machines (XState)         │
├─────────────────────────────────────────────────────────────────┤
│                            AG-UI                                │
│           Agent↔User runtime protocol (events, streaming)       │
├─────────────────────────────────────────────────────────────────┤
│                            A2UI                                 │
│           Declarative UI format (JSON → components)             │
├─────────────────────────────────────────────────────────────────┤
│                    TRANSPORT (MCP / HTTP)                       │
└─────────────────────────────────────────────────────────────────┘
```

### Data Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                          USER INPUT                             │
│                    "Order a large latte"                        │
└───────────────────────────────┬─────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                      AI ORCHESTRATION                           │
│                                                                 │
│  Intent Matching ──► Entity Extraction ──► Flow Selection       │
│                                                                 │
└───────────────────────────────┬─────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                         SERVER                                  │
│                                                                 │
│  Registry ──► Hydration ──► State Machine ──► AG-UI Events      │
│                                                                 │
└───────────────────────────────┬─────────────────────────────────┘
                                │
                          AG-UI Protocol
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                         CLIENTS                                 │
│                                                                 │
│   ┌─────────┐      ┌─────────┐      ┌─────────┐                │
│   │ Mobile  │      │   Web   │      │   MCP   │                │
│   │ (React  │      │ (React  │      │ (HTML   │                │
│   │ Native) │      │  DOM)   │      │ render) │                │
│   └─────────┘      └─────────┘      └─────────┘                │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Key Concepts

| Concept | Description |
|---------|-------------|
| **Flow** | A self-contained unit of functionality with schema, state machine, and UI |
| **Intent** | The mapping from natural language to a specific Flow |
| **Registry** | The catalog of all available Flows (constrains AI) |
| **AG-UI** | The runtime protocol for agent↔frontend communication |
| **A2UI** | The declarative format for UI components |
| **Hydration** | The process of fetching data to populate Flow props |

## Design Principles

1. **Flows, not pages** — Organize around capabilities, not routes
2. **Constrained AI** — AI can only invoke registered Flows
3. **Protocol over implementation** — Strict contract, flexible clients
4. **Universal by default** — One Flow, multiple platforms

## Example Flow

```typescript
// definition.ts
export const trackOrderFlow = defineFlow({
  intentId: 'order.track',

  schema: z.object({
    orderId: z.string(),
    status: z.enum(['received', 'preparing', 'ready']),
    items: z.array(orderItemSchema),
    estimatedReadyTime: z.string().datetime().nullable(),
  }),

  machine: createMachine({
    id: 'trackOrder',
    initial: 'viewing',
    states: {
      viewing: {
        on: {
          REFRESH: 'refreshing',
          DISMISS: 'done',
        },
      },
      refreshing: {
        on: {
          SUCCESS: 'viewing',
          ERROR: 'viewing',
        },
      },
      done: { type: 'final' },
    },
  }),
})
```

```typescript
// AG-UI event with IntentFlow custom payload
{
  "type": "CUSTOM",
  "name": "intentflow.render",
  "value": {
    "intentId": "order.track",
    "instanceId": "flow_123",
    "props": {
      "orderId": "order_789",
      "status": "preparing",
      "items": [{ "name": "Latte", "quantity": 1, "price": 4.50 }],
      "estimatedReadyTime": "2025-01-15T10:30:00Z"
    },
    "displayMode": "fullscreen"
  }
}
```

## Status

IntentFlow is currently in the specification and design phase. The documentation describes the target architecture and APIs.

Contributions and feedback welcome.

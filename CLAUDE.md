# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

IntentFlow is a framework specification for **Intent-Driven Architecture** - a framework that allows AI agents to orchestrate applications by mapping natural language intents to pre-defined UI Flows.

**Built On:** IntentFlow uses [AG-UI](https://docs.ag-ui.com) (Agent-User Interaction Protocol) for runtime communication and [A2UI](https://github.com/nickarls/A2UI) for declarative UI format.

**Current State:** Specification/documentation phase. See `/docs` for comprehensive documentation.

## Documentation Structure

```
/docs
├── README.md                 # Documentation index
├── philosophy.md             # Why IntentFlow exists
├── concepts/
│   ├── flows.md              # The Flow primitive
│   ├── intents.md            # Intent matching and extraction
│   ├── registry.md           # Flow discovery and registration
│   └── rendering.md          # Universal rendering model
├── protocol/
│   ├── overview.md           # Protocol design principles
│   ├── messages.md           # Message type reference
│   ├── transport.md          # HTTP, WebSocket, SSE, MCP
│   └── errors.md             # Error handling
└── guides/
    ├── building-flows.md     # Step-by-step Flow development
    ├── ai-orchestration.md   # Connecting the AI layer
    └── mcp-integration.md    # Claude/ChatGPT integration
```

## Core Concepts

### The Flow Primitive
A Flow is a portable unit of functionality that encapsulates:
1. **Intent Schema** (Zod) - Data required to initialize the interaction
2. **State Machine** (XState) - Valid states and transitions
3. **Component** (React) - Platform-specific UI

### Protocol Stack

```
IntentFlow (Flows, Schemas, State Machines, Registry)
    ↓
AG-UI (Agent↔User runtime protocol)
    ↓
A2UI (Declarative UI format)
    ↓
Transport (MCP / A2A / HTTP)
```

| Layer | Role | Implementation |
|-------|------|----------------|
| **IntentFlow** | Flow orchestration | Schemas (Zod), state machines (XState), registry |
| **AG-UI** | Runtime protocol | Event streaming, state sync, bidirectional communication |
| **A2UI** | UI format | Declarative JSON → native components |
| **Transport** | Wire protocol | MCP, HTTP, WebSocket, SSE |

### What IntentFlow Adds

IntentFlow extends AG-UI/A2UI with:
- **Flows** - Self-contained units bundling schema + state machine + component
- **Registry** - Catalog of available Flows that constrains AI
- **Hydration** - Data fetching layer to populate Flow props
- **Intent Matching** - Natural language → Flow selection

## Design Principles

- **Constrained AI** - Agent limited to Flows in the Registry
- **Platform Agnostic** - One Flow renders on mobile, web, and MCP
- **Standards-Based** - Built on AG-UI and A2UI protocols
- **Flows Not Pages** - Capabilities invoked by intent, not navigation

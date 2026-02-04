# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

IntentFlow is a framework specification for **Intent-Driven Architecture** - a protocol that allows AI agents to orchestrate applications by mapping natural language intents to pre-defined UI flows.

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

### Three-Layer Architecture

| Layer | Role | Implementation |
|-------|------|----------------|
| **Brain (Server)** | Orchestration | AI matching, hydration, state management |
| **Protocol (Wire)** | Transport | JSON messages (RENDER, TRANSITION, EVENT, etc.) |
| **Body (Client)** | Rendering | React Native, React DOM, or MCP HTML |

### Protocol Message Example
```json
{
  "type": "RENDER",
  "intentId": "order.place",
  "instanceId": "flow_abc123",
  "props": { ... },
  "displayMode": "fullscreen"
}
```

## Design Principles

- **Constrained AI** - Agent limited to Flows in the Registry
- **Platform Agnostic** - One Flow renders on mobile, web, and MCP
- **Protocol Over Implementation** - Strict contract, flexible clients
- **Flows Not Pages** - Capabilities invoked by intent, not navigation

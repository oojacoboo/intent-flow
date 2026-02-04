# Philosophy

## The Problem

We are entering the age of AI-powered applications, but our architectural patterns haven't caught up.

**Chatbots are too loose.** They generate text responses, sometimes with ephemeral widgets or "hallucinated" UI that has no real connection to your business logic. Users don't trust them for real transactions.

**Traditional apps are too rigid.** They force users through predetermined navigation hierarchies. Every interaction requires knowing where something lives in a menu structure.

Both approaches treat AI as an add-on—a chatbot bolted onto an existing app, or an autocomplete feature sprinkled into forms.

## The IntentFlow Approach

IntentFlow proposes a third path: **Intent-Driven Architecture**.

Instead of users navigating to screens, or AI generating arbitrary responses, the AI orchestrates a curated set of pre-built experiences. The user expresses intent in natural language. The AI matches that intent to a registered **Flow**. The Flow renders with real data, real business logic, and real UI components.

```
User: "Order my usual"
  ↓
AI: Matches intent → order.place
  ↓
Server: Fetches saved preferences, constructs props
  ↓
Client: Renders <OrderFlow items={[...]} />
```

The AI cannot invent screens. It can only invoke Flows you've explicitly built and registered. This constraint is the feature—it makes AI-driven apps predictable, auditable, and safe for real business transactions.

## Core Principles

### 1. Flows, Not Pages

Traditional apps organize around routes and pages. IntentFlow organizes around **Flows**—portable units of functionality that can be summoned by intent rather than navigation.

A Flow for "Place Order" exists independently of any URL structure. It can appear in a mobile app, a web dashboard, or inside Claude via MCP—wherever the user expresses that intent.

### 2. Constrained AI

The AI layer is powerful but bounded. It has access to a **Flow Registry** that defines exactly what it can do. It cannot generate arbitrary UI, execute undefined mutations, or access data outside its permitted scope.

This isn't a limitation—it's what makes the system trustworthy for business applications.

### 3. Standards Over Reinvention

IntentFlow builds on established protocols rather than inventing new ones:

- **[AG-UI](https://docs.ag-ui.com)** — The Agent-User Interaction Protocol handles runtime communication between agents and frontends (event streaming, state synchronization, bidirectional messaging)
- **[A2UI](https://github.com/nickarls/A2UI)** — The Agent-to-User Interface format provides a declarative JSON structure for UI components

This separation means:
- Business logic stays on the server (update without app releases)
- UI stays on the client (native performance, platform-appropriate rendering)
- The protocols bridge them (stable contract, widely adopted)

### 4. Universal by Default

A Flow definition should render appropriately whether the host is:
- A native mobile app (React Native)
- A web browser (React DOM)
- An MCP-connected agent (HTML/Markdown)

Write once, render everywhere—not through lowest-common-denominator components, but through a universal component system that compiles to native primitives per platform.

## What IntentFlow Is Not

- **Not a wire protocol.** It uses [AG-UI](https://docs.ag-ui.com) for agent↔frontend communication.
- **Not a UI format.** It uses [A2UI](https://github.com/nickarls/A2UI) for declarative UI components.
- **Not a UI component library.** You bring your own components (though we provide patterns).
- **Not an AI model.** You bring your own LLM (Claude, GPT, local models).
- **Not a backend framework.** You bring your own API (GraphQL recommended, REST supported).

IntentFlow is the **orchestration layer**—the Flows, schemas, state machines, and registry that connect AI intent recognition to type-safe UI rendering. It sits on top of AG-UI and A2UI, adding the structure needed for constrained, predictable AI-driven applications.

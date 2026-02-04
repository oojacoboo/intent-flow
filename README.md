# IntentFlow

### Map Natural Language to UI Flows.

**A Framework for AI-Orchestrated Applications.**

---

## 💡 The Philosophy

We are entering the age of the **AI Runtime**, but our current UI paradigms are stuck in the past.

* **Chatbots are too vague.** They rely on ephemeral text or "hallucinated" widgets that lack deep integration with your business logic.
* **Traditional Apps are too rigid.** They require users to navigate complex hierarchies manually.

**IntentFlow** introduces a third way: **Intent-Driven Architecture.**
It allows an AI Agent to "drive" a strict, high-fidelity application by mapping vague natural language to precise, pre-defined workflows.

## 🌊 What is a "Flow"?

The core primitive of this framework is the **Flow**.

A Flow is a packaged unit of functionality—like a "Payment," a "Profile Update," or a "Maintenance Request." Unlike a static web page, a Flow is portable. It exists independently of your app's routing table, waiting to be summoned by an Agent.

Each Flow encapsulates:

1. **Intent Schema:** The data required to initialize the interaction.
2. **Visual State:** The human-designed UI components (Native or Web).
3. **Business Logic:** The state machine that governs valid transitions and mutations.

## 🏗 The Architecture

IntentFlow is not a UI library. It is a **Protocol** that separates the "Brain" from the "Body."

### 1. The Brain (Server)

The Agent acts as the orchestration engine.

* It listens to user prompts (e.g., "Pay my rent").
* It scans the **Flow Registry** to find a matching capability.
* It hydrates the Flow with data from your database (e.g., pulling the current balance).
* It emits a **Protocol Instruction** (JSON)—not HTML or Code.

### 2. The Protocol (The Wire)

The connection between the Agent and the User is an abstract JSON definition. This ensures security and stability. The AI cannot "invent" new screens; it can only request to render screens that you have explicitly built and approved.

### 3. The Body (Universal Client)

Your application (whether it's a Native iOS App, a Web Dashboard, or an MCP Server) listens for these instructions.

* When it receives a `RENDER` instruction, it looks up the corresponding component in its local library.
* It renders the **Native UI** for that platform.
* On **Mobile**, it renders a React Native view.
* On **Web**, it renders a DOM element.
* In **Chat**, it renders an HTML widget.



## 🚀 Why IntentFlow?

### For The Business

* **Brand Consistency:** Your AI Agent uses the exact same UI components as your main application. No "off-brand" chat widgets.
* **Safety:** The AI cannot hallucinate a button that performs an illegal action. It is constrained to the Flows you define.

### For The Developer

* **Write Once, Run Everywhere:** Build a "Payment Flow" once. The Agent can surface it inside your mobile app, on your website, or inside external tools like Claude/ChatGPT via MCP.
* **Separation of Concerns:** Your AI logic lives on the server. Your UI code lives on the client. The Protocol bridges them.

## 🔮 The Vision

IntentFlow aims to be the standard implementation of **Server-Driven UI (SDUI)** for the Agentic Age. We believe that in the future, applications won't be navigated by clicking links; they will be orchestrated by intents.

---

**License:** MIT

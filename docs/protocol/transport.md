# Transport

IntentFlow uses [AG-UI](https://docs.ag-ui.com) for its runtime protocol, which supports multiple transports. This document describes how IntentFlow works with each AG-UI transport option.

## AG-UI Transport Options

AG-UI supports these transports (IntentFlow inherits all of them):

| Transport | Best For | Characteristics |
|-----------|----------|-----------------|
| HTTP + SSE | Most applications | Streaming server events, HTTP for client messages |
| WebSocket | Real-time apps | Full bidirectional, persistent connection |
| MCP | AI agent integration | Model Context Protocol for Claude/ChatGPT |

See the [AG-UI Transport documentation](https://docs.ag-ui.com/concepts/streaming) for full details.

## HTTP + SSE Transport

The recommended transport for most IntentFlow applications.

### AG-UI HTTP Pattern

AG-UI uses HTTP POST for client→server and SSE for server→client:

```
POST /api/agent/run         # Start agent run (AG-UI)
GET  /api/agent/events      # SSE stream for events (AG-UI)
POST /api/intent/event      # IntentFlow custom events
```

### Starting a Run

```typescript
// Client sends prompt via AG-UI
POST /api/agent/run
Content-Type: application/json

{
  "threadId": "thread_123",
  "input": "I want to order a large cappuccino"
}

// Server returns run ID
HTTP/1.1 200 OK
Content-Type: application/json

{
  "runId": "run_456"
}

// Client connects to SSE stream
GET /api/agent/events?runId=run_456
Accept: text/event-stream
```

### Receiving IntentFlow Events

Events arrive via the SSE stream:

```
event: custom
data: {"type":"CUSTOM","name":"intentflow.render","value":{"intentId":"order.place","instanceId":"flow_abc123","props":{...}}}

event: custom
data: {"type":"CUSTOM","name":"intentflow.transition","value":{"instanceId":"flow_abc123","toState":"confirmed"}}
```

### Sending Flow Events

```typescript
// Client sends IntentFlow event
POST /api/intent/event
Content-Type: application/json

{
  "runId": "run_456",
  "instanceId": "flow_abc123",
  "event": "CONFIRM",
  "payload": { "selectedPaymentId": "pm_001" }
}

// Server acknowledges
HTTP/1.1 200 OK
```

### Async Operations

For long-running mutations, return `202 Accepted`:

```typescript
// Response (async mutation)
HTTP/1.1 202 Accepted
Content-Type: application/json

{
  "type": "TRANSITION",
  "instanceId": "flow_abc123",
  "toState": "processing",
  "pollUrl": "/api/intent/instance/flow_abc123"
}

// Client polls for completion
GET /api/intent/instance/flow_abc123

// Eventually returns
{
  "type": "TRANSITION",
  "toState": "confirmed",
  "context": { "orderId": "order_789" }
}
```

### HTTP Headers

```
X-IntentFlow-Version: 1.0
X-IntentFlow-Session: session_123
X-IntentFlow-Instance: flow_abc123
Authorization: Bearer <token>
```

## WebSocket Transport

Preferred for interactive applications with real-time updates. Uses AG-UI's WebSocket protocol.

### Connection Lifecycle

```typescript
// 1. Connect to AG-UI WebSocket endpoint
const ws = new WebSocket('wss://api.example.com/agent/ws')

// 2. AG-UI handshake
ws.onopen = () => {
  ws.send(JSON.stringify({
    type: 'connect',
    threadId: 'thread_123',
    auth: { token: 'Bearer ...' }
  }))
}

// 3. Receive connection acknowledgment
ws.onmessage = (event) => {
  const message = JSON.parse(event.data)
  if (message.type === 'connected') {
    console.log('Connected to AG-UI')
  }
}

// 4. Send IntentFlow events
function sendFlowEvent(instanceId: string, event: string, payload?: object) {
  ws.send(JSON.stringify({
    type: 'CUSTOM',
    name: 'intentflow.event',
    value: {
      instanceId,
      event,
      payload
    }
  }))
}
```

### Message Multiplexing

WebSocket connections handle multiple concurrent Flows:

```typescript
// Client maintains map of active instances
const activeFlows = new Map<string, FlowState>()

ws.onmessage = (event) => {
  const message = JSON.parse(event.data)

  switch (message.type) {
    case 'RENDER':
      activeFlows.set(message.instanceId, {
        intentId: message.intentId,
        props: message.props,
        state: message.initialState
      })
      renderFlow(message)
      break

    case 'TRANSITION':
      const flow = activeFlows.get(message.instanceId)
      if (flow) {
        flow.state = message.toState
        Object.assign(flow.context, message.context)
        updateFlowState(message)
      }
      break

    case 'DISMISS':
      activeFlows.delete(message.instanceId)
      removeFlow(message)
      break
  }
}
```

### Reconnection

Handle disconnects gracefully:

```typescript
class IntentFlowConnection {
  private ws: WebSocket | null = null
  private reconnectAttempts = 0
  private maxReconnectAttempts = 5
  private pendingMessages: ProtocolMessage[] = []

  connect() {
    this.ws = new WebSocket(this.url)

    this.ws.onclose = () => {
      if (this.reconnectAttempts < this.maxReconnectAttempts) {
        const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000)
        setTimeout(() => this.reconnect(), delay)
        this.reconnectAttempts++
      }
    }

    this.ws.onopen = () => {
      this.reconnectAttempts = 0
      this.sync()
      this.flushPendingMessages()
    }
  }

  private sync() {
    // Request state sync after reconnect
    this.send({
      type: 'SYNC_REQUEST',
      sessionId: this.sessionId,
      knownInstances: Array.from(this.activeFlows.entries()).map(
        ([instanceId, flow]) => ({
          instanceId,
          lastMessageId: flow.lastMessageId
        })
      )
    })
  }

  private flushPendingMessages() {
    for (const message of this.pendingMessages) {
      this.send(message)
    }
    this.pendingMessages = []
  }

  send(message: ProtocolMessage) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message))
    } else {
      this.pendingMessages.push(message)
    }
  }
}
```

### Heartbeat

Maintain connection health:

```typescript
// Client sends PING every 30 seconds
setInterval(() => {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({
      type: 'PING',
      messageId: generateId(),
      timestamp: new Date().toISOString()
    }))
  }
}, 30000)

// Server responds with PONG
// If no PONG received within timeout, reconnect
```

## Server-Sent Events (SSE)

Ideal for server-push scenarios where client rarely sends data.

### Setup

```typescript
// Client
const eventSource = new EventSource('/api/intent/stream?session=session_123')

eventSource.onmessage = (event) => {
  const message = JSON.parse(event.data)
  handleServerMessage(message)
}

// Separate HTTP endpoint for client messages
async function sendEvent(instanceId: string, event: string, payload?: object) {
  await fetch('/api/intent/event', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ instanceId, event, payload })
  })
}
```

### Server Implementation

```typescript
// Express example
app.get('/api/intent/stream', (req, res) => {
  const sessionId = req.query.session

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')

  // Send messages as SSE events
  const subscription = messageQueue.subscribe(sessionId, (message) => {
    res.write(`data: ${JSON.stringify(message)}\n\n`)
  })

  // Cleanup on disconnect
  req.on('close', () => {
    subscription.unsubscribe()
  })
})
```

### Event Types

SSE supports named event types:

```typescript
// Server sends typed events
res.write(`event: render\ndata: ${JSON.stringify(renderMessage)}\n\n`)
res.write(`event: transition\ndata: ${JSON.stringify(transitionMessage)}\n\n`)

// Client handles by type
eventSource.addEventListener('render', (event) => {
  handleRender(JSON.parse(event.data))
})

eventSource.addEventListener('transition', (event) => {
  handleTransition(JSON.parse(event.data))
})
```

## MCP Transport

For Model Context Protocol integrations (Claude, ChatGPT, etc.). MCP is one of AG-UI's supported transports.

### Tool Registration

IntentFlow exposes Flows as MCP tools:

```typescript
// MCP Server exposes Flows as tools
const server = new McpServer({
  name: 'coffee-shop',
  version: '1.0.0',
})

// Register each Flow as a tool
for (const flow of registry.getFlows()) {
  server.tool(
    flow.intentId.replace('.', '_'),  // MCP tool names can't have dots
    flow.meta.description,
    zodToJsonSchema(flow.extractionSchema),
    async (params) => {
      // Hydrate and render
      const props = await hydrateFlow(flow.intentId, params)
      const html = await renderFlowToHtml(flow, props)

      return {
        content: [{ type: 'text', text: html }]
      }
    }
  )
}
```

### Stateless Operation

MCP is typically stateless. Each tool call is independent:

```typescript
server.tool('order.place', '...', schema, async (params) => {
  // Create ephemeral session for this interaction
  const session = createEphemeralSession()

  // Hydrate props
  const props = await hydrateFlow('order.place', params, session)

  // Render to HTML
  const html = renderToString(<PlaceOrderFlow {...props} />)

  // For mutations, execute immediately or return confirmation
  if (props.requiresConfirmation) {
    return {
      content: [{
        type: 'text',
        text: `${html}\n\nReply "confirm" to place this order.`
      }]
    }
  }

  return { content: [{ type: 'text', text: html }] }
})
```

### Confirmation Pattern

Handle mutations via follow-up messages:

```typescript
// First call: Show confirmation
server.tool('order.place', ..., async (params) => {
  const props = await hydrateFlow('order.place', params)
  const html = renderConfirmationHtml(props)

  // Store pending order in short-lived cache
  await cache.set(`pending:${session.id}`, props, { ttl: 300 })

  return {
    content: [{
      type: 'text',
      text: html + '\n\nSay "confirm" to complete your order.'
    }]
  }
})

// Second call: Execute
server.tool('order.confirm', 'Confirm pending order', {}, async () => {
  const pending = await cache.get(`pending:${session.id}`)
  if (!pending) {
    return { content: [{ type: 'text', text: 'No pending order found.' }] }
  }

  const result = await executeOrder(pending)
  await cache.delete(`pending:${session.id}`)

  return {
    content: [{
      type: 'text',
      text: renderSuccessHtml(result)
    }]
  }
})
```

## Transport Selection Guide

```
┌─────────────────────────────────────────────────────────────┐
│                    Choose Your Transport                    │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Building a native/web app?                                 │
│    ├── Need real-time updates? ───► WebSocket (AG-UI)      │
│    └── Standard interactions? ────► HTTP + SSE (AG-UI)     │
│                                                             │
│  Building an MCP integration?                               │
│    └── AI agent tools ────────────► MCP (AG-UI adapter)    │
│                                                             │
│  Need maximum compatibility?                                │
│    └── HTTP + SSE (AG-UI default)                          │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## Security by Transport

AG-UI handles transport security. IntentFlow adds Flow-level authorization:

| Transport | Auth Mechanism | IntentFlow Considerations |
|-----------|---------------|---------------------------|
| HTTP + SSE | Bearer token in header | Validate per-request |
| WebSocket | Token in handshake | Validate on connect |
| MCP | Host-provided auth | Validate tool call permissions |

All transports should use TLS in production. See the [AG-UI security documentation](https://docs.ag-ui.com) for transport-layer security details.

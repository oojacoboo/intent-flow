# Transport

The IntentFlow Protocol is transport-agnostic. This document describes implementation patterns for common transport mechanisms.

## Transport Options

| Transport | Best For | Characteristics |
|-----------|----------|-----------------|
| HTTP | Simple interactions, MCP | Request-response, stateless |
| WebSocket | Real-time apps | Bidirectional, persistent |
| SSE | Server-push updates | Unidirectional, streaming |
| HTTP + Polling | Fallback | Compatibility, higher latency |

## HTTP Transport

Suitable for request-response patterns and MCP integrations.

### Endpoints

```
POST /api/intent/prompt     # User prompt → RENDER
POST /api/intent/event      # Flow event → TRANSITION
GET  /api/intent/instance   # Get instance state
DELETE /api/intent/instance # Dismiss request
```

### Prompt → Render

```typescript
// Request
POST /api/intent/prompt
Content-Type: application/json

{
  "sessionId": "session_123",
  "text": "I want to order a large cappuccino"
}

// Response
HTTP/1.1 200 OK
Content-Type: application/json

{
  "type": "RENDER",
  "messageId": "msg_001",
  "intentId": "order.place",
  "instanceId": "flow_abc123",
  "props": { ... },
  "displayMode": "fullscreen"
}
```

### Event → Transition

```typescript
// Request
POST /api/intent/event
Content-Type: application/json

{
  "sessionId": "session_123",
  "instanceId": "flow_abc123",
  "event": "CONFIRM",
  "payload": { "selectedPaymentId": "pm_001" }
}

// Response (synchronous mutation)
HTTP/1.1 200 OK
Content-Type: application/json

{
  "type": "TRANSITION",
  "messageId": "msg_002",
  "instanceId": "flow_abc123",
  "toState": "confirmed",
  "context": { "orderId": "order_789" }
}
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

Preferred for interactive applications with real-time updates.

### Connection Lifecycle

```typescript
// 1. Connect
const ws = new WebSocket('wss://api.example.com/intent/ws')

// 2. Handshake
ws.onopen = () => {
  ws.send(JSON.stringify({
    type: 'HANDSHAKE',
    sessionId: 'session_123',
    supportedVersions: ['1.0'],
    auth: { token: 'Bearer ...' }
  }))
}

// 3. Receive handshake acknowledgment
ws.onmessage = (event) => {
  const message = JSON.parse(event.data)
  if (message.type === 'HANDSHAKE_ACK') {
    // Connection established
    console.log('Connected, version:', message.selectedVersion)
  }
}

// 4. Exchange messages
function sendEvent(instanceId: string, event: string, payload?: object) {
  ws.send(JSON.stringify({
    type: 'EVENT',
    messageId: generateId(),
    timestamp: new Date().toISOString(),
    version: '1.0',
    instanceId,
    event,
    payload
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

For Model Context Protocol integrations (Claude, etc.).

### Tool Registration

```typescript
// MCP Server exposes Flows as tools
const server = new McpServer({
  name: 'coffee-shop',
  version: '1.0.0',
})

// Register each Flow as a tool
for (const flow of registry.getFlows()) {
  server.tool(
    flow.intentId,
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
│    ├── Need real-time updates? ───► WebSocket              │
│    └── Simple interactions? ──────► HTTP                   │
│                                                             │
│  Building an MCP integration?                               │
│    └── Always ────────────────────► MCP (stateless HTTP)   │
│                                                             │
│  Building a dashboard/monitoring UI?                        │
│    └── Server-push only? ─────────► SSE                    │
│                                                             │
│  Need fallback for restricted networks?                     │
│    └── HTTP + Polling                                       │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## Security by Transport

| Transport | Auth Mechanism | Considerations |
|-----------|---------------|----------------|
| HTTP | Bearer token in header | Standard REST security |
| WebSocket | Token in handshake | Validate on connect, not per-message |
| SSE | Token in query param or cookie | Query params may be logged |
| MCP | Host-provided auth | Depends on MCP host implementation |

All transports should use TLS in production.

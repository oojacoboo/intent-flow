# MCP Integration

This guide covers exposing IntentFlow Flows as MCP (Model Context Protocol) tools, enabling AI assistants like Claude to invoke your application's capabilities.

## Overview

MCP allows external AI agents to interact with your IntentFlow application. Each Flow becomes a tool that Claude, ChatGPT, or other MCP-compatible clients can invoke.

```
┌─────────────────┐      ┌─────────────────┐      ┌─────────────────┐
│  Claude/ChatGPT │ ──── │   MCP Server    │ ──── │   IntentFlow    │
│                 │ MCP  │   (Adapter)     │      │   Registry      │
└─────────────────┘      └─────────────────┘      └─────────────────┘
                               │
                               │ Renders HTML
                               ▼
                         ┌───────────┐
                         │  User UI  │
                         │ in Agent  │
                         └───────────┘
```

## Basic MCP Server

Create an MCP server that exposes your Flows as tools.

```typescript
// mcp/server.ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { registry } from '../server/registry'
import { hydrateFlow } from '../server/hydration'
import { renderFlowToHtml } from './render'

const server = new McpServer({
  name: 'coffee-shop',
  version: '1.0.0',
})

// Register each Flow as a tool
for (const flow of registry.getFlows()) {
  server.tool(
    flow.intentId.replace('.', '_'),  // MCP tool names can't have dots
    flow.meta.description,
    {
      type: 'object',
      properties: zodToJsonSchema(flow.extractionSchema).properties,
    },
    async (params) => {
      try {
        // Hydrate props from params
        const props = await hydrateFlow(flow.intentId, {
          entities: params,
          // MCP context - user info comes from MCP session
        })

        // Render to HTML
        const html = await renderFlowToHtml(flow, props)

        return {
          content: [{ type: 'text', text: html }],
        }
      } catch (error) {
        return {
          content: [{
            type: 'text',
            text: `Error: ${error.message}`,
          }],
          isError: true,
        }
      }
    }
  )
}

// Start server
const transport = new StdioServerTransport()
await server.connect(transport)
```

## HTML Rendering for MCP

Flows render to HTML when served via MCP.

```typescript
// mcp/render.ts
import { renderToString } from 'react-dom/server'
import { FlowDefinition } from '@intentflow/core'

export async function renderFlowToHtml(
  flow: FlowDefinition,
  props: Record<string, unknown>
): Promise<string> {
  const Component = flow.component

  // Wrap in MCP-specific provider
  const html = renderToString(
    <MCPRenderProvider flow={flow} props={props}>
      <Component />
    </MCPRenderProvider>
  )

  // Wrap in styled container
  return `
    <div class="intentflow-card">
      <style>
        .intentflow-card {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          padding: 16px;
          border-radius: 8px;
          background: #f8fafc;
          border: 1px solid #e2e8f0;
        }
        .intentflow-card h1, .intentflow-card h2, .intentflow-card h3 {
          margin: 0 0 8px 0;
          color: #0f172a;
        }
        .intentflow-card p {
          margin: 0 0 8px 0;
          color: #475569;
        }
        .intentflow-card .highlight {
          background: #dbeafe;
          padding: 12px;
          border-radius: 6px;
          margin: 8px 0;
        }
        .intentflow-card .success {
          background: #dcfce7;
          color: #166534;
        }
        .intentflow-card .error {
          background: #fee2e2;
          color: #991b1b;
        }
        .intentflow-card table {
          width: 100%;
          border-collapse: collapse;
          margin: 8px 0;
        }
        .intentflow-card td, .intentflow-card th {
          padding: 8px;
          text-align: left;
          border-bottom: 1px solid #e2e8f0;
        }
        .intentflow-card .action-hint {
          margin-top: 12px;
          padding-top: 12px;
          border-top: 1px solid #e2e8f0;
          font-size: 14px;
          color: #64748b;
        }
      </style>
      ${html}
    </div>
  `
}
```

## MCP-Aware Components

Components can detect MCP context and render appropriately.

```tsx
// flows/order/place/component.tsx
import { useRenderContext } from '@intentflow/react'

export function PlaceOrderFlow() {
  const props = useFlowProps<PlaceOrderFlowProps>()
  const { isMCP } = useRenderContext()

  if (isMCP) {
    return <PlaceOrderMCPView props={props} />
  }

  return <PlaceOrderInteractiveView props={props} />
}

function PlaceOrderMCPView({ props }: { props: PlaceOrderFlowProps }) {
  const total = calculateTotal(props.items)

  return (
    <div>
      <h2>Order Summary</h2>

      <table>
        <thead>
          <tr>
            <th>Item</th>
            <th>Qty</th>
            <th>Price</th>
          </tr>
        </thead>
        <tbody>
          {props.items.map(item => (
            <tr key={item.item.id}>
              <td>{item.item.name}</td>
              <td>{item.quantity}</td>
              <td>${(item.item.price * item.quantity).toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={2}><strong>Total</strong></td>
            <td><strong>${total.toFixed(2)}</strong></td>
          </tr>
        </tfoot>
      </table>

      <div className="highlight">
        <p><strong>Pickup:</strong> {props.location.name}</p>
        <p><strong>Ready in:</strong> ~{props.location.estimatedTime} minutes</p>
      </div>

      <div className="action-hint">
        Say <strong>"confirm order"</strong> to place this order, or{' '}
        <strong>"cancel"</strong> to start over.
      </div>
    </div>
  )
}
```

## Handling Mutations

MCP is typically stateless. For mutations (like placing an order), implement a confirmation pattern.

### Option 1: Separate Confirm Tool

```typescript
// Pending orders cache (short TTL)
const pendingOrders = new Map<string, PendingOrder>()

// Tool: order_place - Shows order preview
server.tool('order_place', 'Build an order for pickup', schema, async (params) => {
  const props = await hydrateFlow('order.place', { entities: params })
  const pendingId = generateId()

  // Store pending order
  pendingOrders.set(pendingId, {
    props,
    createdAt: Date.now(),
    expiresAt: Date.now() + 5 * 60 * 1000, // 5 minutes
  })

  // Clean up expired
  cleanupExpiredPending()

  const html = await renderFlowToHtml(placeOrderFlow, props)

  return {
    content: [{
      type: 'text',
      text: html + `\n\n<div class="action-hint">
        Order ID: <code>${pendingId}</code><br>
        Say <strong>"confirm order ${pendingId}"</strong> to place this order.
      </div>`,
    }],
  }
})

// Tool: order_confirm - Executes the order
server.tool('order_confirm', 'Confirm and place a pending order', {
  type: 'object',
  properties: {
    orderId: { type: 'string', description: 'The pending order ID' },
  },
  required: ['orderId'],
}, async ({ orderId }) => {
  const pending = pendingOrders.get(orderId)

  if (!pending) {
    return {
      content: [{
        type: 'text',
        text: '<div class="error">Order not found or expired. Please start a new order.</div>',
      }],
      isError: true,
    }
  }

  if (Date.now() > pending.expiresAt) {
    pendingOrders.delete(orderId)
    return {
      content: [{
        type: 'text',
        text: '<div class="error">Order expired. Please start a new order.</div>',
      }],
      isError: true,
    }
  }

  // Execute the order
  const result = await executeOrder(pending.props)
  pendingOrders.delete(orderId)

  return {
    content: [{
      type: 'text',
      text: `<div class="success">
        <h2>Order Placed!</h2>
        <p>Order #${result.orderId}</p>
        <p>Ready in ~${result.estimatedTime} minutes at ${result.location}</p>
      </div>`,
    }],
  }
})
```

### Option 2: Stateful MCP Session

If your MCP implementation supports sessions:

```typescript
interface MCPSession {
  userId: string
  pendingFlows: Map<string, FlowState>
}

server.tool('order_place', '...', schema, async (params, session: MCPSession) => {
  const props = await hydrateFlow('order.place', {
    entities: params,
    userId: session.userId,
  })

  const instanceId = generateId()
  session.pendingFlows.set(instanceId, {
    intentId: 'order.place',
    props,
    state: 'review',
  })

  const html = await renderFlowToHtml(placeOrderFlow, props)

  return {
    content: [{ type: 'text', text: html }],
    metadata: { instanceId },
  }
})

server.tool('flow_confirm', 'Confirm the current action', {}, async (_, session) => {
  const [instanceId, flow] = [...session.pendingFlows.entries()][0] ?? []

  if (!flow) {
    return {
      content: [{ type: 'text', text: 'Nothing to confirm.' }],
    }
  }

  const result = await executeFlowAction(flow.intentId, 'CONFIRM', flow.props)
  session.pendingFlows.delete(instanceId)

  return {
    content: [{ type: 'text', text: renderResult(result) }],
  }
})
```

## Resources

Expose data as MCP resources for AI context.

```typescript
// Expose menu as a resource
server.resource(
  'menu',
  'menu://current',
  'Current menu with all available items',
  'application/json',
  async () => {
    const menu = await getMenu()
    return JSON.stringify(menu, null, 2)
  }
)

// Expose user's order history
server.resource(
  'order-history',
  'orders://history',
  'User\'s recent order history',
  'application/json',
  async (session) => {
    const orders = await getOrderHistory(session.userId)
    return JSON.stringify(orders, null, 2)
  }
)
```

## Prompts

Provide suggested prompts for common tasks.

```typescript
server.prompt(
  'quick-order',
  'Order your usual',
  [],
  async (session) => {
    const lastOrder = await getLastOrder(session.userId)

    if (!lastOrder) {
      return {
        messages: [{
          role: 'user',
          content: 'I want to place a new order',
        }],
      }
    }

    const items = lastOrder.items.map(i => `${i.quantity}x ${i.name}`).join(', ')

    return {
      messages: [{
        role: 'user',
        content: `Order ${items} for pickup`,
      }],
    }
  }
)

server.prompt(
  'check-order',
  'Check on your current order',
  [],
  async () => ({
    messages: [{
      role: 'user',
      content: "What's the status of my order?",
    }],
  })
)
```

## Authentication

Handle user authentication in MCP context.

```typescript
// mcp/auth.ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

export function setupAuth(server: McpServer) {
  // OAuth flow for user authentication
  server.setRequestHandler('auth/start', async () => {
    const authUrl = generateOAuthUrl({
      clientId: process.env.OAUTH_CLIENT_ID,
      redirectUri: 'intentflow://oauth/callback',
      scope: ['read', 'write'],
    })

    return { authUrl }
  })

  server.setRequestHandler('auth/callback', async (request) => {
    const { code } = request.params

    const tokens = await exchangeCodeForTokens(code)
    const user = await getUserFromToken(tokens.accessToken)

    return {
      userId: user.id,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    }
  })
}

// Use auth in tools
server.tool('order_place', '...', schema, async (params, context) => {
  if (!context.auth?.userId) {
    return {
      content: [{
        type: 'text',
        text: 'Please authenticate first to place orders.',
      }],
      isError: true,
    }
  }

  // Proceed with authenticated user
  const props = await hydrateFlow('order.place', {
    entities: params,
    userId: context.auth.userId,
  })

  // ...
})
```

## Configuration

Configure MCP server for Claude Desktop:

```json
// ~/Library/Application Support/Claude/claude_desktop_config.json
{
  "mcpServers": {
    "coffee-shop": {
      "command": "node",
      "args": ["/path/to/your/mcp/server.js"],
      "env": {
        "DATABASE_URL": "...",
        "API_KEY": "..."
      }
    }
  }
}
```

## Testing MCP Integration

```typescript
// mcp/server.test.ts
import { createTestClient } from '@modelcontextprotocol/sdk/testing'

describe('MCP Server', () => {
  let client: TestClient

  beforeAll(async () => {
    client = await createTestClient('./mcp/server.ts')
  })

  afterAll(async () => {
    await client.close()
  })

  it('lists all flows as tools', async () => {
    const tools = await client.listTools()

    expect(tools).toContainEqual(
      expect.objectContaining({ name: 'order_place' })
    )
    expect(tools).toContainEqual(
      expect.objectContaining({ name: 'order_track' })
    )
  })

  it('renders order preview', async () => {
    const result = await client.callTool('order_place', {
      item: 'latte',
      size: 'large',
    })

    expect(result.content[0].text).toContain('Order Summary')
    expect(result.content[0].text).toContain('Latte')
    expect(result.content[0].text).toContain('confirm order')
  })

  it('confirms pending order', async () => {
    // Place order
    const preview = await client.callTool('order_place', { item: 'latte' })
    const orderId = extractOrderId(preview.content[0].text)

    // Confirm
    const result = await client.callTool('order_confirm', { orderId })

    expect(result.content[0].text).toContain('Order Placed')
    expect(result.isError).toBeFalsy()
  })
})
```

## Best Practices

1. **Keep responses scannable** - AI agents display HTML in limited space
2. **Include action hints** - Tell users what commands are available
3. **Handle expiration** - Pending actions should expire gracefully
4. **Validate carefully** - MCP params come from AI, may be malformed
5. **Log for debugging** - MCP interactions are harder to debug than direct API calls
6. **Test with real agents** - Behavior varies between Claude, ChatGPT, etc.

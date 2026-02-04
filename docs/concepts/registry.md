# Registry

The **Registry** is the catalog of all available Flows in an IntentFlow application. It serves as the source of truth for what the AI can invoke, what the client can render, and what capabilities the system advertises.

## Purpose

The Registry exists to:

1. **Constrain the AI** — Only registered Flows can be invoked
2. **Enable discovery** — Clients and tools can query available capabilities
3. **Provide metadata** — Documentation, schemas, and relationships
4. **Manage versions** — Track changes to Flow definitions over time

## Registry Structure

```typescript
interface FlowRegistry {
  // All registered flows
  flows: Map<IntentId, FlowRegistration>

  // Lookup methods
  getFlow(intentId: string): FlowRegistration | undefined
  getFlows(filter?: FlowFilter): FlowRegistration[]
  hasFlow(intentId: string): boolean

  // Discovery
  getCategories(): Category[]
  search(query: string): FlowRegistration[]

  // For AI/MCP integration
  toToolDefinitions(): ToolDefinition[]
  toCapabilityManifest(): CapabilityManifest
}

interface FlowRegistration {
  intentId: string
  definition: FlowDefinition
  component: ComponentReference
  meta: FlowMeta
  version: string
  permissions?: PermissionRequirements
}
```

## Registering Flows

Flows are registered at application startup:

```typescript
import { createRegistry } from '@intentflow/core'
import { placeOrderFlow, PlaceOrderComponent } from './flows/order/place'
import { trackOrderFlow, TrackOrderComponent } from './flows/order/track'
import { cancelOrderFlow, CancelOrderComponent } from './flows/order/cancel'
import { browseMenuFlow, BrowseMenuComponent } from './flows/menu/browse'

const registry = createRegistry({
  flows: [
    {
      definition: placeOrderFlow,
      component: PlaceOrderComponent,
    },
    {
      definition: trackOrderFlow,
      component: TrackOrderComponent,
    },
    {
      definition: cancelOrderFlow,
      component: CancelOrderComponent,
    },
    {
      definition: browseMenuFlow,
      component: BrowseMenuComponent,
    },
  ],
})

export { registry }
```

### Auto-Discovery

For larger applications, use filesystem-based auto-discovery:

```typescript
import { createRegistry, discoverFlows } from '@intentflow/core'

// Scan /flows directory for index.ts exports
const flows = await discoverFlows({
  directory: './flows',
  pattern: '**/index.ts',
})

const registry = createRegistry({ flows })
```

Expected structure:
```
/flows
├── order/
│   ├── place/
│   │   ├── definition.ts
│   │   ├── component.tsx
│   │   └── index.ts      # exports { definition, component }
│   ├── track/
│   └── cancel/
├── menu/
│   ├── browse/
│   └── search/
└── account/
    └── update-payment/
```

## Registry Queries

### Basic Lookup

```typescript
// Get a specific Flow
const flow = registry.getFlow('order.place')

// Check existence
if (registry.hasFlow('order.place')) {
  // ...
}
```

### Filtered Queries

```typescript
// All order-related Flows
const orderFlows = registry.getFlows({
  category: 'orders',
})

// Flows that require authentication
const protectedFlows = registry.getFlows({
  requiresAuth: true,
})

// Flows available in current context
const availableFlows = registry.getFlows({
  context: currentOrchestrationContext,
})
```

### Search

```typescript
// Fuzzy search across intent IDs, titles, descriptions
const results = registry.search('cancel')
// Returns: [order.cancel, subscription.cancel, ...]

// Search with ranking by relevance
const ranked = registry.search('payment', { ranked: true })
```

## Categories

Flows are organized into categories for navigation and filtering:

```typescript
const categories = registry.getCategories()

// Returns:
[
  {
    id: 'orders',
    label: 'Orders',
    description: 'Place, track, and manage orders',
    flows: ['order.place', 'order.track', 'order.cancel', 'order.reorder'],
    icon: 'shopping-bag',
  },
  {
    id: 'menu',
    label: 'Menu',
    description: 'Browse and search the menu',
    flows: ['menu.browse', 'menu.search', 'menu.view_item'],
    icon: 'menu',
  },
  {
    id: 'account',
    label: 'Account',
    description: 'Manage your account settings',
    flows: ['account.update_payment', 'account.view_history', 'account.preferences'],
    icon: 'user',
  },
]
```

Categories are defined in Flow metadata:

```typescript
defineFlow({
  intentId: 'order.place',
  meta: {
    title: 'Place Order',
    category: 'orders',  // Category assignment
    // ...
  },
})
```

## AI Integration

The Registry generates tool definitions for LLM integration:

```typescript
const tools = registry.toToolDefinitions()

// Returns format compatible with OpenAI/Anthropic tool calling:
[
  {
    type: 'function',
    function: {
      name: 'order.place',
      description: 'Create a new order for pickup or delivery',
      parameters: {
        type: 'object',
        properties: {
          item: { type: 'string', description: 'Item to order' },
          quantity: { type: 'integer', default: 1 },
          size: { enum: ['small', 'medium', 'large'] },
          modifiers: { type: 'array', items: { type: 'string' } },
        },
      },
    },
  },
  // ... more tools
]
```

### Capability Manifest

For MCP servers, generate a capability manifest:

```typescript
const manifest = registry.toCapabilityManifest()

// Returns:
{
  name: 'coffee-shop',
  version: '1.0.0',
  capabilities: {
    flows: [
      {
        intentId: 'order.place',
        title: 'Place Order',
        description: 'Create a new order for pickup or delivery',
        inputSchema: { /* JSON Schema */ },
        examples: [
          'Order a large latte',
          'I want a cappuccino',
        ],
      },
      // ...
    ],
  },
}
```

## Permissions

Flows can declare permission requirements:

```typescript
defineFlow({
  intentId: 'account.update_payment',

  permissions: {
    // Required authentication level
    auth: 'authenticated',

    // Required roles/scopes
    roles: ['customer'],

    // Feature flags
    features: ['payments_enabled'],
  },
})
```

The Registry filters based on permissions:

```typescript
// Get Flows available to current user
const userFlows = registry.getFlows({
  permissions: {
    auth: user.isAuthenticated ? 'authenticated' : 'anonymous',
    roles: user.roles,
    features: enabledFeatures,
  },
})
```

### Permission Checking

```typescript
// Check if user can invoke a Flow
const canInvoke = registry.checkPermissions('account.update_payment', {
  user: currentUser,
  features: enabledFeatures,
})

if (!canInvoke.allowed) {
  // canInvoke.reason explains why
  // e.g., "Requires authentication" or "Missing role: admin"
}
```

## Versioning

Flow definitions evolve. The Registry tracks versions:

```typescript
defineFlow({
  intentId: 'order.place',
  version: '2.0.0',  // Semantic version

  // Previous versions for migration
  migrations: {
    '1.0.0': {
      propsTransform: (oldProps) => ({
        ...oldProps,
        // v2 added 'location' as required
        location: oldProps.location ?? defaultLocation,
      }),
    },
  },
})
```

### Version Negotiation

Clients declare their supported versions:

```typescript
// Client request
{
  "type": "RENDER",
  "intentId": "order.place",
  "clientVersion": "1.5.0",  // Client's version
  "props": { ... }
}

// Server checks compatibility
if (!isCompatible(flow.version, clientVersion)) {
  // Apply migration or return upgrade prompt
}
```

## Client-Side Registry

The client maintains a parallel registry for component lookup:

```typescript
// client/registry.ts
import { createClientRegistry } from '@intentflow/react'

import { PlaceOrderFlow } from './components/order/PlaceOrderFlow'
import { TrackOrderFlow } from './components/order/TrackOrderFlow'
import { CancelOrderFlow } from './components/order/CancelOrderFlow'
import { BrowseMenuFlow } from './components/menu/BrowseMenuFlow'

export const clientRegistry = createClientRegistry({
  'order.place': PlaceOrderFlow,
  'order.track': TrackOrderFlow,
  'order.cancel': CancelOrderFlow,
  'menu.browse': BrowseMenuFlow,
})
```

When a `RENDER` instruction arrives:

```typescript
function FlowRenderer({ instruction }) {
  const Component = clientRegistry.get(instruction.intentId)

  if (!Component) {
    return <UnknownFlowFallback intentId={instruction.intentId} />
  }

  return (
    <FlowProvider instanceId={instruction.instanceId}>
      <Component {...instruction.props} />
    </FlowProvider>
  )
}
```

### Lazy Loading

For large applications, load Flow components on demand:

```typescript
const clientRegistry = createClientRegistry({
  'order.place': () => import('./components/order/PlaceOrderFlow'),
  'order.track': () => import('./components/order/TrackOrderFlow'),
  // ...
})

// In renderer
const Component = await clientRegistry.load(instruction.intentId)
```

## Registry Events

Subscribe to registry changes for dynamic updates:

```typescript
registry.on('flow:registered', (flow) => {
  console.log(`New flow available: ${flow.intentId}`)
})

registry.on('flow:updated', (flow, previousVersion) => {
  console.log(`Flow updated: ${flow.intentId} (${previousVersion} → ${flow.version})`)
})

registry.on('flow:removed', (intentId) => {
  console.log(`Flow removed: ${intentId}`)
})
```

This enables hot-reloading during development and dynamic capability updates in production.

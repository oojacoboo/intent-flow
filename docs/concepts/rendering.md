# Rendering

IntentFlow separates **what** to render (server decision) from **how** to render it (client implementation). This separation enables a single Flow definition to produce native experiences across mobile, web, and agent interfaces.

IntentFlow uses [A2UI](https://github.com/nickarls/A2UI) concepts for declarative UI components that can be rendered natively on each platform.

## The Rendering Model

```
┌─────────────────────────────────────────────────────────────────┐
│                         SERVER                                  │
│                                                                 │
│   Flow Definition ──► Props Hydration ──► Protocol Instruction  │
│                                                                 │
└───────────────────────────────┬─────────────────────────────────┘
                                │
                          JSON Protocol
                                │
┌───────────────────────────────┼─────────────────────────────────┐
│                               ▼                                 │
│                          CLIENTS                                │
│                                                                 │
│   ┌─────────────┐    ┌─────────────┐    ┌─────────────┐        │
│   │  Mobile     │    │    Web      │    │    MCP      │        │
│   │  (Native)   │    │   (DOM)     │    │  (HTML/MD)  │        │
│   └──────┬──────┘    └──────┬──────┘    └──────┬──────┘        │
│          │                  │                  │                │
│          ▼                  ▼                  ▼                │
│   React Native         React DOM         SSR to HTML           │
│   Components           Components        or Markdown           │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

The server emits AG-UI events containing IntentFlow payloads with `intentId` and `props`. Each client looks up its own implementation of that Flow and renders it appropriately for its platform using A2UI-compatible components.

## Universal Components

Flow components are written once using a universal component system. The framework provides primitives that compile to native elements per platform.

### Primitive Components

```tsx
import { Stack, Text, Button, Card, Input } from '@intentflow/ui'

// These primitives compile to:
// - React Native: View, Text, TouchableOpacity, etc.
// - Web: div, span, button, etc.
// - MCP: Semantic HTML elements
```

| Primitive | Mobile | Web | MCP |
|-----------|--------|-----|-----|
| `<Stack>` | `<View>` | `<div>` | `<div>` |
| `<Text>` | `<Text>` | `<span>` | `<p>` or `<span>` |
| `<Button>` | `<TouchableOpacity>` | `<button>` | `<button>` |
| `<Card>` | `<View>` + styles | `<div>` + styles | `<div class="card">` |
| `<Input>` | `<TextInput>` | `<input>` | `<input>` |

### Component Implementation

Tamagui (recommended) or React Native Web enables this universal approach:

```tsx
// flows/order/place/component.tsx
import { Stack, Text, Button, YStack, XStack } from '@intentflow/ui'

export function PlaceOrderFlow(props: PlaceOrderFlowProps) {
  return (
    <YStack padding="$4" gap="$3">
      <Text fontSize="$6" fontWeight="bold">
        Review Order
      </Text>

      <Card>
        {props.items.map(item => (
          <XStack key={item.id} justifyContent="space-between">
            <Text>{item.name}</Text>
            <Text>${item.price.toFixed(2)}</Text>
          </XStack>
        ))}
      </Card>

      <XStack gap="$2">
        <Button theme="secondary" onPress={handleCancel}>
          Cancel
        </Button>
        <Button theme="primary" onPress={handleConfirm}>
          Place Order
        </Button>
      </XStack>
    </YStack>
  )
}
```

This single component renders natively on iOS/Android and as standard DOM on web.

## Platform-Specific Rendering

Sometimes platforms need different implementations. IntentFlow supports platform overrides:

```
/flows/order/place/
├── definition.ts
├── component.tsx           # Default/shared implementation
├── component.native.tsx    # Mobile-specific (optional)
├── component.web.tsx       # Web-specific (optional)
└── index.ts
```

### Conditional Platform Code

Within a single component, use platform detection sparingly:

```tsx
import { Platform } from '@intentflow/ui'

export function PlaceOrderFlow(props: PlaceOrderFlowProps) {
  return (
    <Stack>
      {/* Shared content */}
      <OrderSummary items={props.items} />

      {/* Platform-specific payment UI */}
      {Platform.OS === 'ios' && <ApplePayButton />}
      {Platform.OS === 'android' && <GooglePayButton />}
      {Platform.OS === 'web' && <StripePaymentForm />}
    </Stack>
  )
}
```

## MCP Rendering

When Flows render in MCP contexts (Claude, ChatGPT, etc.), they output HTML or Markdown instead of interactive components.

### The MCP Adapter

The MCP server wraps Flow components with a server-side renderer:

```typescript
// mcp/server.ts
import { renderToString } from 'react-dom/server'
import { registry } from '@app/registry'

async function handleToolCall(intentId: string, params: unknown) {
  const flow = registry.getFlow(intentId)
  const props = await hydrateFlow(intentId, params)

  // Server-render the component to HTML
  const html = renderToString(
    <MCPRenderContext>
      <flow.component {...props} />
    </MCPRenderContext>
  )

  return {
    type: 'text/html',
    content: html,
  }
}
```

### MCP-Aware Components

Components can detect MCP context and adjust:

```tsx
import { useRenderContext } from '@intentflow/react'

export function PlaceOrderFlow(props: PlaceOrderFlowProps) {
  const { isMCP } = useRenderContext()

  if (isMCP) {
    // Static representation for agent display
    return (
      <MCPCard title="Order Summary">
        <MCPList items={props.items.map(i => `${i.name}: $${i.price}`)} />
        <MCPText>Total: ${calculateTotal(props.items)}</MCPText>
        <MCPAction label="Confirm Order" action="CONFIRM" />
      </MCPCard>
    )
  }

  // Interactive version for native/web
  return (
    <InteractiveOrderFlow {...props} />
  )
}
```

### MCP Primitives

For MCP contexts, use primitives that render clean HTML:

```tsx
// These render to semantic HTML for agent display
<MCPCard>       → <div class="card">
<MCPList>       → <ul><li>...</li></ul>
<MCPTable>      → <table>
<MCPAction>     → <button data-action="...">
<MCPLink>       → <a href="...">
```

## Display Modes

The server can specify how a Flow should be presented:

```typescript
interface RenderInstruction {
  type: 'RENDER'
  intentId: string
  instanceId: string
  props: Record<string, unknown>
  displayMode: 'inline' | 'modal' | 'fullscreen' | 'sheet'
}
```

| Mode | Mobile | Web | MCP |
|------|--------|-----|-----|
| `inline` | Embedded in chat | Embedded in page | Inline HTML |
| `modal` | Centered modal | Dialog overlay | Card block |
| `fullscreen` | Full screen takeover | Full viewport | Full response |
| `sheet` | Bottom sheet | Side panel | Card block |

The client interprets `displayMode` according to platform conventions:

```tsx
function FlowHost({ instruction }) {
  const Component = registry.get(instruction.intentId)

  switch (instruction.displayMode) {
    case 'modal':
      return (
        <Modal visible onDismiss={handleDismiss}>
          <Component {...instruction.props} />
        </Modal>
      )
    case 'sheet':
      return (
        <BottomSheet>
          <Component {...instruction.props} />
        </BottomSheet>
      )
    case 'fullscreen':
      return (
        <FullScreenContainer>
          <Component {...instruction.props} />
        </FullScreenContainer>
      )
    default:
      return <Component {...instruction.props} />
  }
}
```

## Streaming Rendering

For Flows with progressive content, the server can stream props:

```typescript
// Server sends initial frame
{
  type: 'RENDER',
  intentId: 'order.track',
  instanceId: 'flow_123',
  props: {
    status: 'preparing',
    estimatedTime: 8,
  },
  streaming: true
}

// Server sends updates as state changes
{
  type: 'PROPS_UPDATE',
  instanceId: 'flow_123',
  patch: {
    status: 'ready',
    estimatedTime: 0,
  }
}
```

The client merges prop patches and re-renders:

```tsx
function StreamingFlowHost({ instruction }) {
  const [props, setProps] = useState(instruction.props)

  useProtocolStream(instruction.instanceId, (message) => {
    if (message.type === 'PROPS_UPDATE') {
      setProps(prev => ({ ...prev, ...message.patch }))
    }
  })

  const Component = registry.get(instruction.intentId)
  return <Component {...props} />
}
```

## Theming

The universal component system supports theming for brand consistency:

```typescript
// theme.ts
export const theme = createTheme({
  colors: {
    primary: '#2563eb',
    secondary: '#64748b',
    background: '#ffffff',
    surface: '#f8fafc',
    text: '#0f172a',
    textMuted: '#64748b',
    error: '#dc2626',
    success: '#16a34a',
  },
  spacing: {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
  },
  radii: {
    sm: 4,
    md: 8,
    lg: 16,
  },
  fonts: {
    body: 'Inter',
    heading: 'Inter',
    mono: 'JetBrains Mono',
  },
})
```

Components consume theme values:

```tsx
<Button
  backgroundColor="$primary"
  padding="$md"
  borderRadius="$md"
>
  <Text color="white">Place Order</Text>
</Button>
```

The theme compiles to platform-appropriate styling (StyleSheet on mobile, CSS on web).

## Accessibility

Universal components include accessibility by default:

```tsx
<Button
  onPress={handleConfirm}
  accessibilityLabel="Confirm order for $12.50"
  accessibilityRole="button"
>
  Place Order
</Button>
```

Platform mappings:
- **Mobile:** `accessibilityLabel`, `accessibilityRole` props
- **Web:** `aria-label`, `role` attributes
- **MCP:** Semantic HTML elements

## Error Boundaries

Wrap Flow rendering in error boundaries:

```tsx
function FlowHost({ instruction }) {
  return (
    <FlowErrorBoundary
      intentId={instruction.intentId}
      onError={(error) => reportError(error, instruction)}
      fallback={<FlowRenderError intentId={instruction.intentId} />}
    >
      <FlowRenderer instruction={instruction} />
    </FlowErrorBoundary>
  )
}
```

Errors during rendering don't crash the app—they show a graceful fallback and report to your error tracking.

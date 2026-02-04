# Error Handling

This document specifies error handling patterns in the IntentFlow Protocol.

## Error Philosophy

1. **Errors are data** — Errors are structured messages, not exceptions
2. **Recoverable by default** — Most errors should offer a path forward
3. **Client-friendly** — Error messages are safe to display to users
4. **Debug-rich** — Details are available for debugging without exposing internals

## Error Message Structure

```typescript
interface ErrorMessage {
  type: 'ERROR'
  messageId: string
  timestamp: string
  version: '1.0'

  // Classification
  code: ErrorCode
  category: ErrorCategory

  // User-facing
  message: string           // Safe to display to users
  title?: string            // Short error title

  // Context
  instanceId?: string       // Related Flow instance
  inReplyTo?: string        // Triggering message

  // Debug info (may be filtered in production)
  details?: Record<string, unknown>
  stack?: string

  // Recovery
  recoverable: boolean
  recovery?: RecoveryAction[]
  retryAfter?: number       // Seconds
}

type ErrorCategory =
  | 'validation'    // Input/schema errors
  | 'permission'    // Auth/authorization errors
  | 'state'         // Invalid state transition
  | 'external'      // External service failure
  | 'internal'      // Server errors

interface RecoveryAction {
  type: 'retry' | 'modify' | 'dismiss' | 'navigate'
  label: string
  action?: string           // Event to dispatch
  payload?: Record<string, unknown>
}
```

## Error Codes

### Validation Errors (4xx equivalent)

| Code | Description | Typical Cause |
|------|-------------|---------------|
| `INVALID_MESSAGE` | Malformed protocol message | Bad JSON, missing fields |
| `INVALID_PROPS` | Props don't match schema | Type mismatch, missing required |
| `INVALID_EVENT` | Unknown event type | Typo, client/server mismatch |
| `INVALID_TRANSITION` | Event not valid in current state | UI out of sync |
| `INVALID_PAYLOAD` | Event payload invalid | Bad user input |

**Example:**

```json
{
  "type": "ERROR",
  "code": "INVALID_PROPS",
  "category": "validation",
  "message": "Please provide a valid quantity",
  "details": {
    "field": "quantity",
    "expected": "positive integer",
    "received": -1
  },
  "recoverable": true,
  "recovery": [
    {
      "type": "modify",
      "label": "Fix quantity",
      "action": "EDIT_ITEM"
    }
  ]
}
```

### State Errors

| Code | Description | Typical Cause |
|------|-------------|---------------|
| `FLOW_NOT_FOUND` | Intent ID not in registry | Invalid intentId |
| `INSTANCE_NOT_FOUND` | Flow instance doesn't exist | Expired, dismissed |
| `INSTANCE_EXPIRED` | Flow instance timed out | Session timeout |
| `STATE_CONFLICT` | Concurrent modification | Race condition |

**Example:**

```json
{
  "type": "ERROR",
  "code": "INVALID_TRANSITION",
  "category": "state",
  "message": "This order has already been submitted",
  "instanceId": "flow_abc123",
  "details": {
    "currentState": "confirmed",
    "attemptedEvent": "CONFIRM"
  },
  "recoverable": true,
  "recovery": [
    {
      "type": "navigate",
      "label": "Track Order",
      "action": "NAVIGATE",
      "payload": { "intentId": "order.track" }
    }
  ]
}
```

### Permission Errors

| Code | Description | Typical Cause |
|------|-------------|---------------|
| `AUTH_REQUIRED` | Authentication needed | No/expired token |
| `PERMISSION_DENIED` | Insufficient permissions | Missing role/scope |
| `RATE_LIMITED` | Too many requests | Abuse prevention |

**Example:**

```json
{
  "type": "ERROR",
  "code": "PERMISSION_DENIED",
  "category": "permission",
  "message": "You don't have access to this feature",
  "details": {
    "required": ["admin"],
    "current": ["customer"]
  },
  "recoverable": false
}
```

### External Errors

| Code | Description | Typical Cause |
|------|-------------|---------------|
| `HYDRATION_FAILED` | Failed to fetch props data | Database/API error |
| `MUTATION_FAILED` | Failed to execute action | Payment declined, etc. |
| `SERVICE_UNAVAILABLE` | Downstream service down | Outage, timeout |

**Example:**

```json
{
  "type": "ERROR",
  "code": "MUTATION_FAILED",
  "category": "external",
  "message": "Your payment was declined. Please try a different card.",
  "instanceId": "flow_abc123",
  "details": {
    "processor": "stripe",
    "declineCode": "insufficient_funds"
  },
  "recoverable": true,
  "recovery": [
    {
      "type": "modify",
      "label": "Try Different Card",
      "action": "CHANGE_PAYMENT"
    },
    {
      "type": "dismiss",
      "label": "Cancel Order"
    }
  ]
}
```

### Internal Errors

| Code | Description | Typical Cause |
|------|-------------|---------------|
| `INTERNAL_ERROR` | Unexpected server error | Bug, unhandled exception |
| `TIMEOUT` | Operation timed out | Slow dependency |

**Example:**

```json
{
  "type": "ERROR",
  "code": "INTERNAL_ERROR",
  "category": "internal",
  "message": "Something went wrong. Please try again.",
  "recoverable": true,
  "retryAfter": 5,
  "recovery": [
    {
      "type": "retry",
      "label": "Try Again"
    }
  ]
}
```

## Error Handling Patterns

### Client-Side Error Handling

```typescript
function handleError(error: ErrorMessage) {
  // Log for debugging
  console.error('[IntentFlow]', error.code, error.details)

  // Check if related to active Flow
  if (error.instanceId) {
    const flow = activeFlows.get(error.instanceId)
    if (flow) {
      // Update Flow state to show error
      flow.error = error
      rerenderFlow(error.instanceId)
      return
    }
  }

  // Global error handling
  if (error.recoverable && error.recovery?.length) {
    showErrorWithRecovery(error)
  } else {
    showFatalError(error)
  }
}

function showErrorWithRecovery(error: ErrorMessage) {
  // Render error UI with recovery options
  render(
    <ErrorCard
      title={error.title}
      message={error.message}
      actions={error.recovery.map(action => ({
        label: action.label,
        onPress: () => executeRecovery(action)
      }))}
    />
  )
}

function executeRecovery(action: RecoveryAction) {
  switch (action.type) {
    case 'retry':
      retryLastAction()
      break
    case 'modify':
      dispatchEvent(action.action, action.payload)
      break
    case 'dismiss':
      dismissCurrentFlow()
      break
    case 'navigate':
      invokeFlow(action.payload.intentId)
      break
  }
}
```

### Flow Component Error Handling

```tsx
export function PlaceOrderFlow(props: Props) {
  const state = useFlowState()
  const error = useFlowError()

  // Handle Flow-specific errors
  if (error) {
    return (
      <ErrorState
        error={error}
        onRetry={() => dispatch('RETRY')}
        onCancel={() => dispatch('CANCEL')}
      />
    )
  }

  if (state.matches('error')) {
    // State machine error state
    return (
      <ErrorCard
        message={state.context.errorMessage}
        onRetry={() => dispatch('RETRY')}
      />
    )
  }

  // Normal rendering...
}
```

### Server-Side Error Generation

```typescript
// Structured error creation
import { createError } from '@intentflow/core'

async function handleEvent(instanceId: string, event: string, payload: unknown) {
  const instance = await getInstance(instanceId)

  if (!instance) {
    throw createError({
      code: 'INSTANCE_NOT_FOUND',
      message: 'This session has expired. Please start over.',
      recoverable: true,
      recovery: [{
        type: 'navigate',
        label: 'Start New Order',
        payload: { intentId: 'order.place' }
      }]
    })
  }

  if (!instance.machine.can(event)) {
    throw createError({
      code: 'INVALID_TRANSITION',
      message: `Cannot ${event.toLowerCase()} from current state`,
      instanceId,
      details: {
        currentState: instance.state,
        attemptedEvent: event,
        allowedEvents: instance.machine.allowedEvents()
      }
    })
  }

  // Process event...
}
```

### Error Middleware

```typescript
// Express error middleware
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  // Convert to protocol error
  const protocolError = toProtocolError(err)

  // Log full details server-side
  logger.error({
    code: protocolError.code,
    message: protocolError.message,
    details: protocolError.details,
    stack: err.stack,
    request: {
      path: req.path,
      body: req.body
    }
  })

  // Return sanitized error to client
  res.status(errorToStatus(protocolError.code)).json({
    ...protocolError,
    // Remove sensitive details in production
    details: process.env.NODE_ENV === 'development' ? protocolError.details : undefined,
    stack: undefined
  })
})

function errorToStatus(code: ErrorCode): number {
  switch (code) {
    case 'INVALID_MESSAGE':
    case 'INVALID_PROPS':
    case 'INVALID_EVENT':
    case 'INVALID_TRANSITION':
    case 'INVALID_PAYLOAD':
      return 400
    case 'AUTH_REQUIRED':
      return 401
    case 'PERMISSION_DENIED':
      return 403
    case 'FLOW_NOT_FOUND':
    case 'INSTANCE_NOT_FOUND':
      return 404
    case 'STATE_CONFLICT':
      return 409
    case 'RATE_LIMITED':
      return 429
    case 'SERVICE_UNAVAILABLE':
      return 503
    default:
      return 500
  }
}
```

## Retry Strategies

### Automatic Retry

For transient errors, implement automatic retry with backoff:

```typescript
async function sendEventWithRetry(
  instanceId: string,
  event: string,
  payload: unknown,
  options = { maxRetries: 3, baseDelay: 1000 }
) {
  let lastError: ErrorMessage

  for (let attempt = 0; attempt < options.maxRetries; attempt++) {
    try {
      return await sendEvent(instanceId, event, payload)
    } catch (error) {
      lastError = error as ErrorMessage

      // Only retry transient errors
      if (!isTransientError(lastError)) {
        throw lastError
      }

      // Respect retryAfter if provided
      const delay = lastError.retryAfter
        ? lastError.retryAfter * 1000
        : options.baseDelay * Math.pow(2, attempt)

      await sleep(delay)
    }
  }

  throw lastError
}

function isTransientError(error: ErrorMessage): boolean {
  return ['TIMEOUT', 'SERVICE_UNAVAILABLE', 'INTERNAL_ERROR'].includes(error.code)
}
```

### User-Initiated Retry

For non-transient errors, let users decide:

```tsx
function ErrorWithRetry({ error, onRetry }: Props) {
  const [retrying, setRetrying] = useState(false)

  const handleRetry = async () => {
    setRetrying(true)
    try {
      await onRetry()
    } finally {
      setRetrying(false)
    }
  }

  return (
    <Card variant="error">
      <Text>{error.message}</Text>
      {error.recoverable && (
        <Button onPress={handleRetry} disabled={retrying}>
          {retrying ? 'Retrying...' : 'Try Again'}
        </Button>
      )}
    </Card>
  )
}
```

## Error Telemetry

Track errors for monitoring and improvement:

```typescript
function reportError(error: ErrorMessage, context: ErrorContext) {
  // Send to error tracking service
  Sentry.captureException(new Error(error.message), {
    tags: {
      errorCode: error.code,
      category: error.category,
      intentId: context.intentId,
      recoverable: error.recoverable
    },
    extra: {
      details: error.details,
      instanceId: error.instanceId,
      userAction: context.userAction
    }
  })

  // Track for analytics
  analytics.track('flow_error', {
    code: error.code,
    category: error.category,
    intentId: context.intentId,
    recovered: false // Update if user successfully recovers
  })
}
```

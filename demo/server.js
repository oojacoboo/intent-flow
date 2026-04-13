/**
 * Minimal IntentFlow demo app.
 * Simulates the full Flow lifecycle:
 *   user types intent → registry lookup → schema validation → state machine → UI render
 *
 * This is NOT production code — it demonstrates the spec concepts
 * with a working UI that Playwright can test against.
 */

import express from 'express'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const app = express()
app.use(express.json())

// ─── REGISTRY ──────────────────────────────────────────────
// Only registered Flows can be invoked. This IS the constraint.

const FLOW_REGISTRY = {
  'payments.overdue': {
    title: 'Overdue Payments',
    description: 'View tenants with overdue rent',
    category: 'payments',
    keywords: ['overdue', 'late', 'unpaid', 'owe', 'behind', "hasn't paid", "haven't paid"],
  },
  'payments.submit': {
    title: 'Pay Rent',
    description: 'Submit a rent payment',
    category: 'payments',
    keywords: ['pay', 'payment', 'rent', 'submit'],
  },
  'maintenance.create': {
    title: 'Create Work Order',
    description: 'Submit a maintenance request',
    category: 'maintenance',
    keywords: ['maintenance', 'repair', 'fix', 'broken', 'work order'],
  },
}

// ─── INTENT MATCHING ───────────────────────────────────────
// Simple keyword matching (production would use LLM tool calling)

function matchIntent(userInput) {
  const input = userInput.toLowerCase()
  let bestMatch = null
  let bestScore = 0

  for (const [intentId, flow] of Object.entries(FLOW_REGISTRY)) {
    const score = flow.keywords.filter(kw => input.includes(kw)).length
    if (score > bestScore) {
      bestScore = score
      bestMatch = { intentId, flow }
    }
  }

  return bestMatch && bestScore > 0 ? bestMatch : null
}

// ─── MOCK DATA (hydration layer) ───────────────────────────

const MOCK_DATA = {
  'payments.overdue': {
    tenants: [
      { name: 'John Martinez', unit: '4B', amount: 1200, daysLate: 12 },
      { name: 'Sarah Chen', unit: '2A', amount: 1450, daysLate: 5 },
    ],
    asOf: '2026-04-12',
  },
  'payments.submit': {
    tenantName: 'Aaron Downing',
    unit: '3C',
    amount: 1200,
    dueDate: '2026-04-01',
    paymentMethods: [
      { id: 'pm_1', label: 'Visa ••4242', type: 'card' },
      { id: 'pm_2', label: 'Bank Account ••9801', type: 'bank' },
    ],
  },
  'maintenance.create': {
    units: ['2A', '3C', '4B', '5A'],
    categories: ['Plumbing', 'Electrical', 'HVAC', 'Appliance', 'Other'],
  },
}

// ─── SCHEMA VALIDATION ─────────────────────────────────────
// Simplified validators (production uses Zod)

function validateSchema(intentId, data) {
  switch (intentId) {
    case 'payments.overdue':
      if (!Array.isArray(data.tenants)) return { valid: false, error: 'tenants must be an array' }
      for (const t of data.tenants) {
        if (typeof t.amount !== 'number' || t.amount <= 0) return { valid: false, error: `Invalid amount for ${t.name}` }
      }
      return { valid: true }
    case 'payments.submit':
      if (typeof data.amount !== 'number' || data.amount <= 0) return { valid: false, error: 'Invalid payment amount' }
      if (!data.paymentMethods?.length) return { valid: false, error: 'No payment methods' }
      return { valid: true }
    case 'maintenance.create':
      if (!data.units?.length) return { valid: false, error: 'No units available' }
      return { valid: true }
    default:
      return { valid: false, error: 'Unknown flow' }
  }
}

// ─── ROUTES ────────────────────────────────────────────────

app.get('/', (req, res) => {
  res.sendFile(join(__dirname, 'index.html'))
})

// Intent resolution endpoint
app.post('/api/intent', (req, res) => {
  const { input } = req.body
  const match = matchIntent(input)

  if (!match) {
    return res.json({
      success: false,
      message: "I can't help with that. Try asking about payments, rent, or maintenance.",
    })
  }

  const data = MOCK_DATA[match.intentId]
  const validation = validateSchema(match.intentId, data)

  if (!validation.valid) {
    return res.json({ success: false, message: `Data error: ${validation.error}` })
  }

  res.json({
    success: true,
    intentId: match.intentId,
    flow: match.flow,
    data,
  })
})

// State machine transition endpoint
app.post('/api/transition', (req, res) => {
  const { intentId, currentState, event } = req.body

  const machines = {
    'payments.submit': {
      reviewing: { PAY_NOW: 'processing', CANCEL: 'cancelled' },
      processing: { SUCCESS: 'confirmed', FAILURE: 'error' },
      error: { RETRY: 'processing', CANCEL: 'cancelled' },
      confirmed: {},
      cancelled: {},
    },
    'maintenance.create': {
      filling: { SUBMIT: 'processing', CANCEL: 'cancelled' },
      processing: { SUCCESS: 'confirmed', FAILURE: 'error' },
      error: { RETRY: 'processing', CANCEL: 'cancelled' },
      confirmed: {},
      cancelled: {},
    },
  }

  const machine = machines[intentId]
  if (!machine || !machine[currentState]) {
    return res.json({ success: false, newState: currentState, message: 'Invalid state' })
  }

  const newState = machine[currentState][event]
  if (!newState) {
    return res.json({ success: false, newState: currentState, message: `Cannot ${event} from ${currentState}` })
  }

  res.json({ success: true, newState })
})

const PORT = process.env.PORT || 3847
const server = app.listen(PORT, () => {
  console.log(`\nIntentFlow demo running at http://localhost:${PORT}\n`)
  import('child_process').then(({ exec }) => {
    const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open'
    exec(`${cmd} http://localhost:${PORT}`)
  })
})

export { app, server }

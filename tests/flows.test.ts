import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import { createMachine, createActor } from 'xstate'
import { defineFlow } from '../src/define-flow'

/**
 * Tests validating Flow definitions from the IntentFlow spec.
 * These use the exact examples from docs/concepts/flows.md to ensure
 * the spec's TypeScript is structurally sound and behaviorally correct.
 */

// Schemas from the spec (docs/concepts/flows.md)
const menuItemSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  price: z.number().positive(),
  options: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        choices: z.array(
          z.object({
            id: z.string(),
            label: z.string(),
            priceModifier: z.number().default(0),
          })
        ),
      })
    )
    .optional(),
})

const orderItemSchema = z.object({
  item: menuItemSchema,
  quantity: z.number().int().positive(),
  selectedOptions: z.record(z.string()).optional(),
  specialInstructions: z.string().optional(),
})

// The placeOrder Flow from the spec
const placeOrderFlow = defineFlow({
  intentId: 'order.place',
  meta: {
    title: 'Place Order',
    description: 'Build and submit a new order',
    category: 'orders',
  },
  schema: z.object({
    items: z.array(orderItemSchema).min(1),
    location: z.object({
      id: z.string().uuid(),
      name: z.string(),
      address: z.string(),
      estimatedTime: z.number(),
    }),
    paymentMethods: z
      .array(
        z.object({
          id: z.string().uuid(),
          label: z.string(),
          type: z.enum(['card', 'wallet', 'gift_card']),
        })
      )
      .min(1),
  }),
  machine: {
    id: 'placeOrder',
    initial: 'review',
    states: {
      review: {
        on: {
          CONFIRM: 'processing',
          EDIT_ITEM: 'editing',
          REMOVE_ITEM: { target: 'review' },
          CANCEL: 'cancelled',
        },
      },
      editing: {
        on: {
          SAVE: 'review',
          CANCEL: 'review',
        },
      },
      processing: {
        on: {
          SUCCESS: 'confirmed',
          FAILURE: 'error',
        },
      },
      confirmed: { type: 'final' },
      error: {
        on: {
          RETRY: 'processing',
          CANCEL: 'cancelled',
        },
      },
      cancelled: { type: 'final' },
    },
  },
})

// Cancel order Flow from the spec
const cancelOrderFlow = defineFlow({
  intentId: 'order.cancel',
  meta: {
    title: 'Cancel Order',
    description: 'Cancel a pending order',
    category: 'orders',
  },
  schema: z.object({
    orderId: z.string(),
    orderSummary: z.string(),
    refundAmount: z.number().optional(),
    refundEligible: z.boolean(),
  }),
  machine: {
    id: 'cancelOrder',
    initial: 'confirming',
    states: {
      confirming: {
        on: {
          CONFIRM: 'processing',
          DECLINE: 'declined',
        },
      },
      processing: {
        on: {
          SUCCESS: 'cancelled',
          FAILURE: 'error',
        },
      },
      cancelled: { type: 'final' },
      declined: { type: 'final' },
      error: {
        on: {
          RETRY: 'processing',
          DECLINE: 'declined',
        },
      },
    },
  },
})

describe('Flow Definition', () => {
  describe('defineFlow validation', () => {
    it('accepts valid intentId format (domain.action)', () => {
      expect(placeOrderFlow.intentId).toBe('order.place')
      expect(cancelOrderFlow.intentId).toBe('order.cancel')
    })

    it('rejects invalid intentId formats', () => {
      expect(() =>
        defineFlow({
          intentId: 'INVALID',
          meta: { title: 'X', description: 'X', category: 'x' },
          schema: z.object({}),
          machine: { id: 'x', initial: 'idle', states: { idle: {} } },
        })
      ).toThrow('Invalid intentId')

      expect(() =>
        defineFlow({
          intentId: 'too.many.levels',
          meta: { title: 'X', description: 'X', category: 'x' },
          schema: z.object({}),
          machine: { id: 'x', initial: 'idle', states: { idle: {} } },
        })
      ).toThrow('Invalid intentId')
    })

    it('rejects missing meta fields', () => {
      expect(() =>
        defineFlow({
          intentId: 'test.flow',
          meta: { title: '', description: 'X', category: 'x' },
          schema: z.object({}),
          machine: { id: 'x', initial: 'idle', states: { idle: {} } },
        })
      ).toThrow('meta requires')
    })
  })
})

describe('Flow Schema Validation (Zod)', () => {
  describe('order.place schema', () => {
    const validProps = {
      items: [
        {
          item: {
            id: '550e8400-e29b-41d4-a716-446655440000',
            name: 'Cappuccino',
            price: 4.5,
          },
          quantity: 1,
        },
      ],
      location: {
        id: '550e8400-e29b-41d4-a716-446655440001',
        name: 'Main St',
        address: '123 Main St',
        estimatedTime: 8,
      },
      paymentMethods: [
        {
          id: '550e8400-e29b-41d4-a716-446655440002',
          label: 'Visa ••4242',
          type: 'card' as const,
        },
      ],
    }

    it('accepts valid props', () => {
      const result = placeOrderFlow.schema.safeParse(validProps)
      expect(result.success).toBe(true)
    })

    it('rejects empty items array', () => {
      const result = placeOrderFlow.schema.safeParse({
        ...validProps,
        items: [],
      })
      expect(result.success).toBe(false)
    })

    it('rejects negative price', () => {
      const result = placeOrderFlow.schema.safeParse({
        ...validProps,
        items: [
          {
            item: {
              id: '550e8400-e29b-41d4-a716-446655440000',
              name: 'Free Item',
              price: -1,
            },
            quantity: 1,
          },
        ],
      })
      expect(result.success).toBe(false)
    })

    it('rejects zero quantity', () => {
      const result = placeOrderFlow.schema.safeParse({
        ...validProps,
        items: [
          {
            item: {
              id: '550e8400-e29b-41d4-a716-446655440000',
              name: 'Latte',
              price: 5,
            },
            quantity: 0,
          },
        ],
      })
      expect(result.success).toBe(false)
    })

    it('rejects invalid payment type', () => {
      const result = placeOrderFlow.schema.safeParse({
        ...validProps,
        paymentMethods: [
          {
            id: '550e8400-e29b-41d4-a716-446655440002',
            label: 'Bitcoin',
            type: 'crypto',
          },
        ],
      })
      expect(result.success).toBe(false)
    })

    it('rejects empty payment methods', () => {
      const result = placeOrderFlow.schema.safeParse({
        ...validProps,
        paymentMethods: [],
      })
      expect(result.success).toBe(false)
    })

    it('accepts optional specialInstructions', () => {
      const withInstructions = {
        ...validProps,
        items: [
          {
            ...validProps.items[0],
            specialInstructions: 'Extra hot',
          },
        ],
      }
      const result = placeOrderFlow.schema.safeParse(withInstructions)
      expect(result.success).toBe(true)
    })
  })

  describe('order.cancel schema', () => {
    it('accepts valid cancel props', () => {
      const result = cancelOrderFlow.schema.safeParse({
        orderId: 'order_123',
        orderSummary: '1x Cappuccino',
        refundAmount: 4.5,
        refundEligible: true,
      })
      expect(result.success).toBe(true)
    })

    it('accepts cancel without refund amount (optional)', () => {
      const result = cancelOrderFlow.schema.safeParse({
        orderId: 'order_123',
        orderSummary: '1x Cappuccino',
        refundEligible: false,
      })
      expect(result.success).toBe(true)
    })
  })
})

describe('Flow State Machine (XState)', () => {
  describe('order.place state machine', () => {
    const machine = createMachine(placeOrderFlow.machine)

    it('starts in review state', () => {
      const actor = createActor(machine).start()
      expect(actor.getSnapshot().value).toBe('review')
      actor.stop()
    })

    it('transitions review → processing on CONFIRM', () => {
      const actor = createActor(machine).start()
      actor.send({ type: 'CONFIRM' })
      expect(actor.getSnapshot().value).toBe('processing')
      actor.stop()
    })

    it('transitions review → editing on EDIT_ITEM', () => {
      const actor = createActor(machine).start()
      actor.send({ type: 'EDIT_ITEM' })
      expect(actor.getSnapshot().value).toBe('editing')
      actor.stop()
    })

    it('transitions editing → review on SAVE', () => {
      const actor = createActor(machine).start()
      actor.send({ type: 'EDIT_ITEM' })
      actor.send({ type: 'SAVE' })
      expect(actor.getSnapshot().value).toBe('review')
      actor.stop()
    })

    it('transitions review → cancelled on CANCEL', () => {
      const actor = createActor(machine).start()
      actor.send({ type: 'CANCEL' })
      expect(actor.getSnapshot().value).toBe('cancelled')
      actor.stop()
    })

    it('completes happy path: review → processing → confirmed', () => {
      const actor = createActor(machine).start()
      actor.send({ type: 'CONFIRM' })
      actor.send({ type: 'SUCCESS' })
      expect(actor.getSnapshot().value).toBe('confirmed')
      expect(actor.getSnapshot().status).toBe('done')
      actor.stop()
    })

    it('handles error path: review → processing → error → retry → processing → confirmed', () => {
      const actor = createActor(machine).start()
      actor.send({ type: 'CONFIRM' })
      actor.send({ type: 'FAILURE' })
      expect(actor.getSnapshot().value).toBe('error')
      actor.send({ type: 'RETRY' })
      expect(actor.getSnapshot().value).toBe('processing')
      actor.send({ type: 'SUCCESS' })
      expect(actor.getSnapshot().value).toBe('confirmed')
      actor.stop()
    })

    it('allows cancel from error state', () => {
      const actor = createActor(machine).start()
      actor.send({ type: 'CONFIRM' })
      actor.send({ type: 'FAILURE' })
      actor.send({ type: 'CANCEL' })
      expect(actor.getSnapshot().value).toBe('cancelled')
      actor.stop()
    })

    it('stays in review on REMOVE_ITEM', () => {
      const actor = createActor(machine).start()
      actor.send({ type: 'REMOVE_ITEM' })
      expect(actor.getSnapshot().value).toBe('review')
      actor.stop()
    })

    it('ignores invalid transitions', () => {
      const actor = createActor(machine).start()
      // SUCCESS is not valid from review state
      actor.send({ type: 'SUCCESS' })
      expect(actor.getSnapshot().value).toBe('review')
      actor.stop()
    })
  })

  describe('order.cancel state machine', () => {
    const machine = createMachine(cancelOrderFlow.machine)

    it('starts in confirming state', () => {
      const actor = createActor(machine).start()
      expect(actor.getSnapshot().value).toBe('confirming')
      actor.stop()
    })

    it('completes confirm path: confirming → processing → cancelled', () => {
      const actor = createActor(machine).start()
      actor.send({ type: 'CONFIRM' })
      actor.send({ type: 'SUCCESS' })
      expect(actor.getSnapshot().value).toBe('cancelled')
      expect(actor.getSnapshot().status).toBe('done')
      actor.stop()
    })

    it('completes decline path: confirming → declined', () => {
      const actor = createActor(machine).start()
      actor.send({ type: 'DECLINE' })
      expect(actor.getSnapshot().value).toBe('declined')
      expect(actor.getSnapshot().status).toBe('done')
      actor.stop()
    })

    it('handles error with retry', () => {
      const actor = createActor(machine).start()
      actor.send({ type: 'CONFIRM' })
      actor.send({ type: 'FAILURE' })
      expect(actor.getSnapshot().value).toBe('error')
      actor.send({ type: 'RETRY' })
      expect(actor.getSnapshot().value).toBe('processing')
      actor.stop()
    })

    it('allows decline from error state', () => {
      const actor = createActor(machine).start()
      actor.send({ type: 'CONFIRM' })
      actor.send({ type: 'FAILURE' })
      actor.send({ type: 'DECLINE' })
      expect(actor.getSnapshot().value).toBe('declined')
      actor.stop()
    })
  })
})

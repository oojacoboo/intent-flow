import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import { defineIntent } from '../src/define-intent'

/**
 * Tests validating Intent definitions from the IntentFlow spec.
 * Uses examples from docs/concepts/intents.md.
 */

const placeOrderIntent = defineIntent({
  intentId: 'order.place',
  extractionSchema: z.object({
    item: z.string().optional(),
    quantity: z.number().int().positive().default(1),
    size: z.enum(['small', 'medium', 'large']).optional(),
    modifiers: z.array(z.string()).optional(),
  }),
  examples: [
    'I want to order a coffee',
    'Can I get a large latte?',
    'Order my usual',
    "I'll have two cappuccinos",
    'Get me a medium cold brew with oat milk',
  ],
  keywords: ['order', 'get', 'want', 'buy', 'purchase', 'have'],
  disambiguateFrom: ['menu.browse', 'order.reorder'],
})

const addItemIntent = defineIntent({
  intentId: 'order.add_item',
  extractionSchema: z.object({
    item: z.string(),
    quantity: z.number().default(1),
  }),
  examples: ['Add a muffin', 'Also get me a cookie', 'And a water'],
  keywords: ['add', 'also', 'and'],
  contextRequires: {
    activeFlow: 'order.place',
  },
})

describe('Intent Definition', () => {
  describe('defineIntent validation', () => {
    it('accepts valid intent definitions', () => {
      expect(placeOrderIntent.intentId).toBe('order.place')
      expect(placeOrderIntent.examples).toHaveLength(5)
      expect(placeOrderIntent.keywords).toContain('order')
    })

    it('accepts contextual intents', () => {
      expect(addItemIntent.contextRequires?.activeFlow).toBe('order.place')
    })

    it('rejects intent with no examples', () => {
      expect(() =>
        defineIntent({
          intentId: 'test.intent',
          extractionSchema: z.object({}),
          examples: [],
          keywords: ['test'],
        })
      ).toThrow('at least one example')
    })

    it('rejects intent with no keywords', () => {
      expect(() =>
        defineIntent({
          intentId: 'test.intent',
          extractionSchema: z.object({}),
          examples: ['test this'],
          keywords: [],
        })
      ).toThrow('at least one keyword')
    })
  })
})

describe('Intent Extraction Schema', () => {
  describe('order.place extraction', () => {
    it('extracts full order details', () => {
      const result = placeOrderIntent.extractionSchema.safeParse({
        item: 'latte',
        quantity: 2,
        size: 'large',
        modifiers: ['oat milk'],
      })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.item).toBe('latte')
        expect(result.data.quantity).toBe(2)
        expect(result.data.size).toBe('large')
        expect(result.data.modifiers).toContain('oat milk')
      }
    })

    it('applies default quantity of 1', () => {
      const result = placeOrderIntent.extractionSchema.safeParse({
        item: 'coffee',
      })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.quantity).toBe(1)
      }
    })

    it('accepts minimal extraction (all optional)', () => {
      const result = placeOrderIntent.extractionSchema.safeParse({})
      expect(result.success).toBe(true)
    })

    it('rejects invalid size enum', () => {
      const result = placeOrderIntent.extractionSchema.safeParse({
        item: 'latte',
        size: 'venti',
      })
      expect(result.success).toBe(false)
    })

    it('rejects negative quantity', () => {
      const result = placeOrderIntent.extractionSchema.safeParse({
        item: 'latte',
        quantity: -1,
      })
      expect(result.success).toBe(false)
    })

    it('rejects zero quantity', () => {
      const result = placeOrderIntent.extractionSchema.safeParse({
        item: 'latte',
        quantity: 0,
      })
      expect(result.success).toBe(false)
    })
  })

  describe('order.add_item extraction', () => {
    it('extracts item with default quantity', () => {
      const result = addItemIntent.extractionSchema.safeParse({
        item: 'muffin',
      })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.item).toBe('muffin')
        expect(result.data.quantity).toBe(1)
      }
    })

    it('requires item (not optional)', () => {
      const result = addItemIntent.extractionSchema.safeParse({})
      expect(result.success).toBe(false)
    })
  })
})

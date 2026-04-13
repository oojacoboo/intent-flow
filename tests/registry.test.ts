import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import { defineFlow } from '../src/define-flow'
import { createRegistry } from '../src/registry'

/**
 * Tests validating the FlowRegistry from the IntentFlow spec.
 * Uses patterns from docs/concepts/registry.md.
 */

const orderPlaceFlow = defineFlow({
  intentId: 'order.place',
  meta: {
    title: 'Place Order',
    description: 'Create a new order for pickup or delivery',
    category: 'orders',
  },
  schema: z.object({ items: z.array(z.string()).min(1) }),
  machine: {
    id: 'placeOrder',
    initial: 'review',
    states: {
      review: { on: { CONFIRM: 'confirmed' } },
      confirmed: { type: 'final' },
    },
  },
})

const orderTrackFlow = defineFlow({
  intentId: 'order.track',
  meta: {
    title: 'Track Order',
    description: 'Display order status and ETA',
    category: 'orders',
  },
  schema: z.object({ orderId: z.string() }),
  machine: {
    id: 'trackOrder',
    initial: 'viewing',
    states: {
      viewing: { on: { DISMISS: 'done' } },
      done: { type: 'final' },
    },
  },
})

const browseMenuFlow = defineFlow({
  intentId: 'menu.browse',
  meta: {
    title: 'Browse Menu',
    description: 'Explore available items',
    category: 'menu',
  },
  schema: z.object({ categoryFilter: z.string().optional() }),
  machine: {
    id: 'browseMenu',
    initial: 'browsing',
    states: {
      browsing: { on: { SELECT: 'viewing', DISMISS: 'done' } },
      viewing: { on: { BACK: 'browsing', DISMISS: 'done' } },
      done: { type: 'final' },
    },
  },
})

describe('FlowRegistry', () => {
  describe('registration and lookup', () => {
    it('registers and retrieves flows', () => {
      const registry = createRegistry({
        flows: [
          { definition: orderPlaceFlow },
          { definition: orderTrackFlow },
          { definition: browseMenuFlow },
        ],
      })

      expect(registry.hasFlow('order.place')).toBe(true)
      expect(registry.hasFlow('order.track')).toBe(true)
      expect(registry.hasFlow('menu.browse')).toBe(true)
      expect(registry.hasFlow('nonexistent.flow')).toBe(false)
    })

    it('returns flow definition on lookup', () => {
      const registry = createRegistry({
        flows: [{ definition: orderPlaceFlow }],
      })

      const flow = registry.getFlow('order.place')
      expect(flow?.definition.meta.title).toBe('Place Order')
      expect(flow?.definition.meta.category).toBe('orders')
    })

    it('returns undefined for unknown flows', () => {
      const registry = createRegistry({ flows: [] })
      expect(registry.getFlow('nonexistent.flow')).toBeUndefined()
    })

    it('prevents duplicate registration', () => {
      expect(() =>
        createRegistry({
          flows: [
            { definition: orderPlaceFlow },
            { definition: orderPlaceFlow },
          ],
        })
      ).toThrow('already registered')
    })
  })

  describe('filtering', () => {
    it('filters flows by category', () => {
      const registry = createRegistry({
        flows: [
          { definition: orderPlaceFlow },
          { definition: orderTrackFlow },
          { definition: browseMenuFlow },
        ],
      })

      const orderFlows = registry.getFlows({ category: 'orders' })
      expect(orderFlows).toHaveLength(2)
      expect(orderFlows.map((f) => f.definition.intentId)).toContain(
        'order.place'
      )
      expect(orderFlows.map((f) => f.definition.intentId)).toContain(
        'order.track'
      )

      const menuFlows = registry.getFlows({ category: 'menu' })
      expect(menuFlows).toHaveLength(1)
      expect(menuFlows[0].definition.intentId).toBe('menu.browse')
    })

    it('returns all flows when no filter provided', () => {
      const registry = createRegistry({
        flows: [
          { definition: orderPlaceFlow },
          { definition: orderTrackFlow },
          { definition: browseMenuFlow },
        ],
      })

      expect(registry.getFlows()).toHaveLength(3)
    })
  })

  describe('categories', () => {
    it('extracts unique categories', () => {
      const registry = createRegistry({
        flows: [
          { definition: orderPlaceFlow },
          { definition: orderTrackFlow },
          { definition: browseMenuFlow },
        ],
      })

      const categories = registry.getCategories()
      expect(categories).toContain('orders')
      expect(categories).toContain('menu')
      expect(categories).toHaveLength(2)
    })
  })

  describe('AI integration', () => {
    it('generates tool definitions for LLM integration', () => {
      const registry = createRegistry({
        flows: [
          { definition: orderPlaceFlow },
          { definition: browseMenuFlow },
        ],
      })

      const tools = registry.toToolDefinitions()
      expect(tools).toHaveLength(2)
      expect(tools[0]).toEqual({
        type: 'function',
        function: {
          name: 'order.place',
          description: 'Create a new order for pickup or delivery',
        },
      })
    })

    it('constrains AI to registered flows only', () => {
      const registry = createRegistry({
        flows: [{ definition: orderPlaceFlow }],
      })

      // AI can only invoke what's registered
      expect(registry.hasFlow('order.place')).toBe(true)
      expect(registry.hasFlow('order.delete_all')).toBe(false)
      expect(registry.hasFlow('admin.drop_database')).toBe(false)
    })
  })
})

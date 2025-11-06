/**
 * Tests for Anthropic Messages API type definitions.
 *
 * Phase 4.2 - Stage 1: Foundation & Types (10 tests)
 *
 * Test Coverage:
 * - Request structure validation
 * - Content block type checking
 * - SSE event type validation
 * - Tool schema validation
 * - Configuration types
 */

import { describe, test, expect } from 'vitest'
import type {
  MessagesApiRequest,
  AnthropicMessage,
  AnthropicContentBlock,
  AnthropicTextBlock,
  AnthropicThinkingBlock,
  AnthropicToolUseBlock,
  AnthropicToolResultBlock,
  AnthropicTool,
  AnthropicSseEvent,
  MessageStartEvent,
  ContentBlockDeltaEvent,
  AnthropicProviderConfig,
  AnthropicRateLimitInfo,
} from './types.js'

describe('Messages API Types - Stage 1', () => {
  // ============================================================================
  // Test 1: Minimal MessagesApiRequest structure
  // ============================================================================
  test('T1: Minimal MessagesApiRequest has required fields', () => {
    const request: MessagesApiRequest = {
      model: 'claude-3-5-sonnet-20241022',
      messages: [
        {
          role: 'user',
          content: [{ type: 'text', text: 'Hello' }],
        },
      ],
      stream: true,
    }

    expect(request.model).toBe('claude-3-5-sonnet-20241022')
    expect(request.messages).toHaveLength(1)
    expect(request.stream).toBe(true)
    expect(request.tools).toBeUndefined()
    expect(request.system).toBeUndefined()
  })

  // ============================================================================
  // Test 2: MessagesApiRequest with all optional fields
  // ============================================================================
  test('T2: MessagesApiRequest supports all optional fields', () => {
    const request: MessagesApiRequest = {
      model: 'claude-3-5-sonnet-20241022',
      messages: [],
      stream: false,
      max_output_tokens: 2048,
      system: 'You are a helpful assistant.',
      metadata: { trace_id: 'test-123' },
      tool_choice: 'auto',
      tools: [
        {
          name: 'get_weather',
          description: 'Get weather for a location',
          input_schema: {
            type: 'object',
            properties: {
              location: { type: 'string' },
            },
            required: ['location'],
          },
        },
      ],
      temperature: 0.7,
      top_k: 40,
      top_p: 0.9,
      stop_sequences: ['STOP'],
      thinking: { budget_tokens: 1000 },
    }

    expect(request.max_output_tokens).toBe(2048)
    expect(request.system).toBe('You are a helpful assistant.')
    expect(request.metadata?.trace_id).toBe('test-123')
    expect(request.tool_choice).toBe('auto')
    expect(request.tools).toHaveLength(1)
    expect(request.temperature).toBe(0.7)
    expect(request.thinking?.budget_tokens).toBe(1000)
  })

  // ============================================================================
  // Test 3: AnthropicMessage with text content
  // ============================================================================
  test('T3: AnthropicMessage with text content block', () => {
    const message: AnthropicMessage = {
      role: 'user',
      content: [
        {
          type: 'text',
          text: 'What is the weather?',
        },
      ],
    }

    expect(message.role).toBe('user')
    expect(message.content).toHaveLength(1)
    expect(message.content[0].type).toBe('text')
    expect((message.content[0] as AnthropicTextBlock).text).toBe('What is the weather?')
  })

  // ============================================================================
  // Test 4: Content blocks - thinking block
  // ============================================================================
  test('T4: AnthropicThinkingBlock structure', () => {
    const thinkingBlock: AnthropicThinkingBlock = {
      type: 'thinking',
      thinking: 'Let me consider the weather patterns...',
    }

    expect(thinkingBlock.type).toBe('thinking')
    expect(thinkingBlock.thinking).toContain('weather patterns')
  })

  // ============================================================================
  // Test 5: Content blocks - tool_use block
  // ============================================================================
  test('T5: AnthropicToolUseBlock structure', () => {
    const toolUseBlock: AnthropicToolUseBlock = {
      type: 'tool_use',
      id: 'toolu_123abc',
      name: 'get_weather',
      input: {
        location: 'San Francisco',
        units: 'celsius',
      },
    }

    expect(toolUseBlock.type).toBe('tool_use')
    expect(toolUseBlock.id).toBe('toolu_123abc')
    expect(toolUseBlock.name).toBe('get_weather')
    expect(toolUseBlock.input.location).toBe('San Francisco')
  })

  // ============================================================================
  // Test 6: Content blocks - tool_result block
  // ============================================================================
  test('T6: AnthropicToolResultBlock structure', () => {
    const toolResultBlock: AnthropicToolResultBlock = {
      type: 'tool_result',
      tool_use_id: 'toolu_123abc',
      content: 'Temperature: 18°C, Sunny',
      is_error: false,
    }

    expect(toolResultBlock.type).toBe('tool_result')
    expect(toolResultBlock.tool_use_id).toBe('toolu_123abc')
    expect(toolResultBlock.content).toContain('18°C')
    expect(toolResultBlock.is_error).toBe(false)
  })

  // ============================================================================
  // Test 7: Tool schema with required and optional fields
  // ============================================================================
  test('T7: AnthropicTool schema with required fields', () => {
    const tool: AnthropicTool = {
      name: 'search',
      description: 'Search the web',
      input_schema: {
        type: 'object',
        properties: {
          query: { type: 'string' },
          limit: { type: 'number' },
        },
        required: ['query'],
        additionalProperties: false,
      },
    }

    expect(tool.name).toBe('search')
    expect(tool.input_schema.type).toBe('object')
    expect(tool.input_schema.required).toEqual(['query'])
    expect(tool.input_schema.additionalProperties).toBe(false)
  })

  // ============================================================================
  // Test 8: SSE Event - message_start
  // ============================================================================
  test('T8: MessageStartEvent structure', () => {
    const event: MessageStartEvent = {
      type: 'message_start',
      message: {
        id: 'msg_123',
        type: 'message',
        role: 'assistant',
        content: [],
        model: 'claude-3-5-sonnet-20241022',
        stop_reason: null,
        stop_sequence: null,
        usage: {
          input_tokens: 10,
          output_tokens: 0,
        },
      },
    }

    expect(event.type).toBe('message_start')
    expect(event.message.id).toBe('msg_123')
    expect(event.message.role).toBe('assistant')
    expect(event.message.usage.input_tokens).toBe(10)
  })

  // ============================================================================
  // Test 9: SSE Event - content_block_delta (text)
  // ============================================================================
  test('T9: ContentBlockDeltaEvent with text delta', () => {
    const event: ContentBlockDeltaEvent = {
      type: 'content_block_delta',
      index: 0,
      delta: {
        type: 'text_delta',
        text: 'Hello ',
      },
    }

    expect(event.type).toBe('content_block_delta')
    expect(event.index).toBe(0)
    expect(event.delta.type).toBe('text_delta')
    if (event.delta.type === 'text_delta') {
      expect(event.delta.text).toBe('Hello ')
    }
  })

  // ============================================================================
  // Test 10: AnthropicProviderConfig with defaults
  // ============================================================================
  test('T10: AnthropicProviderConfig structure', () => {
    const config: AnthropicProviderConfig = {
      baseUrl: 'https://api.anthropic.com',
      anthropicVersion: '2023-06-01',
      apiKey: 'sk-ant-test123',
      reasoningEmission: 'readable',
      maxOutputTokens: 4096,
      connectTimeoutMs: 30000,
    }

    expect(config.baseUrl).toBe('https://api.anthropic.com')
    expect(config.anthropicVersion).toBe('2023-06-01')
    expect(config.reasoningEmission).toBe('readable')
    expect(config.maxOutputTokens).toBe(4096)
  })

  // ============================================================================
  // Bonus Test 11: Rate limit info structure
  // ============================================================================
  test('T11: AnthropicRateLimitInfo structure', () => {
    const rateLimit: AnthropicRateLimitInfo = {
      requests: {
        limit: 1000,
        remaining: 999,
        reset: '2025-11-06T12:00:00Z',
      },
      tokens: {
        limit: 100000,
        remaining: 95000,
        reset: '2025-11-06T12:00:00Z',
      },
    }

    expect(rateLimit.requests?.limit).toBe(1000)
    expect(rateLimit.requests?.remaining).toBe(999)
    expect(rateLimit.tokens?.limit).toBe(100000)
  })

  // ============================================================================
  // Bonus Test 12: Tool choice variants
  // ============================================================================
  test('T12: Tool choice variants', () => {
    const autoChoice = 'auto' as const
    const anyChoice = 'any' as const
    const noneChoice = 'none' as const
    const specificChoice = { type: 'tool' as const, name: 'get_weather' }

    // Type assertions to ensure all are valid
    const request1: MessagesApiRequest = {
      model: 'claude',
      messages: [],
      stream: true,
      tool_choice: autoChoice,
    }
    const request2: MessagesApiRequest = {
      model: 'claude',
      messages: [],
      stream: true,
      tool_choice: anyChoice,
    }
    const request3: MessagesApiRequest = {
      model: 'claude',
      messages: [],
      stream: true,
      tool_choice: noneChoice,
    }
    const request4: MessagesApiRequest = {
      model: 'claude',
      messages: [],
      stream: true,
      tool_choice: specificChoice,
    }

    expect(request1.tool_choice).toBe('auto')
    expect(request2.tool_choice).toBe('any')
    expect(request3.tool_choice).toBe('none')
    expect(request4.tool_choice).toEqual({ type: 'tool', name: 'get_weather' })
  })
})

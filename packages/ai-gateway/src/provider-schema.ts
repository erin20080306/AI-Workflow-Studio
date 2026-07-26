export const PLANNER_PROVIDER_JSON_SCHEMA = {
  additionalProperties: false,
  properties: {
    assumptions: {
      items: { type: 'string' },
      type: 'array',
    },
    explanation: { type: 'string' },
    mappingProposals: {
      items: {
        additionalProperties: false,
        properties: {
          confidence: { maximum: 1, minimum: 0, type: 'number' },
          reason: { type: 'string' },
          sourceColumn: { type: 'string' },
          targetColumn: { type: 'string' },
        },
        required: ['confidence', 'reason', 'sourceColumn', 'targetColumn'],
        type: 'object',
      },
      type: 'array',
    },
    workflow: {
      additionalProperties: false,
      properties: {
        description: { type: 'string' },
        edges: {
          items: {
            additionalProperties: false,
            properties: {
              from: { type: 'string' },
              to: { type: 'string' },
            },
            required: ['from', 'to'],
            type: 'object',
          },
          type: 'array',
        },
        executionTarget: {
          anyOf: [
            {
              additionalProperties: false,
              properties: {
                deviceId: { type: 'string' },
                type: { const: 'desktop', type: 'string' },
              },
              required: ['deviceId', 'type'],
              type: 'object',
            },
            {
              additionalProperties: false,
              properties: {
                type: { const: 'cloud', type: 'string' },
              },
              required: ['type'],
              type: 'object',
            },
          ],
        },
        name: { type: 'string' },
        nodes: {
          items: {
            additionalProperties: false,
            properties: {
              config: { type: 'object' },
              id: { type: 'string' },
              type: { type: 'string' },
              version: { const: 1, type: 'integer' },
            },
            required: ['config', 'id', 'type', 'version'],
            type: 'object',
          },
          type: 'array',
        },
        schemaVersion: { const: 1, type: 'integer' },
        trigger: {
          additionalProperties: false,
          properties: {
            config: { type: 'object' },
            type: { type: 'string' },
          },
          required: ['config', 'type'],
          type: 'object',
        },
      },
      required: [
        'description',
        'edges',
        'executionTarget',
        'name',
        'nodes',
        'schemaVersion',
        'trigger',
      ],
      type: 'object',
    },
  },
  required: ['assumptions', 'explanation', 'mappingProposals', 'workflow'],
  type: 'object',
} as const;

import {BecknProcessor} from '../BecknProcessor';
import * as fs from 'fs';
import axios from 'axios';
import {JsonSchemaObject} from '../BecknProcessor';

jest.mock('fs');
jest.mock('axios');

describe('BecknProcessor Unit Tests', () => {
  const mockSchema: JsonSchemaObject = {
    type: 'object',
    properties: {
      name: {type: 'string', const: 'test'},
      age: {type: 'number'},
      address: {
        type: 'object',
        properties: {
          street: {type: 'string'},
          city: {type: 'string'},
        },
      },
    },
  };

  const mockYamlContent = `
    age: 25
    address.street: "123 Main St"
    address.city: "Test City"
  `;

  beforeEach(() => {
    (fs.readFileSync as jest.Mock).mockReturnValue(mockYamlContent);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('constructor initializes properly', () => {
    const processor = new BecknProcessor('mock.yaml', mockSchema);
    expect(processor).toBeDefined();
  });

  test('staticResolve processes schema and yaml values correctly', async () => {
    const processor = new BecknProcessor('mock.yaml', mockSchema);
    await processor.staticResolve();
    const result = processor.getParsedUsecase();

    expect(result).toEqual({
      name: 'test',
      age: 25,
      address: {
        street: '123 Main St',
        city: 'Test City',
      },
    });
  });

  test('dynamicResolve with string resolver (API URL)', async () => {
    const processor = new BecknProcessor('mock.yaml', mockSchema);
    await processor.staticResolve();

    (axios.get as jest.Mock).mockResolvedValue({data: 'Dynamic Value'});

    processor.addDynamicResolver(
      'address.street',
      'http://api.example.com/street',
    );
    const result = await processor.dynamicResolve();

    expect(result.address.street).toBe('Dynamic Value');
    expect(axios.get).toHaveBeenCalledWith('http://api.example.com/street');
  });

  test('dynamicResolve with function resolver', async () => {
    const processor = new BecknProcessor('mock.yaml', mockSchema);
    await processor.staticResolve();

    const mockResolver = jest.fn().mockResolvedValue('Dynamic Function Value');
    processor.addDynamicResolver('address.city', mockResolver);

    const result = await processor.dynamicResolve();
    expect(result.address.city).toBe('Dynamic Function Value');
    expect(mockResolver).toHaveBeenCalled();
  });

  test('throws error for invalid schema', () => {
    const invalidSchema: JsonSchemaObject = {
      type: 'object',
      properties: {
        name: {type: 'number', const: 'invalid'}, // Type mismatch
      },
    };

    expect(() => {
      new BecknProcessor('mock.yaml', invalidSchema);
    }).toThrow();
  });
});

describe('BecknProcessor Integration Tests', () => {
  const realSchema: JsonSchemaObject = {
    type: 'object',
    properties: {
      context: {
        type: 'object',
        properties: {
          domain: {type: 'string', const: 'mobility'},
          action: {type: 'string'},
          timestamp: {type: 'string'},
        },
      },
      message: {
        type: 'object',
        properties: {
          order: {
            type: 'object',
            properties: {
              id: {type: 'string'},
              status: {type: 'string'},
            },
          },
        },
      },
    },
  };

  test('complete flow with static and dynamic resolvers', async () => {
    // Create actual YAML file for testing
    const yamlContent = `
      context.action: search
      message.order.status: pending
    `;

    fs.writeFileSync('test.yaml', yamlContent);

    const processor = new BecknProcessor('test.yaml', realSchema);

    // Static resolve
    await processor.staticResolve();

    // Add dynamic resolvers
    processor.addDynamicResolver('message.order.id', async () => 'ORD001');
    processor.addDynamicResolver(
      'context.timestamp',
      'http://timeapi.example.com',
    );

    // Mock API response
    (axios.get as jest.Mock).mockResolvedValue({data: '2023-01-01T00:00:00Z'});

    // Dynamic resolve
    const finalResult = await processor.dynamicResolve();

    expect(finalResult).toEqual({
      context: {
        domain: 'mobility',
        action: 'search',
        timestamp: '2023-01-01T00:00:00Z',
      },
      message: {
        order: {
          id: 'ORD001',
          status: 'pending',
        },
      },
    });

    // Cleanup
    fs.unlinkSync('test.yaml');
  });
});

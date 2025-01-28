import {BecknProcessor} from './BecknProcessor';
import * as fs from 'fs';
import axios from 'axios';
import {JsonSchemaObject} from './BecknProcessor';

jest.mock('fs');
jest.mock('axios');

describe('BecknProcessor Tests', () => {
  const mockSchema: JsonSchemaObject = {
    type: 'object',
    properties: {
      context: {
        type: 'object',
        properties: {
          domain: {type: 'string', const: 'mobility'},
          version: {type: 'string'},
          location: {
            type: 'object',
            properties: {
              city: {type: 'string'},
              country: {type: 'string'},
            },
          },
        },
      },
      message: {
        type: 'object',
        properties: {
          intent: {type: 'string'},
          dynamic_value: {type: 'string'},
        },
      },
    },
  };

  const mockYamlContent = `
    context.version: "1.0.0"
    context.location.city: "Bangalore"
    context.location.country: "India"
    message.intent: "search"
  `;

  beforeEach(() => {
    (fs.readFileSync as jest.Mock).mockReturnValue(mockYamlContent);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // Unit Tests
  describe('Unit Tests', () => {
    test('constructor should initialize with valid schema and yaml path', () => {
      const processor = new BecknProcessor('mock.yaml', mockSchema);
      expect(processor).toBeDefined();
    });

    test('getParsedUsecase should throw error for invalid schema', () => {
      const invalidSchema: JsonSchemaObject = {
        type: 'object',
        properties: {
          required_field: {type: 'string'},
        },
        required: ['required_field'],
      };

      const processor = new BecknProcessor('mock.yaml', invalidSchema);
      expect(() => processor.getParsedUsecase()).toThrow(
        'Invalid Data in Schema',
      );
    });

    test('staticResolve should process const values correctly', async () => {
      const processor = new BecknProcessor('mock.yaml', mockSchema);
      await processor.staticResolve();
      const result = processor.getParsedUsecase();
      expect(result.context.domain).toBe('mobility');
    });
  });

  // Integration Tests
  describe('Integration Tests', () => {
    test('full workflow with static and dynamic resolvers', async () => {
      const processor = new BecknProcessor('mock.yaml', mockSchema);

      // Static resolution
      await processor.staticResolve();

      // Add dynamic resolvers
      const mockApiResponse = 'dynamic api value';
      (axios.get as jest.Mock).mockResolvedValue({data: mockApiResponse});

      processor.addDynamicResolver(
        'message.dynamic_value',
        'http://api.example.com/value',
      );

      // Dynamic resolution
      await processor.dynamicResolve();

      const finalResult = processor.getParsedUsecase();

      expect(finalResult).toEqual({
        context: {
          domain: 'mobility',
          version: '1.0.0',
          location: {
            city: 'Bangalore',
            country: 'India',
          },
        },
        message: {
          intent: 'search',
          dynamic_value: mockApiResponse,
        },
      });
    });

    test('multiple dynamic resolvers with function and API URL', async () => {
      const processor = new BecknProcessor('mock.yaml', mockSchema);
      await processor.staticResolve();

      const functionResolver = async () => 'function resolved value';
      (axios.get as jest.Mock).mockResolvedValue({data: 'api resolved value'});

      processor.addDynamicResolver('message.dynamic_value', functionResolver);
      processor.addDynamicResolver(
        'context.location.city',
        'http://api.example.com/city',
      );

      await processor.dynamicResolve();
      const result = processor.getParsedUsecase();

      expect(result.message.dynamic_value).toBe('function resolved value');
      expect(result.context.location.city).toBe('api resolved value');
    });

    test('error handling for invalid YAML file', () => {
      (fs.readFileSync as jest.Mock).mockImplementation(() => {
        throw new Error('File not found');
      });

      expect(() => new BecknProcessor('invalid.yaml', mockSchema)).toThrow(
        'Error loading YAML file',
      );
    });
  });
});

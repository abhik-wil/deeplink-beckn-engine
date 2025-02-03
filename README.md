# deeplink-beckn-engine

## BecknProcessor

A TypeScript class that processes Beckn protocol schemas with static and dynamic value resolution capabilities.

### Features

- Schema validation using AJV
- Static value resolution from YAML files
- Dynamic value resolution through API calls or custom functions
- Support for nested JSON schema structures
- Built-in const value processing

### Installation

```bash
npm install @ondc/deeplink-beckn-engine
```
### Usage

```typescript
import { BecknProcessor } from 'deeplink-beckn-engine';

// Initialize with static values YAML path and schema
const processor = new BecknProcessor('path/to/static-values.yaml', schemaObject);

// Static resolution
await processor.staticResolve();

// Add dynamic resolvers
processor.addDynamicResolver('path.to.field', 'https://api.example.com/data');
processor.addDynamicResolver('path.to.other.field', async () => {
  return 'dynamic value';
});

// Dynamic resolution
await processor.dynamicResolve();

// Get final processed usecase
const result = processor.getParsedUsecase();
```
### API Reference

#### Constructor
```typescript
constructor(staticValuePath: string, usecaseSchema: JsonSchemaObject)
```

### Methods
- `staticResolve()`: Processes schema with const values and applies static YAML values
- `dynamicResolve()`: Resolves all registered dynamic resolvers
- `addDynamicResolver(path: string, resolver: (() => Promise<string>) | string)`: Adds a dynamic resolver
- `getParsedUsecase()`: Returns the final processed and validated usecase

### Schema Structure
The processor expects a JSON schema object with the following structure:

```typescript
type JsonSchemaObject = {
  type: 'object' | 'array' | 'string' | 'number' | 'integer' | 'boolean' | 'null';
  properties?: {
    [key: string]: JsonSchemaObject;
  };
  items?: JsonSchemaObject;
  required?: string[];
  additionalProperties?: boolean;
  oneOf?: Array<string | number | boolean | {const: string; title: string}>;
  const?: string;
};

```
## Author and Contributors' List
Author:
- [Abhik Banerjee](https://github.com/abhik-wil)
- [Sonali Shakya](https://github.com/sonalishakya)
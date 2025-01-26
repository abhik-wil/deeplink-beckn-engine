import * as yaml from 'js-yaml';
import * as fs from 'fs';
import axios from 'axios';

export type JsonSchemaObject = {
  $schema?: string;
  $id?: string;
  $ref?: string;
  $comment?: string;
  type:
    | 'object'
    | 'array'
    | 'string'
    | 'number'
    | 'integer'
    | 'boolean'
    | 'null';
  properties?: {
    [key: string]: JsonSchemaObject;
  };
  items?: JsonSchemaObject;
  required?: string[];
  additionalProperties?: boolean;
  oneOf?: Array<string | number | boolean | {const: string; title: string}>;
  const?: string;
};

type DynamicResolver = {
  path: string;
  resolver: (() => Promise<string>) | string;
};
export class BecknProcessor {
  private staticData: Record<string, any>;
  private parsedUsecase: Record<string, any> = {};
  private dynamicResolvers: DynamicResolver[] = [];

  constructor(
    staticValuePath: string,
    private usecaseSchema: JsonSchemaObject,
  ) {
    this.staticData = this.loadYamlFile(staticValuePath);
  }

  public getParsedUsecase() {
    return this.parsedUsecase;
  }

  private loadYamlFile(path: string): Record<string, any> {
    try {
      const fileContents = fs.readFileSync(path, 'utf8');
      return yaml.load(fileContents) as Record<string, any>;
    } catch (error) {
      throw new Error(`Error loading YAML file: ${(error as any).message}`);
    }
  }

  private processSchemaWithConst(schema: JsonSchemaObject): any {
    // Base case: if schema has const, return the const value
    if (schema.const !== undefined) {
      return schema.const;
    }

    // Handle object type
    if (schema.type === 'object' && schema.properties) {
      const result: Record<string, any> = {};
      for (const [key, value] of Object.entries(schema.properties)) {
        result[key] = this.processSchemaWithConst(value);
      }
      return result;
    }

    // Handle array type
    if (schema.type === 'array' && schema.items) {
      return [this.processSchemaWithConst(schema.items)];
    }

    // Return schema as-is for properties without const
    return {
      type: schema.type,
      ...(schema.properties && {properties: schema.properties}),
      ...(schema.items && {items: schema.items}),
      ...(schema.required && {required: schema.required}),
      ...(schema.oneOf && {oneOf: schema.oneOf}),
      ...(schema.additionalProperties !== undefined && {
        additionalProperties: schema.additionalProperties,
      }),
    };
  }
  private applyYamlValues() {
    const result = {...this.parsedUsecase};

    for (const [path, value] of Object.entries(this.staticData)) {
      const pathParts = path.split('.');
      let current = result;

      // Navigate to the nested location
      for (let i = 0; i < pathParts.length - 1; i++) {
        if (!current[pathParts[i]]) {
          current[pathParts[i]] = {};
        }
        current = current[pathParts[i]];
      }

      // Set the value at the final path
      const lastKey = pathParts[pathParts.length - 1];
      current[lastKey] = value;
    }

    return result;
  }

  public async staticResolve() {
    this.parsedUsecase = this.processSchemaWithConst(this.usecaseSchema);
    this.parsedUsecase = this.applyYamlValues();
  }

  public addDynamicResolver(
    path: string,
    resolver: (() => Promise<string>) | string,
  ) {
    this.dynamicResolvers.push({path, resolver});
  }
  public async dynamicResolve(): Promise<Record<string, any>> {
    const resolvedTemplate = {...this.parsedUsecase};

    for (const {path, resolver} of this.dynamicResolvers) {
      let value: string;

      if (typeof resolver === 'string') {
        // If resolver is an API URL
        const response = await axios.get(resolver);
        value = response.data;
      } else {
        // If resolver is a function
        value = await resolver();
      }

      // Navigate and update the nested path
      const pathParts = path.split('.');
      let current = resolvedTemplate;

      for (let i = 0; i < pathParts.length - 1; i++) {
        current = current[pathParts[i]];
      }

      current[pathParts[pathParts.length - 1]] = value;
    }

    return resolvedTemplate;
  }
}

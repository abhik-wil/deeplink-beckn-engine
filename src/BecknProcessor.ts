import * as yaml from 'js-yaml';
import * as fs from 'fs';
import axios from 'axios';
import * as path from 'path';

import Ajv, {ValidateFunction} from 'ajv';

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
  private schemaValidator: ValidateFunction;

  constructor(
    staticValuePath: string,
    private usecaseSchema: JsonSchemaObject,
  ) {
    const ajv = new Ajv();
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const {$schema, ...schema} = usecaseSchema;
    this.schemaValidator = ajv.compile(schema);
    const absolutePath = path.isAbsolute(staticValuePath)
      ? staticValuePath
      : path.resolve(process.cwd(), staticValuePath);
    this.staticData = this.loadYamlFile(absolutePath);
  }

  public getParsedUsecase() {
    const valid = this.schemaValidator(this.parsedUsecase);
    if (!valid) {
      throw new Error('Invalid Data in Schema', {
        cause: {
          validationErrors: this.schemaValidator.errors,
          currentParsedData: this.parsedUsecase,
        },
      });
    }
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
    const temp = this.applyYamlValues();
    this.parsedUsecase = temp;
  }

  public addDynamicResolver(
    path: string,
    resolver: (() => Promise<string>) | string,
  ) {
    this.dynamicResolvers.push({path, resolver});
  }

  public async dynamicResolve() {
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

    this.parsedUsecase = resolvedTemplate;
  }
}

/**
 * Schema 验证器
 * 
 * @module core/workflow/schemaValidator
 * @description 工作流输入/输出 Schema 验证和类型推断
 */

// ============================================
// 类型定义
// ============================================

export type SchemaType =
    | 'string'
    | 'number'
    | 'boolean'
    | 'array'
    | 'object'
    | 'any'
    | 'null';

export interface SchemaField {
    name: string;
    type: SchemaType;
    description?: string;
    required?: boolean;
    default?: any;
    items?: SchemaField;      // 数组元素类型
    properties?: SchemaField[];  // 对象属性
    enum?: any[];             // 枚举值
    min?: number;             // 数字最小值或字符串最小长度
    max?: number;             // 数字最大值或字符串最大长度
    pattern?: string;         // 正则模式
}

export interface Schema {
    type: 'object';
    fields: SchemaField[];
    description?: string;
}

export interface ValidationResult {
    valid: boolean;
    errors: ValidationError[];
}

export interface ValidationError {
    path: string;
    message: string;
    expected?: any;
    received?: any;
}

// ============================================
// 验证函数
// ============================================

/**
 * 验证数据是否符合 Schema
 */
export function validateSchema(data: any, schema: Schema): ValidationResult {
    const errors: ValidationError[] = [];

    if (schema.type !== 'object') {
        return { valid: false, errors: [{ path: '', message: '根 Schema 必须是 object 类型' }] };
    }

    for (const field of schema.fields) {
        const value = data?.[field.name];
        const fieldErrors = validateField(value, field, field.name);
        errors.push(...fieldErrors);
    }

    return {
        valid: errors.length === 0,
        errors
    };
}

/**
 * 验证单个字段
 */
function validateField(value: any, field: SchemaField, path: string): ValidationError[] {
    const errors: ValidationError[] = [];

    // 必填检查
    if (field.required && (value === undefined || value === null)) {
        errors.push({
            path,
            message: '必填字段缺失',
            expected: field.type,
            received: 'undefined'
        });
        return errors;
    }

    // 非必填且为空，跳过验证
    if (value === undefined || value === null) {
        return errors;
    }

    // 类型检查
    const actualType = getType(value);
    if (field.type !== 'any' && actualType !== field.type) {
        errors.push({
            path,
            message: `类型不匹配`,
            expected: field.type,
            received: actualType
        });
        return errors;
    }

    // 枚举检查
    if (field.enum && !field.enum.includes(value)) {
        errors.push({
            path,
            message: `值不在允许范围内`,
            expected: field.enum,
            received: value
        });
    }

    // 字符串验证
    if (field.type === 'string' && typeof value === 'string') {
        if (field.min !== undefined && value.length < field.min) {
            errors.push({ path, message: `长度小于最小值 ${field.min}` });
        }
        if (field.max !== undefined && value.length > field.max) {
            errors.push({ path, message: `长度大于最大值 ${field.max}` });
        }
        if (field.pattern) {
            const regex = new RegExp(field.pattern);
            if (!regex.test(value)) {
                errors.push({ path, message: `不匹配模式 ${field.pattern}` });
            }
        }
    }

    // 数字验证
    if (field.type === 'number' && typeof value === 'number') {
        if (field.min !== undefined && value < field.min) {
            errors.push({ path, message: `值小于最小值 ${field.min}` });
        }
        if (field.max !== undefined && value > field.max) {
            errors.push({ path, message: `值大于最大值 ${field.max}` });
        }
    }

    // 数组验证
    if (field.type === 'array' && Array.isArray(value)) {
        if (field.items) {
            value.forEach((item, index) => {
                const itemErrors = validateField(item, field.items!, `${path}[${index}]`);
                errors.push(...itemErrors);
            });
        }
    }

    // 对象验证
    if (field.type === 'object' && field.properties) {
        for (const prop of field.properties) {
            const propErrors = validateField(value[prop.name], prop, `${path}.${prop.name}`);
            errors.push(...propErrors);
        }
    }

    return errors;
}

/**
 * 获取值的类型
 */
function getType(value: any): SchemaType {
    if (value === null) return 'null';
    if (Array.isArray(value)) return 'array';
    const jsType = typeof value;
    if (jsType === 'string' || jsType === 'number' || jsType === 'boolean' || jsType === 'object') {
        return jsType as SchemaType;
    }
    return 'any';
}

// ============================================
// 类型推断
// ============================================

/**
 * 从数据推断 Schema
 */
export function inferSchema(data: any, name: string = 'root'): SchemaField {
    const type = getType(data);

    const field: SchemaField = { name, type };

    if (type === 'array' && Array.isArray(data) && data.length > 0) {
        // 推断数组元素类型 (使用第一个元素)
        field.items = inferSchema(data[0], 'item');
    }

    if (type === 'object' && data !== null) {
        field.properties = Object.keys(data).map(key => inferSchema(data[key], key));
    }

    return field;
}

/**
 * 生成默认值
 */
export function getDefaultValue(field: SchemaField): any {
    if (field.default !== undefined) return field.default;

    switch (field.type) {
        case 'string': return '';
        case 'number': return 0;
        case 'boolean': return false;
        case 'array': return [];
        case 'object': {
            const obj: Record<string, any> = {};
            field.properties?.forEach(prop => {
                obj[prop.name] = getDefaultValue(prop);
            });
            return obj;
        }
        case 'null': return null;
        default: return undefined;
    }
}

// ============================================
// Schema 转换
// ============================================

/**
 * 转换为 JSON Schema 格式
 */
export function toJsonSchema(schema: Schema): object {
    return {
        type: 'object',
        properties: Object.fromEntries(
            schema.fields.map(field => [field.name, fieldToJsonSchema(field)])
        ),
        required: schema.fields.filter(f => f.required).map(f => f.name)
    };
}

function fieldToJsonSchema(field: SchemaField): object {
    const result: any = { type: field.type };

    if (field.description) result.description = field.description;
    if (field.enum) result.enum = field.enum;
    if (field.default !== undefined) result.default = field.default;

    if (field.type === 'string') {
        if (field.min !== undefined) result.minLength = field.min;
        if (field.max !== undefined) result.maxLength = field.max;
        if (field.pattern) result.pattern = field.pattern;
    }

    if (field.type === 'number') {
        if (field.min !== undefined) result.minimum = field.min;
        if (field.max !== undefined) result.maximum = field.max;
    }

    if (field.type === 'array' && field.items) {
        result.items = fieldToJsonSchema(field.items);
    }

    if (field.type === 'object' && field.properties) {
        result.properties = Object.fromEntries(
            field.properties.map(p => [p.name, fieldToJsonSchema(p)])
        );
    }

    return result;
}

export default {
    validateSchema,
    inferSchema,
    getDefaultValue,
    toJsonSchema
};

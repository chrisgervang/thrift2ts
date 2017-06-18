/// <reference="../node_modules/@types/node/index.d.ts" />

// Principles

//- filename: name.thrift -> nameService.ts

//- include 'Common.thrift' -> import * as Common from './CommonService'
//- enum -> enum
//- struct/union/exception -> interface

//- map -> {[key: string]: type}
//- list/set -> type[]
//- i16/i32/i64/double -> number
//- bool -> boolean
//- string -> string
//- byte -> byte
//- binary -> binary
//- const -> const
//- void -> void
//- typedef/namespace (drop)
//- service (explode functions, (service name).(function name) -> rpc method string)
//- extends (drop)
//- required/optional -> type/type?

// import path from 'path'
import { thrift2TsPath, getThriftFileName} from './helpers';

const header = `/**\r * Auto generated by Thrift2Ts.\r *\r * ${(new Date()).toString()}\r */\r\r`;

const defaultExports = [];

const simplifyType = (type): string|object => {
    if (typeof type === 'string') {
        return type;
    }

    switch (type.name.toLowerCase()) {
        case 'map':
        case 'list':
        case 'set':
            return type;
        default:
            return type.name.toString();
    }
}

const valueTypeTransformer = (type): string => {
    type = simplifyType(type);

    if (typeof type === 'string') {
        switch (type) {
            case 'i16':
            case 'i32':
            case 'i64':
            case 'double':
                return 'number';
            case 'bool':
                return 'boolean';
            default:
                return type;
        }
    }

    switch (type['name']) {
        case 'map':
            return `{[key: ${type['keyType']}]: ${valueTypeTransformer(type['valueType'])}}`;
        case 'list':
        case 'set':
            return `${valueTypeTransformer(type['valueType'])}[]`;
    }
    throw new Error(`Unexpected value type: ${JSON.stringify(type)}`);
}

const valueTransformer = (value, isMap = false): string => {
    if (typeof value === 'string') {
        return `\"${value}\"`;
    }
    if (['number', 'boolean'].indexOf(typeof value) > -1) {
        return value.toString();
    }
    if (value instanceof Array) {
        if (isMap) {
            return `{${value.map(v => valueTransformer(v)).join(', ')}}`;
        }
        return `[${value.map(v => valueTransformer(v)).join(', ')}]`;
    }
    if (typeof value === 'object' && value['key'] !== undefined && value['value'] !== undefined) {
        return `"${value['key']}": ${valueTransformer(value['value'])}`;
    }
    throw new Error(`Unexpected value: ${JSON.stringify(value)}`);
}

const includesHandler = (includes: object[]): string => {
    let imports = '';
    Object.keys(includes).map(key => includes[key]).forEach(include => {
        imports += `\r\nimport * as ${getThriftFileName(include.value)} from "${thrift2TsPath(include.value)}";\r\n`;
    });
    return imports;
}

const constsHandler = (consts: object[]): string => {
    let newConsts = '';
    Object.keys(consts).forEach(key => {
        newConsts += `\r\nexport const ${key}: ${valueTypeTransformer(consts[key]['type'])} = ${valueTransformer(consts[key]['value'], typeof consts[key]['type'] === 'object' && consts[key]['type']['name'] === 'map')}; \r\n`;
    });
    return newConsts;
}

const enumsHandler = (enums: object[]): string => {
    let newEnums = '';
    Object.keys(enums).forEach(key => {
        newEnums += enumHandler(key, enums[key]['items']);
    })
    return newEnums;
}

const enumHandler = (name, items: object[]): string => {
    let lastValue = -1;
    let code = `\r\nexport enum ${name} {`;
    items.forEach((item, index) => {
        if (item['value'] === undefined) {
            item['value'] = lastValue + 1;
        }
        lastValue = item['value'];
        code += `\r\n    ${item['name']} = ${item['value']}`;
        if (index < items.length - 1) {
            code += ','
        }
    })
    code += '\r\n}\r\n';

    return code;
}

const structsLikeHandler = (values: object[]): string => {
    let interfaces = '';
    Object.keys(values).forEach(key => {
        interfaces += structLikeHandler(key, values[key]);
    })
    return interfaces;
}

const structLikeHandler = (name, items: object[]): string => {
    let code = `\r\nexport interface ${name} {`;
    items.forEach((item, index) => {
        code += `\r\n    ${item['name']}`;
        if (item['option'] === 'optional') {
            code += '?';
        }
        code += `: ${valueTypeTransformer(item['type'])}`;
        if (index < items.length - 1) {
            code += ','
        }
    })
    code += '\r\n}\r\n';

    return code;
}

const servicesHandler = (services: object[]): string => {
    let code = '';
    Object.keys(services).forEach(key => {
        code += serviceHandler(key, services[key]);
    })
    return code;
}

const serviceHandler = (name, service): string => {
    let code = '';
    let functions = service['functions'];
    Object.keys(functions).forEach(key => {
        code += serviceFunctionHandler(name, functions[key]);
    })
    return code;
}

const serviceFunctionHandler = (name, serviceFunc): string => {
    let code = '';
    const method = `${name}.${serviceFunc['name']}`;
    const returnType = valueTypeTransformer(serviceFunc['type']);

    // args
    let args: object[] = serviceFunc['args'];
    let argNames = [];
    let argNameAndTypes = [];
    args.forEach(arg => {
        argNames.push(arg['name']);
        argNameAndTypes.push(`${arg['name']}: ${valueTypeTransformer(arg['type'])}`);
    })

    code += `\r\nexport function ${serviceFunc['name']}(${argNameAndTypes.join(', ')}): Promise<${returnType}> {\r\n`;
    code += `    return webApi<${returnType}>("${method}", { ${argNames.join(', ')} })`;
    code += '\r\n}\r\n'

    defaultExports.push(serviceFunc['name']);
    return code;
}

const defaultExportsHandler = (): string => {
    let code = '\r\n\r\nexport default {\r\n';
    defaultExports.forEach((v, i) => {
        code += `    ${v}`;
        if (i < defaultExports.length - 1) {
            code += ',';
        }
        code += '\r\n';
    })
    code += '}\r\n';
    return code;
}

module.exports = (ast: any, webAPIPath = './webAPI'): string => {
    let code = '';

    code += header;

    // include webApi
    if (webAPIPath) {
        code += `import webApi from "${webAPIPath}";\r\n`
    }

    // includes -> import
    if (ast.include) {
        code += includesHandler(ast.include);
    }

    // const -> const
    if (ast.const) {
        code += constsHandler(ast.const);
    }

    // enum -> interface
    if (ast.enum) {
        code += enumsHandler(ast.enum);
    }

    // struct -> interface
    // union -> interface
    // exception -> interface
    if (ast.exception) {
        code += structsLikeHandler(ast.exception);
    }

    if (ast.struct) {
        code += structsLikeHandler(ast.struct);
    }

    if (ast.union) {
        code += structsLikeHandler(ast.union);
    }

    // service -> functions
    if (ast.service) {
        code += servicesHandler(ast.service);
    }

    // default export 
    code += defaultExportsHandler();

    return code;
}

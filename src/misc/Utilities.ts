// import { ICompilerFile } from '../compiler';
import * as path from 'path';

import cloneDeep = require('lodash.clonedeep');


enum AllowedInternalModules {
    path,
    url,
    crypto,
    buffer,
    fs,
    events,
    stream,
    net,
}

export class Utilities {
    public static deepClone<T>(item: T): T {
        return cloneDeep(item);
    }

    public static deepFreeze<T>(item: any): T {
        Object.freeze(item);

        Object.getOwnPropertyNames(item).forEach((prop: string) => {
            // tslint:disable-next-line:max-line-length
            if (item.hasOwnProperty(prop) && item[prop] !== null && (typeof item[prop] === 'object' || typeof item[prop] === 'function') && !Object.isFrozen(item[prop])) {
                Utilities.deepFreeze(item[prop]);
            }
        });

        return item;
    }

    public static deepCloneAndFreeze<T>(item: T): T {
        return Utilities.deepFreeze(Utilities.deepClone(item));
    }

    public static allowedInternalModuleRequire(moduleName: string): boolean {
        return moduleName in AllowedInternalModules;
    }

    public static transformModuleForCustomRequire(moduleName: string): string {
        return `${ path.normalize(moduleName).replace(/\.\.?\//g, '').replace(/^\//, '') }.ts`;
    }
}

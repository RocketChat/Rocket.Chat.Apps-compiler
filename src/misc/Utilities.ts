import { patchRequire } from 'fs-monkey';
import { vol } from 'memfs';
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

    // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
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

    public static memoryRequire(files: { [path: string]: string }, path: string): Promise<any> {
        const transformedFiles = Object.entries(files)
            .map(([path, content]) => ({ [`/${ path }`]: content }))
            .reduce((files, file) => Object.assign(files, file), {});

        vol.fromJSON(transformedFiles);
        const unpatch = patchRequire(vol);
        // eslint-disable-next-line @typescript-eslint/no-var-requires,import/no-dynamic-require
        const module = require(`/${ path }`);
        unpatch();

        return module;
    }
}

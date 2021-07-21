import * as vm from 'vm';
import path from 'path';

import { ICompilerResult } from '../definition';
import { IPermission } from '../definition/IPermission';
import { getAvailablePermissions } from '../misc/getAvailablePermissions';
import { Utilities } from '../misc/Utilities';

export class AppsEngineValidator {
    constructor(private readonly appSourceRequire: NodeRequire) { }

    public validateAppPermissionsSchema(permissions: Array<IPermission>): void {
        if (!permissions) {
            return;
        }

        if (!Array.isArray(permissions)) {
            throw new Error('Invalid permission definition. Check your manifest file.');
        }

        const permissionsRequire = this.appSourceRequire('@rocket.chat/apps-engine/server/permissions/AppPermissions');

        if (!permissionsRequire || !permissionsRequire.AppPermissions) {
            return;
        }

        const availablePermissions = getAvailablePermissions(permissionsRequire.AppPermissions);

        permissions.forEach((permission) => {
            if (permission && !availablePermissions.includes(permission.name)) {
                throw new Error(`Invalid permission "${ String(permission.name) }" defined. Check your manifest file`);
            }
        });
    }

    public isValidAppInterface(interfaceName: string): boolean {
        const { AppInterface } = this.appSourceRequire('@rocket.chat/apps-engine/definition/metadata');

        return !!AppInterface[interfaceName];
    }

    public checkInheritance(mainClassFile: string, compilationResult: ICompilerResult): void {
        const { App: EngineBaseApp } = this.appSourceRequire('@rocket.chat/apps-engine/definition/App');
        const mainClassModule = this.compiledRequire(mainClassFile, compilationResult);

        if (!mainClassModule.default && !mainClassModule[mainClassFile]) {
            throw new Error(`There must be an exported class "${ mainClassFile }" or a default export in the main class file.`);
        }

        const RealApp = mainClassModule.default ? mainClassModule.default : mainClassModule[mainClassFile];
        const mockInfo = { name: '', requiredApiVersion: '', author: { name: '' } };
        const mockLogger = { debug: () => { } };
        const realApp = new RealApp(mockInfo, mockLogger);

        if (!(realApp instanceof EngineBaseApp)) {
            throw new Error('App must extend apps-engine\'s "App" abstract class.'
                + ' Maybe you forgot to install dependencies? Try running `npm install`'
                + ' in your app folder to fix it.',
            );
        }
    }

    /**
     * Require a module from the app compiled  source files
     */
    private compiledRequire(filename: string, compilationResult: ICompilerResult): any {
        const exports = {};
        const context = vm.createContext({
            require: (filepath: string) => {
                // Handles Apps-Engine import
                if (filepath.startsWith('@rocket.chat/apps-engine/definition/')) {
                    return this.appSourceRequire(filepath);
                }

                // Handles native node modules import
                if (Utilities.allowedInternalModuleRequire(filepath)) {
                    return require(filepath);
                }

                // At this point, if the app is trying to require anything that
                // is not a relative path, we don't want to let it through
                if (!filepath.startsWith('.')) {
                    return undefined;
                }

                filepath = path.normalize(`${ path.dirname(filename) }/${ filepath }`);

                // Handles import of other files in app's source
                if (compilationResult.files[filepath.endsWith('.js') ? filepath : `${ filepath }.js`]) {
                    return this.compiledRequire(filepath, compilationResult);
                }
            },
            exports,
        });

        vm.runInContext(compilationResult.files[`${ filename }.js` as keyof ICompilerResult['files']].compiled, context);

        return exports;
    }
}

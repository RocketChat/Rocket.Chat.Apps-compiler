import * as vm from "vm";
import path from "path";

import type { AppInterface } from "@rocket.chat/apps-engine/definition/metadata";
import type { ICompilerResult } from "../definition";
import type { IPermission } from "../definition/IPermission";
import type { IAppPermissions } from "../misc/getAvailablePermissions";
import { getAvailablePermissions } from "../misc/getAvailablePermissions";
import { Utilities } from "../misc/Utilities";

export class AppsEngineValidator {
    private readonly safeAppSourceRequire: (id: string) => any;

    constructor(private readonly appSourceRequire: NodeJS.Require) {
        this.safeAppSourceRequire = (id: string) => {
            try {
                return appSourceRequire(id);
            } catch {
                // It's ok not to find it
            }
        };
    }

    public validateAppPermissionsSchema(permissions: Array<IPermission>): void {
        if (!permissions) {
            return;
        }

        if (!Array.isArray(permissions)) {
            throw new Error(
                "Invalid permission definition. Check your manifest file.",
            );
        }

        const {
            AppPermissions,
        }: { AppPermissions: IAppPermissions | undefined } =
            this.safeAppSourceRequire(
                "@rocket.chat/apps-engine/server/permissions/AppPermissions",
            ) ||
            this.safeAppSourceRequire(
                "@rocket.chat/apps-engine/definition/metadata/AppPermissions",
            ) ||
            {};

        if (!AppPermissions) {
            console.warn(
                "Failed to read available permissions from the apps-engine. Permission definition will not be validated",
            );
            return;
        }

        const availablePermissions = getAvailablePermissions(AppPermissions);

        permissions.forEach((permission) => {
            if (permission && !availablePermissions.includes(permission.name)) {
                throw new Error(
                    `Invalid permission "${String(permission.name)}" defined. Check your manifest file`,
                );
            }
        });
    }

    public isValidAppInterface(interfaceName: string): boolean {
        const { AppInterface }: { AppInterface: AppInterface | undefined } =
            this.safeAppSourceRequire(
                "@rocket.chat/apps-engine/definition/metadata",
            ) ||
            this.safeAppSourceRequire(
                "@rocket.chat/apps-engine/server/compiler/AppImplements",
            );

        return !!AppInterface[interfaceName as keyof AppInterface];
    }

    public resolveAppDependencyPath(module: string): string | undefined {
        try {
            return this.appSourceRequire.resolve(module);
        } catch (e) {
            console.warn(e);
        }
    }

    public checkInheritance(
        mainClassFile: string,
        compilationResult: ICompilerResult,
    ): void {
        const { App: EngineBaseApp } = this.appSourceRequire(
            "@rocket.chat/apps-engine/definition/App",
        );
        const mainClassModule = this.compiledRequire(
            mainClassFile,
            compilationResult,
        );

        let RealApp;

        if (typeof mainClassModule === "function") {
            RealApp = mainClassModule;
        } else {
            RealApp =
                mainClassModule?.default ?? mainClassModule[mainClassFile];
        }

        if (!RealApp) {
            throw new Error(
                `There must be an exported class "${mainClassFile}" or a default export in the main class file.`,
            );
        }

        const mockInfo = {
            name: "",
            requiredApiVersion: "",
            author: { name: "" },
        };
        const mockLogger = { debug: () => {} };
        const realApp = new RealApp(mockInfo, mockLogger);

        if (!(realApp instanceof EngineBaseApp)) {
            throw new Error(
                'App must extend apps-engine\'s "App" abstract class.' +
                    " Maybe you forgot to install dependencies? Try running `npm install`" +
                    " in your app folder to fix it.",
            );
        }
    }

    /**
     * Require a module from the app compiled  source files
     */
    private compiledRequire(
        filename: string,
        compilationResult: ICompilerResult,
    ): any {
        filename = filename.replace(/\\/g, "/");
        const exports = {};
        const context = vm.createContext({
            require: (filepath: string) => {
                // Handles Apps-Engine import
                if (
                    filepath.startsWith("@rocket.chat/apps-engine/definition/")
                ) {
                    return this.appSourceRequire(filepath);
                }

                // Handles native node modules import
                if (Utilities.allowedInternalModuleRequire(filepath)) {
                    return require(filepath);
                }

                // At this point, if the app is trying to require anything that
                // is not a relative path, we don't want to let it through
                if (!filepath.startsWith(".")) {
                    return undefined;
                }

                filepath = path.posix.normalize(
                    path.posix.join(path.posix.dirname(filename), filepath),
                );

                // Handles import of other files in app's source
                if (
                    compilationResult.files[
                        filepath.endsWith(".js") ? filepath : `${filepath}.js`
                    ]
                ) {
                    return this.compiledRequire(filepath, compilationResult);
                }
            },
            exports,
        });

        const result = vm.runInContext(
            compilationResult.files[
                `${filename}.js` as keyof ICompilerResult["files"]
            ].compiled,
            context,
        );

        /**
         * `result` will contain ONLY the result of the last line evaluated
         * in the script by `vm.runInContext`, and NOT the full `exports` object.
         *
         * However, we need to handle this case due to backwards compatibility,
         * since the main class file might export a class with an unknown name,
         * which was supported in the early versions of the Apps-Engine.
         *
         * So here, if we find that the required file exports ONLY ONE property,
         * which is what happens in the case of the main class file, we can return
         * the `result`; otherwise, we return the full `exports` object.
         */
        if (Object.keys(exports).length === 1) {
            return result;
        }
        return exports;
    }
}

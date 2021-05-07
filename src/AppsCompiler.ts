import * as fs from 'fs';
import * as vm from 'vm';
import * as path from 'path';
import * as fallbackTypescript from 'typescript';
import {
    CompilerOptions, Diagnostic, EmitOutput,
    HeritageClause, LanguageServiceHost,
    ModuleResolutionHost, ResolvedModule,
} from 'typescript';

import { createRequire } from 'module';
import { Omit } from './misc/util';
import { getAppSource } from './compiler/getAppSource';
import { IAppSource, ICompilerDescriptor, ICompilerFile, ICompilerResult, IMapCompilerFile, IFiles } from './definition';
import { Utilities } from './misc/Utilities';
import { FolderDetails } from './misc/folderDetails';
import { AppPackager } from './misc/appPackager';
import { ICompilerDiagnostic } from './definition/ICompilerDiagnostic';
import { IPermission } from './definition/IPermission';
import { getAvailablePermissions } from './misc/getAvailablePermissions';

type TypeScript = typeof fallbackTypescript;

export class AppsCompiler {
    private readonly compilerOptions: CompilerOptions;

    private libraryFiles: IMapCompilerFile;

    private compiled: IFiles;

    private implemented: string[];

    private wd: string;

    private _appRequire: NodeRequire;

    constructor(
        private readonly compilerDesc: ICompilerDescriptor,
        private readonly ts: TypeScript = fallbackTypescript,
    ) {
        this.compilerOptions = {
            target: this.ts.ScriptTarget.ES2017,
            module: this.ts.ModuleKind.CommonJS,
            moduleResolution: this.ts.ModuleResolutionKind.NodeJs,
            declaration: false,
            noImplicitAny: false,
            removeComments: true,
            strictNullChecks: true,
            noImplicitReturns: true,
            emitDecoratorMetadata: true,
            experimentalDecorators: true,
            types: ['node'],
            // Set this to true if you would like to see the module resolution process
            traceResolution: false,
        };
        this.libraryFiles = {};
    }

    /**
    * Requires a module from the app's node_modules directory
    *
    * @param id {string} The id of the module
     */
    public get appRequire(): NodeRequire {
        return this._appRequire;
    }

    public async compile(path: string): Promise<ICompilerResult> {
        this.wd = path;
        this._appRequire = createRequire(`${ path }/app.json`);

        const source = await getAppSource(path);

        // Pre compilation validations
        this.validateAppPermissionsSchema(source.appInfo.permissions);

        const compilerResult = this.toJs(source);
        const { files, implemented } = compilerResult;
        const { permissions } = source.appInfo;

        this.validateAppPermissionsSchema(permissions);

        this.compiled = Object.entries(files)
            .map(([, { name, compiled }]) => ({ [name]: compiled }))
            .reduce((acc, cur) => Object.assign(acc, cur), {});
        this.implemented = implemented;

        // Post compilation validations
        this.checkInheritance(source.appInfo.classFile.replace(/\.ts$/, ''));

        return Object.assign(compilerResult, { permissions });
    }

    public output(): IFiles {
        return this.compiled;
    }

    public getImplemented(): string[] {
        return this.implemented;
    }

    public async outputZip(outputPath: string): Promise<Buffer> {
        const fd = new FolderDetails(this.wd);
        try {
            // @NOTE this is important for generating the zip file with the correct name
            await fd.readInfoFile();
        } catch (e) {
            console.error(e && e.message ? e.message : e);
            return;
        }

        const packager = new AppPackager(this.compilerDesc, fd, this, outputPath);
        return fs.promises.readFile(await packager.zipItUp());
    }

    private validateAppPermissionsSchema(permissions: Array<IPermission>): void {
        if (!permissions) {
            return;
        }

        if (!Array.isArray(permissions)) {
            throw new Error('Invalid permission definition. Check your manifest file.');
        }

        const permissionsRequire = this.appRequire('@rocket.chat/apps-engine/server/permissions/AppPermissions');

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

    private toJs({ appInfo, sourceFiles: files }: IAppSource): Omit<ICompilerResult, 'permissions'> {
        if (!appInfo.classFile || !files[appInfo.classFile] || !this.isValidFile(files[appInfo.classFile])) {
            throw new Error(`Invalid App package. Could not find the classFile (${ appInfo.classFile }) file.`);
        }

        const startTime = Date.now();

        const result: Omit<ICompilerResult, 'permissions'> = {
            files,
            implemented: [],
            diagnostics: [],
            duration: NaN,
            name: appInfo.name,
            version: appInfo.version,
            typeScriptVersion: this.ts.version,
        };

        // Verify all file names are normalized
        // and that the files are valid
        Object.keys(result.files).forEach((key) => {
            if (!this.isValidFile(result.files[key])) {
                throw new Error(`Invalid TypeScript file: "${ key }".`);
            }

            result.files[key].name = path.normalize(result.files[key].name);
        });

        const modulesNotFound: ICompilerDiagnostic[] = [];
        const host = {
            getScriptFileNames: () => Object.keys(result.files),
            getScriptVersion: (fileName) => {
                fileName = path.normalize(fileName);
                const file = result.files[fileName] || this.getLibraryFile(fileName);
                return file && file.version.toString();
            },
            getScriptSnapshot: (fileName) => {
                fileName = path.normalize(fileName);
                const file = result.files[fileName] || this.getLibraryFile(fileName);

                if (!file || !file.content) {
                    return;
                }

                return this.ts.ScriptSnapshot.fromString(file.content);
            },
            getCompilationSettings: () => this.compilerOptions,
            getCurrentDirectory: () => this.wd,
            getDefaultLibFileName: () => this.ts.getDefaultLibFilePath(this.compilerOptions),
            fileExists: (fileName: string): boolean => this.ts.sys.fileExists(fileName),
            readFile: (fileName: string): string | undefined => this.ts.sys.readFile(fileName),
            resolveModuleNames: (moduleNames: Array<string>, containingFile: string): Array<ResolvedModule> => {
                const resolvedModules: ResolvedModule[] = [];
                const moduleResHost: ModuleResolutionHost = {
                    fileExists: host.fileExists, readFile: host.readFile, trace: (traceDetail) => console.log(traceDetail),
                };

                for (const moduleName of moduleNames) {
                    const index = this.resolver(moduleName, resolvedModules, containingFile, result, this.wd, moduleResHost);
                    if (index === -1) {
                        modulesNotFound.push({
                            filename: containingFile,
                            line: 0,
                            character: 0,
                            lineText: '',
                            message: `Failed to resolve module: ${ moduleName }`,
                            originalMessage: `Module not found: ${ moduleName }`,
                            originalDiagnostic: undefined,
                        });
                    }
                }

                return resolvedModules;
            },
        } as LanguageServiceHost;

        const languageService = this.ts.createLanguageService(host, this.ts.createDocumentRegistry());

        try {
            const coDiag = languageService.getCompilerOptionsDiagnostics();
            if (coDiag.length !== 0) {
                console.log(coDiag);

                console.error('A VERY UNEXPECTED ERROR HAPPENED THAT SHOULD NOT!');
                // console.error('Please report this error with a screenshot of the logs. ' +
                //     `Also, please email a copy of the App being installed/updated: ${ info.name } v${ info.version } (${ info.id })`);

                throw new Error(`Language Service's Compiler Options Diagnostics contains ${ coDiag.length } diagnostics.`);
            }
        } catch (e) {
            if (modulesNotFound.length !== 0) {
                result.diagnostics = modulesNotFound;
                result.duration = Date.now() - startTime;

                return result;
            }

            throw e;
        }

        const src = languageService.getProgram().getSourceFile(appInfo.classFile);

        this.ts.forEachChild(src, (n) => {
            if (!this.ts.isClassDeclaration(n)) return;

            this.ts.forEachChild(n, (node) => {
                if (this.ts.isHeritageClause(node)) {
                    const e = node as HeritageClause;

                    this.ts.forEachChild(node, (nn) => {
                        if (e.token === this.ts.SyntaxKind.ImplementsKeyword) {
                            result.implemented.push(nn.getText());
                        }
                    });
                }
            });
        });

        Object.defineProperty(result, 'diagnostics', {
            value: this.normalizeDiagnostics(this.ts.getPreEmitDiagnostics(languageService.getProgram())),
            configurable: false,
            writable: false,
        });

        Object.keys(result.files).forEach((key) => {
            const file: ICompilerFile = result.files[key];
            const output: EmitOutput = languageService.getEmitOutput(file.name);

            file.name = key.replace(/\.ts$/g, '.js');

            delete result.files[key];
            result.files[file.name] = file;

            file.compiled = output.outputFiles[0].text;
        });

        result.duration = Date.now() - startTime;

        return result;
    }

    private normalizeDiagnostics(diagnostics: Array<Diagnostic>): Array<ICompilerDiagnostic> {
        return diagnostics.map((diag) => {
            const message = this.ts.flattenDiagnosticMessageText(diag.messageText, '\n');

            const norm: ICompilerDiagnostic = {
                originalDiagnostic: diag,
                originalMessage: message,
                message,
            };

            // Let's make the object more "loggable"
            Object.defineProperties(norm, {
                originalDiagnostic: { enumerable: false },
            });

            if (diag.file) {
                const { line, character } = diag.file.getLineAndCharacterOfPosition(diag.start);
                const lineStart = diag.file.getPositionOfLineAndCharacter(line, 0);

                Object.assign(norm, {
                    filename: diag.file.fileName,
                    line,
                    character,
                    lineText: diag.file.getText().substring(lineStart, diag.file.getLineEndOfPosition(lineStart)),
                    message: `Error ${ diag.file.fileName } (${ line + 1 },${ character + 1 }): ${ message }`,
                });
            }

            return norm;
        });
    }

    public resolvePath(containingFile: string, moduleName: string, cwd: string): string {
        const currentFolderPath = path.dirname(containingFile).replace(cwd.replace(/\/$/, ''), '');
        const modulePath = path.join(currentFolderPath, moduleName);

        // Let's ensure we search for the App's modules first
        const transformedModule = Utilities.transformModuleForCustomRequire(modulePath);
        if (transformedModule) {
            return transformedModule;
        }
    }

    public resolver(
        moduleName: string,
        resolvedModules: Array<ResolvedModule>,
        containingFile: string,
        result: Omit<ICompilerResult, 'permissions'>,
        cwd: string,
        moduleResHost: ModuleResolutionHost,
    ): number {
        // Keep compatibility with apps importing apps-ts-definition
        moduleName = moduleName.replace(/@rocket.chat\/apps-ts-definition\//, '@rocket.chat/apps-engine/definition/');

        // ignore @types/node/*.d.ts
        if (/node_modules\/@types\/node\/\S+\.d\.ts$/.test(containingFile)) {
            return resolvedModules.push(undefined);
        }

        if (Utilities.allowedInternalModuleRequire(moduleName)) {
            return resolvedModules.push({ resolvedFileName: `${ moduleName }.js` });
        }

        const resolvedPath = this.resolvePath(containingFile, moduleName, cwd);
        if (result.files[resolvedPath]) {
            return resolvedModules.push({ resolvedFileName: resolvedPath });
        }

        // Now, let's try the "standard" resolution but with our little twist on it
        const rs = this.ts.resolveModuleName(moduleName, containingFile, this.compilerOptions, moduleResHost);
        if (rs.resolvedModule) {
            return resolvedModules.push(rs.resolvedModule);
        }

        return -1;
    }

    public getLibraryFile(fileName: string): ICompilerFile {
        if (!fileName.endsWith('.d.ts')) {
            return undefined;
        }

        const norm = path.normalize(fileName);

        if (this.libraryFiles[norm]) {
            return this.libraryFiles[norm];
        }

        if (!fs.existsSync(fileName)) {
            return undefined;
        }

        this.libraryFiles[norm] = {
            name: norm,
            content: fs.readFileSync(fileName).toString(),
            version: 0,
        };

        return this.libraryFiles[norm];
    }

    private checkInheritance(mainClassFile: string): void {
        const { App: EngineBaseApp } = this.appRequire('@rocket.chat/apps-engine/definition/App');
        const mainClassModule = this.requireCompiled(mainClassFile);

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
    private requireCompiled(filename: string): any {
        const exports = {};
        const context = vm.createContext({
            require: (filepath: string) => {
                // Handles Apps-Engine import
                if (filepath.startsWith('@rocket.chat/apps-engine/definition/')) {
                    return require(`${ this.wd }/node_modules/${ filepath }`);
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
                if (this.compiled[filepath.endsWith('.js') ? filepath : `${ filepath }.js`]) {
                    return this.requireCompiled(filepath);
                }
            },
            exports,
        });
        vm.runInContext(this.compiled[`${ filename }.js`], context);
        return exports;
    }

    private isValidFile(file: ICompilerFile): boolean {
        if (!file || !file.name || !file.content) {
            return false;
        }

        return file.name.trim() !== ''
            && path.normalize(file.name)
            && file.content.trim() !== '';
    }
}

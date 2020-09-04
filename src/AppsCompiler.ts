import * as fs from 'fs';
import * as path from 'path';
import fallbackTypescript, {
    CompilerOptions, Diagnostic, EmitOutput, HeritageClause, LanguageServiceHost, ModuleResolutionHost, ResolvedModule, SourceFile
} from 'typescript';

import { getAppSource } from './compiler/getAppSouce';
import { IAppsCompiler, IAppSource, ICompilerFile, ICompilerResult, IMapCompilerFile } from './definition';
import { IFiles } from './definition/IFiles';
import { Utilities } from './misc/Utilities';

type TypeScript = typeof fallbackTypescript;

export class AppsCompiler implements IAppsCompiler {
    private readonly compilerOptions: CompilerOptions;

    private libraryFiles: IMapCompilerFile;

    private compiled: IFiles;

    private implemented: string[];

    private wd: string;

    constructor(
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

    public async compile(path: string): Promise<Diagnostic[]> {
        this.wd = path;

        try {
            const source = await getAppSource(path);

            const { files, implemented, diagnostics } = this.toJs(source);

            this.compiled = Object.entries(files)
                .map(([, { name, compiled }]) => ({ [name]: compiled }))
                .reduce((acc, cur) => Object.assign(acc, cur), {});
            this.implemented = implemented;
            return diagnostics;
        } catch (err) {
            console.warn(err);
        }
    }

    public output(): IFiles {
        return this.compiled;
    }

    public getImplemented(): string[] {
        return this.implemented;
    }

    public async outputZip(outputPath: string): Promise<Buffer> {
        return Buffer.from(outputPath);
    }

    private toJs({ appInfo, files }: IAppSource): ICompilerResult {
        if (!appInfo.classFile || !files[appInfo.classFile] || !this.isValidFile(files[appInfo.classFile])) {
            throw new Error(`Invalid App package. Could not find the classFile (${ appInfo.classFile }) file.`);
        }

        const result: ICompilerResult = { files, implemented: [], diagnostics: [] };

        // Verify all file names are normalized
        // and that the files are valid
        Object.keys(result.files).forEach((key) => {
            if (!this.isValidFile(result.files[key])) {
                throw new Error(`Invalid TypeScript file: "${ key }".`);
            }

            result.files[key].name = path.normalize(result.files[key].name);
        });

        const cwd = __dirname.includes('node_modules/@rocket.chat/apps-engine')
            ? __dirname.split('node_modules/@rocket.chat/apps-engine')[0] : process.cwd();

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
            getCurrentDirectory: () => cwd,
            getDefaultLibFileName: () => this.ts.getDefaultLibFilePath(this.compilerOptions),
            fileExists: (fileName: string): boolean => this.ts.sys.fileExists(fileName),
            readFile: (fileName: string): string | undefined => this.ts.sys.readFile(fileName),
            resolveModuleNames: (moduleNames: Array<string>, containingFile: string): Array<ResolvedModule> => {
                const resolvedModules: ResolvedModule[] = [];
                const moduleResHost: ModuleResolutionHost = {
                    fileExists: host.fileExists, readFile: host.readFile, trace: (traceDetail) => console.log(traceDetail),
                };

                for (const moduleName of moduleNames) {
                    this.resolver(moduleName, resolvedModules, containingFile, result, cwd, moduleResHost);
                }

                // @TODO deal with this later
                // if (moduleNames.length > resolvedModules.length) {
                //     const failedCount = moduleNames.length - resolvedModules.length;
                //     console.log(`Failed to resolved ${ failedCount } modules for ${ info.name } v${ info.version }!`);
                // }

                return resolvedModules;
            },
        } as LanguageServiceHost;

        const languageService = this.ts.createLanguageService(host, this.ts.createDocumentRegistry());

        const coDiag = languageService.getCompilerOptionsDiagnostics();
        if (coDiag.length !== 0) {
            console.log(coDiag);

            console.error('A VERY UNEXPECTED ERROR HAPPENED THAT SHOULD NOT!');
            // console.error('Please report this error with a screenshot of the logs. ' +
            //     `Also, please email a copy of the App being installed/updated: ${ info.name } v${ info.version } (${ info.id })`);

            throw new Error(`Language Service's Compiler Options Diagnostics contains ${ coDiag.length } diagnostics.`);
        }

        const src = languageService.getProgram().getSourceFile(appInfo.classFile);

        this.ts.forEachChild(src, (n) => {
            if (!this.ts.isClassDeclaration(n)) return;

            this.ts.forEachChild(n, (node) => {
                if (this.ts.isHeritageClause(node)) {
                    const e = node as HeritageClause;

                    this.ts.forEachChild(node, (nn) => {
                        if (e.token === this.ts.SyntaxKind.ExtendsKeyword) {
                            this.checkInheritance(src, nn.getText());
                        } else if (e.token === this.ts.SyntaxKind.ImplementsKeyword) {
                            result.implemented.push(nn.getText());
                        } else {
                            console.log(e.token, nn.getText());
                        }
                    });
                }
            });
        });

        function logErrors(fileName: string) {
            const allDiagnostics = languageService.getCompilerOptionsDiagnostics()
                .concat(languageService.getSyntacticDiagnostics(fileName))
                .concat(languageService.getSemanticDiagnostics(fileName));

            allDiagnostics.forEach((diagnostic) => {
                const message = this.ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');

                if (diagnostic.file) {
                    const { line, character } = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start);
                    console.log(`Error ${ diagnostic.file.fileName } (${ line + 1 },${ character + 1 }): ${ message }`);
                } else {
                    console.log(`Error: ${ message }`);
                }
            });
        }

        result.diagnostics = this.ts.getPreEmitDiagnostics(languageService.getProgram());

        Object.keys(result.files).forEach((key) => {
            const file: ICompilerFile = result.files[key];
            const output: EmitOutput = languageService.getEmitOutput(file.name);

            if (output.emitSkipped) {
                console.log('Emitting failed for:', file.name);
                logErrors(file.name);
            }

            file.compiled = output.outputFiles[0].text;
        });

        return result;
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
        result: ICompilerResult,
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

        console.log(`Failed to resolve module: ${ moduleName }`);
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

    private checkInheritance(src: SourceFile, extendedAppName: string): void {
        const allImports: string[] = [];
        this.ts.forEachChild(src, (n) => {
            if (this.ts.isImportDeclaration(n)) {
                const exports: Map<string, string> = new Map();
                const imports = (n.importClause.namedBindings || n.importClause.name).getText()
                    .replace(/[{|}]/g, '')
                    .split(',')
                    .map((identifier) => {
                        const [exported, renamed] = identifier.split(' as ');

                        if (exported && renamed) {
                            exports.set(renamed.trim(), exported.trim());
                        }
                        return identifier.replace(/^.*as/, '').trim();
                    });
                allImports.push(...imports);
                if (imports.includes(extendedAppName)) {
                    try {
                        const appsEngineAppPath = path.join(this.wd, 'node_modules/@rocket.chat/apps-engine/definition/App');
                        const extendedAppShortPath = n.moduleSpecifier.getText().slice(1, -1);
                        const extendedAppPath = path.isAbsolute(extendedAppShortPath) ? extendedAppShortPath // absolute path
                            : extendedAppShortPath.startsWith('.')
                                ? path.join(this.wd, extendedAppShortPath) // relative path
                                : path.join(this.wd, 'node_modules', extendedAppShortPath); // external path (node_modules)
                        const mockInfo = { name: '', requiredApiVersion: '', author: { name: '' } };
                        const mockLogger = { debug: () => { } };
                        const engine = import(appsEngineAppPath);
                        const extendedApp = import(extendedAppPath);
                        const importedSymbol = exports.has(extendedAppName) ? exports.get(extendedAppName) : extendedAppName;

                        extendedApp.then((App) => {
                            engine.then((engine) => {
                                const extendedApp = new App[importedSymbol](mockInfo, mockLogger);

                                if (!(extendedApp instanceof engine.App)) {
                                    throw new Error('App must extend apps-engine\'s "App" abstract class.');
                                }
                            }).catch(console.warn);
                        });
                    } catch (err) {
                        console.error(err, 'Try to run `npm install` in your app folder to fix it.');
                    }
                }
            }
        });

        if (!allImports.includes(extendedAppName)) {
            throw new Error('App must extend apps-engine\'s "App" abstract class.');
        }
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

export default AppsCompiler;

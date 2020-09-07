import * as fs from 'fs';
import * as path from 'path';
import * as fallbackTypescript from 'typescript';

import { getAppSource } from './compiler/getAppSouce';
import { IAppsCompiler, IAppSource, ICompilerFile, ICompilerResult, IMapCompilerFile } from './definition';
import { IFiles } from './definition/IFiles';
import { Utilities } from './misc/Utilities';

export class AppsCompiler implements IAppsCompiler {
    private readonly compilerOptions: fallbackTypescript.CompilerOptions;

    private libraryFiles: IMapCompilerFile;

    private compiled: IFiles;

    private implemented: string[];

    constructor() {
        this.compilerOptions = {
            target: fallbackTypescript.ScriptTarget.ES2017,
            module: fallbackTypescript.ModuleKind.CommonJS,
            moduleResolution: fallbackTypescript.ModuleResolutionKind.NodeJs,
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

    public async compile(path: string): Promise<fallbackTypescript.Diagnostic[]> {
        const source = await getAppSource(path);
        const { files, implemented, diagnostics } = this.toJs(source, path);

        this.compiled = Object.entries(files)
            .map(([, { name, compiled }]) => ({ [name]: compiled }))
            .reduce((acc, cur) => Object.assign(acc, cur), {});
        this.implemented = implemented;

        return diagnostics;
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

    private toJs({ appInfo, files }: IAppSource, appPath: string): ICompilerResult {
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

        const host: fallbackTypescript.LanguageServiceHost = {
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

                return fallbackTypescript.ScriptSnapshot.fromString(file.content);
            },
            getCompilationSettings: () => this.compilerOptions,
            getCurrentDirectory: () => appPath,
            getDefaultLibFileName: () => fallbackTypescript.getDefaultLibFilePath(this.compilerOptions),
            fileExists: (fileName: string): boolean => fallbackTypescript.sys.fileExists(fileName),
            readFile: (fileName: string): string | undefined => fallbackTypescript.sys.readFile(fileName),
            resolveModuleNames: (moduleNames: Array<string>, containingFile: string): Array<fallbackTypescript.ResolvedModule> => {
                const resolvedModules: fallbackTypescript.ResolvedModule[] = [];
                // tslint:disable-next-line
                const moduleResHost: fallbackTypescript.ModuleResolutionHost = { fileExists: host.fileExists, readFile: host.readFile, trace: (traceDetail) => console.log(traceDetail) };

                for (const moduleName of moduleNames) {
                    this.resolver(moduleName, resolvedModules, containingFile, result, appPath, moduleResHost);
                }

                // @TODO deal with this later
                // if (moduleNames.length > resolvedModules.length) {
                //     const failedCount = moduleNames.length - resolvedModules.length;
                //     console.log(`Failed to resolved ${ failedCount } modules for ${ info.name } v${ info.version }!`);
                // }

                return resolvedModules;
            },
        };

        const languageService = fallbackTypescript.createLanguageService(host, fallbackTypescript.createDocumentRegistry());

        const coDiag = languageService.getCompilerOptionsDiagnostics();
        if (coDiag.length !== 0) {
            console.log(coDiag);

            console.error('A VERY UNEXPECTED ERROR HAPPENED THAT SHOULD NOT!');
            // console.error('Please report this error with a screenshot of the logs. ' +
            //     `Also, please email a copy of the App being installed/updated: ${ info.name } v${ info.version } (${ info.id })`);

            throw new Error(`Language Service's Compiler Options Diagnostics contains ${ coDiag.length } diagnostics.`);
        }

        const src = languageService.getProgram().getSourceFile(appInfo.classFile);

        fallbackTypescript.forEachChild(src, (n) => {
            if (n.kind === fallbackTypescript.SyntaxKind.ClassDeclaration) {
                fallbackTypescript.forEachChild(n, (node) => {
                    if (node.kind === fallbackTypescript.SyntaxKind.HeritageClause) {
                        const e = node as fallbackTypescript.HeritageClause;
                        fallbackTypescript.forEachChild(node, (nn) => {
                            if (e.token === fallbackTypescript.SyntaxKind.ExtendsKeyword) {
                                if (nn.getText() !== 'App') {
                                    throw new Error('App must extend the "App" abstract class.');
                                }
                            } else if (e.token === fallbackTypescript.SyntaxKind.ImplementsKeyword) {
                                result.implemented.push(nn.getText());
                            } else {
                                console.log(e.token, nn.getText());
                            }
                        });
                    }
                });
            }
        });

        function logErrors(fileName: string) {
            const allDiagnostics = languageService.getCompilerOptionsDiagnostics()
                .concat(languageService.getSyntacticDiagnostics(fileName))
                .concat(languageService.getSemanticDiagnostics(fileName));

            allDiagnostics.forEach((diagnostic) => {
                const message = fallbackTypescript.flattenDiagnosticMessageText(diagnostic.messageText, '\n');

                if (diagnostic.file) {
                    const { line, character } = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start);
                    console.log(`Error ${ diagnostic.file.fileName } (${ line + 1 },${ character + 1 }): ${ message }`);
                } else {
                    console.log(`Error: ${ message }`);
                }
            });
        }

        result.diagnostics = fallbackTypescript.getPreEmitDiagnostics(languageService.getProgram());

        Object.keys(result.files).forEach((key) => {
            const file: ICompilerFile = result.files[key];
            const output: fallbackTypescript.EmitOutput = languageService.getEmitOutput(file.name);

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
        resolvedModules: Array<fallbackTypescript.ResolvedModule>,
        containingFile: string,
        result: ICompilerResult,
        cwd: string,
        moduleResHost: fallbackTypescript.ModuleResolutionHost,
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
        const rs = fallbackTypescript.resolveModuleName(moduleName, containingFile, this.compilerOptions, moduleResHost);
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

    private isValidFile(file: ICompilerFile): boolean {
        if (!file || !file.name || !file.content) {
            return false;
        }

        return file.name.trim() !== ''
            && path.normalize(file.name)
            && file.content.trim() !== '';
    }
}

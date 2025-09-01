import { EventEmitter } from "events";
import fs from "fs";
import path from "path";

import type { IAppInfo } from "@rocket.chat/apps-engine/definition/metadata";
import type {
    CompilerOptions,
    EmitOutput,
    LanguageService,
    LanguageServiceHost,
    ModuleResolutionHost,
    ResolvedModule,
} from "typescript";

import type { TypeScript } from "../AppsCompiler";
import type {
    IAppSource,
    ICompilerDiagnostic,
    ICompilerFile,
    ICompilerResult,
    IMapCompilerFile,
} from "../definition";
import { normalizeDiagnostics } from "../misc/normalizeDiagnostics";
import { Utilities } from "../misc/Utilities";
import type { AppsEngineValidator } from "./AppsEngineValidator";
import logger from "../misc/logger";

export class TypescriptCompiler {
    private readonly compilerOptions: CompilerOptions;

    private libraryFiles: IMapCompilerFile;

    constructor(
        private readonly sourcePath: string,
        private readonly ts: TypeScript,
        private readonly appValidator: AppsEngineValidator,
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
            types: ["node"],
            // Set this to true if you would like to see the module resolution process
            traceResolution: false,
        };

        this.libraryFiles = {};
    }

    public transpileSource({
        appInfo,
        sourceFiles: files,
    }: IAppSource): ICompilerResult {
        if (
            !appInfo.classFile ||
            !files[appInfo.classFile] ||
            !this.isValidFile(files[appInfo.classFile])
        ) {
            throw new Error(
                `Invalid App package. Could not find the classFile (${appInfo.classFile}) file.`,
            );
        }

        const startTime = Date.now();

        this.appValidator.validateAppPermissionsSchema(appInfo.permissions);

        const result: ICompilerResult = {
            files,
            implemented: [],
            diagnostics: [],
            duration: NaN,
            name: appInfo.name,
            version: appInfo.version,
            typeScriptVersion: this.ts.version,
            permissions: appInfo.permissions,
        };

        // Verify all file names are normalized
        // and that the files are valid
        Object.keys(result.files).forEach((key) => {
            if (!this.isValidFile(result.files[key])) {
                throw new Error(`Invalid TypeScript file: "${key}".`);
            }

            result.files[key].name = path.normalize(result.files[key].name);
        });

        let hasExternalDependencies = false;
        let hasNativeDependencies = false;
        const dependencyCheck = new EventEmitter();

        dependencyCheck.on("dependencyCheck", (dependencyType) => {
            switch (dependencyType) {
                case "external":
                    if (!hasExternalDependencies) {
                        hasExternalDependencies = true;
                        logger.warn("App has external module(s) as dependency");
                    }
                    break;
                case "native":
                    if (!hasNativeDependencies) {
                        hasNativeDependencies = true;
                        logger.warn("App has native module(s) as dependency");
                    }
                    break;
                default:
                    break;
            }
        });

        const modulesNotFound: ICompilerDiagnostic[] = [];
        const host = {
            getScriptFileNames: () => Object.keys(result.files),
            getScriptVersion: (fileName) => {
                fileName = path.normalize(fileName);
                const file =
                    result.files[fileName] || this.getLibraryFile(fileName);
                return file?.version?.toString();
            },
            getScriptSnapshot: (fileName) => {
                fileName = path.normalize(fileName);
                const file =
                    result.files[fileName] || this.getLibraryFile(fileName);

                if (!file?.content) {
                    return;
                }

                return this.ts.ScriptSnapshot.fromString(file.content);
            },
            getCompilationSettings: () => this.compilerOptions,
            getCurrentDirectory: () => this.sourcePath,
            getDefaultLibFileName: () =>
                this.ts.getDefaultLibFilePath(this.compilerOptions),
            fileExists: (fileName: string): boolean =>
                this.ts.sys.fileExists(fileName),
            readFile: (fileName: string): string | undefined =>
                this.ts.sys.readFile(fileName),
            resolveModuleNames: (
                moduleNames: Array<string>,
                containingFile: string,
            ): Array<ResolvedModule> => {
                const resolvedModules: ResolvedModule[] = [];
                const moduleResHost: ModuleResolutionHost = {
                    fileExists: host.fileExists,
                    readFile: host.readFile,
                    trace: (traceDetail) => console.log(traceDetail),
                };

                for (const moduleName of moduleNames) {
                    const index = this.resolver(
                        moduleName,
                        resolvedModules,
                        containingFile,
                        result,
                        moduleResHost,
                        dependencyCheck,
                    );

                    if (index === -1) {
                        modulesNotFound.push({
                            filename: containingFile,
                            line: 0,
                            character: 0,
                            lineText: "",
                            message: `Failed to resolve module: ${moduleName}`,
                            originalMessage: `Module not found: ${moduleName}`,
                            originalDiagnostic: undefined,
                        });
                    }
                }

                return resolvedModules;
            },
        } as LanguageServiceHost;

        const languageService = this.ts.createLanguageService(
            host,
            this.ts.createDocumentRegistry(),
        );

        try {
            const coDiag = languageService.getCompilerOptionsDiagnostics();

            if (coDiag.length !== 0) {
                console.log(coDiag);

                console.error(
                    "A VERY UNEXPECTED ERROR HAPPENED THAT SHOULD NOT!",
                );
                // console.error('Please report this error with a screenshot of the logs. ' +
                //     `Also, please email a copy of the App being installed/updated: ${ info.name } v${ info.version } (${ info.id })`);

                throw new Error(
                    `Language Service's Compiler Options Diagnostics contains ${coDiag.length} diagnostics.`,
                );
            }
        } catch (e) {
            if (modulesNotFound.length !== 0) {
                result.diagnostics = modulesNotFound;
                result.duration = Date.now() - startTime;

                return result;
            }

            throw e;
        }

        result.implemented = this.getImplementedInterfaces(
            languageService,
            appInfo,
        );

        Object.defineProperty(result, "diagnostics", {
            value: normalizeDiagnostics(
                this.ts.getPreEmitDiagnostics(languageService.getProgram()),
            ),
            configurable: false,
            writable: false,
        });

        Object.keys(result.files).forEach((key) => {
            const file: ICompilerFile = result.files[key];
            const output: EmitOutput = languageService.getEmitOutput(file.name);

            file.name = key.replace(/\.ts$/g, ".js");

            delete result.files[key];
            result.files[file.name] = file;

            file.compiled = output.outputFiles[0].text;
        });

        result.mainFile =
            result.files[appInfo.classFile.replace(/\.ts$/, ".js")];

        this.appValidator.checkInheritance(
            appInfo.classFile.replace(/\.ts$/, ""),
            result,
        );

        result.duration = Date.now() - startTime;

        return result;
    }

    private resolver(
        moduleName: string,
        resolvedModules: Array<ResolvedModule>,
        containingFile: string,
        result: ICompilerResult,
        moduleResHost: ModuleResolutionHost,
        dependencyCheck: EventEmitter,
    ): number {
        // Keep compatibility with apps importing apps-ts-definition
        moduleName = moduleName.replace(
            /@rocket.chat\/apps-ts-definition\//,
            "@rocket.chat/apps-engine/definition/",
        );

        // ignore @types/node/*.d.ts
        if (/node_modules\/@types\/node\/\S+\.d\.ts$/.test(containingFile)) {
            return resolvedModules.push(undefined);
        }

        if (Utilities.allowedInternalModuleRequire(moduleName)) {
            dependencyCheck.emit("dependencyCheck", "native");
            return resolvedModules.push({
                resolvedFileName: `${moduleName}.js`,
            });
        }

        const resolvedWithIndex = this.resolvePath(
            containingFile,
            `${moduleName}/index`,
        );
        if (result.files[resolvedWithIndex]) {
            return resolvedModules.push({
                resolvedFileName: resolvedWithIndex,
            });
        }

        const resolvedPath = this.resolvePath(containingFile, moduleName);
        if (result.files[resolvedPath]) {
            return resolvedModules.push({ resolvedFileName: resolvedPath });
        }

        // Now, let's try the "standard" resolution but with our little twist on it
        const rs = this.ts.resolveModuleName(
            moduleName,
            containingFile,
            this.compilerOptions,
            moduleResHost,
        );
        if (rs.resolvedModule) {
            if (
                rs.resolvedModule.isExternalLibraryImport &&
                rs.resolvedModule.packageId &&
                rs.resolvedModule.packageId.name !== "@rocket.chat/apps-engine"
            ) {
                dependencyCheck.emit("dependencyCheck", "external");
            }

            return resolvedModules.push(rs.resolvedModule);
        }

        return -1;
    }

    private resolvePath(containingFile: string, moduleName: string): string {
        const currentFolderPath = path
            .dirname(containingFile)
            .replace(this.sourcePath.replace(/\/$/, ""), "");
        const modulePath = path.join(currentFolderPath, moduleName);

        // Let's ensure we search for the App's modules first
        const transformedModule =
            Utilities.transformModuleForCustomRequire(modulePath);
        if (transformedModule) {
            return transformedModule;
        }
    }

    private getImplementedInterfaces(
        languageService: LanguageService,
        appInfo: IAppInfo,
    ): ICompilerResult["implemented"] {
        const result: ICompilerResult["implemented"] = [];

        const src = languageService
            .getProgram()
            .getSourceFile(appInfo.classFile);

        this.ts.forEachChild(src, (n) => {
            if (!this.ts.isClassDeclaration(n)) {
                return;
            }

            this.ts.forEachChild(n, (node) => {
                if (!this.ts.isHeritageClause(node)) {
                    return;
                }

                this.ts.forEachChild(node, (nn) => {
                    const interfaceName = nn.getText();
                    if (
                        node.token === this.ts.SyntaxKind.ImplementsKeyword &&
                        this.appValidator.isValidAppInterface(interfaceName)
                    ) {
                        result.push(interfaceName);
                    }
                });
            });
        });

        return result;
    }

    private getLibraryFile(fileName: string): ICompilerFile {
        if (!fileName.endsWith(".d.ts")) {
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
        if (!file?.name || !file?.content) {
            return false;
        }

        return (
            file.name.trim() !== "" &&
            path.normalize(file.name) &&
            file.content.trim() !== ""
        );
    }
}

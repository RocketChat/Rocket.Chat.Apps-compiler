/* eslint-disable no-await-in-loop */
import { createRequire } from 'module';
import path from 'path';
import util from 'util';
import * as TS from 'typescript';
import { promises as fs } from 'fs';
import { execFile } from 'child_process';

import {
    IAppSource,
    ICompilerResult,
    ICompilerDiagnostic,
} from '../definition';
import { AppsEngineValidator } from './AppsEngineValidator';
import logger from '../misc/logger';

const execFileAsync = util.promisify(execFile);

export class TscBasedCompiler {
    constructor(
        private readonly sourcePath: string,
        private readonly appValidator: AppsEngineValidator,
    ) {}

    public async transpileSource({
        appInfo,
        sourceFiles,
    }: IAppSource): Promise<ICompilerResult> {
        const startTime = Date.now();

        // 1) Entry-file must exist
        if (!appInfo.classFile || !sourceFiles[appInfo.classFile]) {
            throw new Error(
                `Invalid App package. Could not find the classFile (${ appInfo.classFile }).`,
            );
        }

        // 2) Permissions schema validation
        this.appValidator.validateAppPermissionsSchema(appInfo.permissions);

        // 3) Basic file-validity checks
        for (const file of Object.values(sourceFiles)) {
            if (!file.name || !file.content) {
                throw new Error(`Invalid TypeScript file: "${ file.name }".`);
            }
        }

        // 4) Dump all .ts files into sourcePath
        for (const file of Object.values(sourceFiles)) {
            const diskPath = path.join(this.sourcePath, file.name);
            await fs.mkdir(path.dirname(diskPath), { recursive: true });
            await fs.writeFile(diskPath, file.content, 'utf8');
        }

        // 5) Generate a temporary tsconfig
        const nonConfigurableCompilerOptions = {
            module: 'CommonJS',
            moduleResolution: 'node',
        };

        let tsconfig = {
            compilerOptions: {
                target: 'ES2020',
                module: 'commonjs',
                strict: false,
                experimentalDecorators: true,
                emitDecoratorMetadata: true,
                rootDir: './',
                outDir: './dist',
            },
            include: Object.values(sourceFiles).map((f) => f.name),
            exclude: ['node_modules'],
        };

        // read App's tsconfig.json if present
        const appTsconfigPath = path.join(this.sourcePath, 'tsconfig.json');
        try {
            logger.debug(`Reading app's tsconfig.json from ${ appTsconfigPath }`);
            const configContent = await fs.readFile(appTsconfigPath, 'utf8');
            const parsed = TS.parseConfigFileTextToJson(
                appTsconfigPath,
                configContent,
            );

            // merge with our own config
            const appTsconfigJson = parsed.config;
            const mergedConfig = {
                ...tsconfig,
                ...appTsconfigJson,
                compilerOptions: {
                    ...tsconfig.compilerOptions,
                    ...appTsconfigJson.compilerOptions,
                    ...nonConfigurableCompilerOptions,
                },
            };

            tsconfig = mergedConfig;
            logger.debug(
                `Merged app's tsconfig.json with our own config: ${ JSON.stringify(
                    tsconfig,
                    null,
                    2,
                ) }`,
            );
        } catch (err) {
            // ignore errors, we will use our own config
            logger.debug(
                `No app tsconfig.json found, using default config: ${ err }`,
            );
        }

        const tsconfigPath = path.join(this.sourcePath, 'tsconfig.temp.json');
        await fs.writeFile(
            tsconfigPath,
            JSON.stringify(tsconfig, null, 2),
            'utf8',
        );

        // 6) Find the tsc binary (prefer the app's own TS if present)
        let tscCli: string;
        try {
            const appRequire = createRequire(
                path.join(this.sourcePath, 'app.json'),
            );
            // this resolves to .../node_modules/typescript/lib/tsc.js
            tscCli = appRequire.resolve('typescript/lib/tsc.js');
            logger.debug(`Using app's TypeScript CLI at ${ tscCli }`);
        } catch {
            // fallback to host
            tscCli = require.resolve('typescript/lib/tsc.js');
            logger.debug(`Falling back to host TypeScript CLI at ${ tscCli }`);
        }

        // 7) Invoke tsc
        try {
            await execFileAsync(
                process.execPath,
                [tscCli, '-p', tsconfigPath],
                {
                    cwd: this.sourcePath,
                },
            );
        } catch (err: any) {
            // on failure, return a single diagnostic with the raw tsc output
            const msg = err.stderr || err.stdout || err.message;
            const diagnostic: ICompilerDiagnostic = {
                filename: appInfo.classFile,
                line: 0,
                character: 0,
                lineText: '',
                message: msg,
                originalMessage: msg,
                originalDiagnostic: undefined,
            };
            return {
                files: {},
                diagnostics: [diagnostic],
                implemented: [],
                duration: Date.now() - startTime,
                name: appInfo.name,
                version: appInfo.version,
                typeScriptVersion: TS.version,
                permissions: appInfo.permissions,
            };
        }

        // 8) Read back emitted JS
        const result: ICompilerResult = {
            files: {},
            diagnostics: [],
            implemented: [],
            duration: Date.now() - startTime,
            name: appInfo.name,
            version: appInfo.version,
            typeScriptVersion: TS.version,
            permissions: appInfo.permissions,
        };
        // const distDir = path.join(this.sourcePath, "dist");
        async function collectJsFiles(dir: string, base = ''): Promise<void> {
            for (const name of await fs.readdir(dir, { withFileTypes: true })) {
                const full = path.join(dir, name.name);
                const rel = path.join(base, name.name);
                if (name.isDirectory()) {
                    await collectJsFiles(full, rel);
                } else if (name.isFile() && rel.endsWith('.js')) {
                    const text = await fs.readFile(full, 'utf8');
                    result.files[rel] = {
                        name: rel,
                        content: '', // original TS is already in memory
                        compiled: text,
                        version: 1,
                    };
                }
            }
        }
        const distDir = path.join(this.sourcePath, 'dist');
        await collectJsFiles(distDir);

        // 9) Main file pointer
        const mainJs = appInfo.classFile.replace(/\.ts$/, '.js');
        result.mainFile = result.files[mainJs];

        // 10) Extract `implements` from the original TS AST
        const src = TS.createSourceFile(
            appInfo.classFile,
            sourceFiles[appInfo.classFile].content,
            TS.ScriptTarget.Latest,
            true,
        );
        result.implemented = this.extractInterfaces(src);

        // 11) Run your inheritance check
        this.appValidator.checkInheritance(
            appInfo.classFile.replace(/\.ts$/, ''),
            result,
        );

        return result;
    }

    private extractInterfaces(src: TS.SourceFile): string[] {
        const out: string[] = [];
        const visit = (n: TS.Node) => {
            if (TS.isClassDeclaration(n) && n.heritageClauses) {
                for (const h of n.heritageClauses) {
                    if (h.token === TS.SyntaxKind.ImplementsKeyword) {
                        h.types.forEach((t) =>
                            out.push(t.expression.getText()),
                        );
                    }
                }
            }
            TS.forEachChild(n, visit);
        };
        TS.forEachChild(src, visit);
        return out;
    }
}

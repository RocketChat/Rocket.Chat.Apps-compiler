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

// we compile into this private folder instead of "dist"
const BUILD_DIR = '.rc_build';
// name of the generated tsconfig
const TEMP_TSCONFIG = 'tsconfig.rc.json';
// options we force—module, resolution, outDir must stay under our control
const NON_CONFIGURABLE = {
    module: 'commonjs',
    moduleResolution: 'node',
    outDir: BUILD_DIR,
};

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

        // Entry‐file must exist
        if (!appInfo.classFile || !sourceFiles[appInfo.classFile]) {
            throw new Error(
                `Invalid App package. Could not find the classFile (${ appInfo.classFile }).`,
            );
        }

        // Permissions schema validation
        this.appValidator.validateAppPermissionsSchema(appInfo.permissions);

        // Basic TS‐file validity checks
        for (const file of Object.values(sourceFiles)) {
            if (!file.name || !file.content) {
                throw new Error(`Invalid TypeScript file: "${ file.name }".`);
            }
        }

        // Clean our private build directory
        const buildDir = path.join(this.sourcePath, BUILD_DIR);
        await fs.rm(buildDir, { recursive: true, force: true });

        // Dump all .ts files in parallel (with a path‐traversal guard)
        await Promise.all(
            Object.values(sourceFiles).map(async (file) => {
                const diskPath = path.join(this.sourcePath, file.name);
                const rel = path.relative(this.sourcePath, diskPath);
                if (rel.startsWith('..') || path.isAbsolute(rel)) {
                    throw new Error(
                        `Invalid file path (outside workspace): "${ file.name }".`,
                    );
                }
                await fs.mkdir(path.dirname(diskPath), { recursive: true });
                await fs.writeFile(diskPath, file.content, 'utf8');
            }),
        );

        // Default tsconfig JSON (string-typed values!)
        let tsconfigJson: any = {
            compilerOptions: {
                target: 'ES2020',
                strict: false,
                experimentalDecorators: true,
                emitDecoratorMetadata: true,
                rootDir: './',
                ...NON_CONFIGURABLE,
            },
            include: Object.values(sourceFiles).map((f) => f.name),
            exclude: ['node_modules'],
        };

        // Deep-merge with app’s tsconfig.json if it exists
        const appTsconfigPath = path.join(this.sourcePath, 'tsconfig.json');
        try {
            logger.debug(`Reading app tsconfig from ${ appTsconfigPath }`);
            const text = await fs.readFile(appTsconfigPath, 'utf8');
            const parsed = TS.parseConfigFileTextToJson(
                appTsconfigPath,
                text,
            ).config;

            tsconfigJson = {
                ...tsconfigJson,
                ...parsed,
                compilerOptions: {
                    ...tsconfigJson.compilerOptions,
                    ...parsed.compilerOptions,
                    ...NON_CONFIGURABLE,
                },
            };

            logger.debug(
                `Merged tsconfig: ${ JSON.stringify(tsconfigJson, null, 2) }`,
            );
        } catch {
            logger.debug('No valid app tsconfig—using defaults.');
        }

        // Write the merged tsconfig in the workspace
        const tempConfigPath = path.join(this.sourcePath, TEMP_TSCONFIG);
        await fs.writeFile(
            tempConfigPath,
            JSON.stringify(tsconfigJson, null, 2),
            'utf8',
        );

        // 9) Resolve the tsc CLI (preferring an app‐local install)
        let tscCli: string;
        try {
            const appRequire = createRequire(
                path.join(this.sourcePath, 'app.json'),
            );
            tscCli = appRequire.resolve('typescript/lib/tsc.js');
            logger.debug(`Using app's TS CLI at ${ tscCli }`);
        } catch {
            tscCli = require.resolve('typescript/lib/tsc.js');
            logger.debug(`Falling back to host TS CLI at ${ tscCli }`);
        }

        // Invoke tsc
        try {
            await execFileAsync(
                process.execPath,
                [tscCli, '-p', tempConfigPath],
                {
                    cwd: this.sourcePath,
                    maxBuffer: 1024 * 1024, // 1 MB buffer
                },
            );
        } catch (err: any) {
            // parse its stderr/stdout into line-by-line diagnostics
            const raw = (err.stderr || err.stdout || err.message).toString();
            const diagnostics = raw
                .split(/\r?\n/)
                .filter(Boolean)
                .map((line: string) => {
                    const m = line.match(
                        /^(.*\.ts)\((\d+),(\d+)\):\s*(.*)$/,
                    );
                    if (m) {
                        const [, full, ln, ch, msg] = m;
                        return {
                            filename: path.relative(
                                this.sourcePath,
                                full,
                            ),
                            line: +ln - 1,
                            character: +ch - 1,
                            lineText: '',
                            message: msg,
                            originalMessage: msg,
                            originalDiagnostic: undefined,
                        } as ICompilerDiagnostic;
                    }
                    return {
                        filename: appInfo.classFile,
                        line: 0,
                        character: 0,
                        lineText: '',
                        message: line,
                        originalMessage: line,
                        originalDiagnostic: undefined,
                    } as ICompilerDiagnostic;
                });

            await fs.unlink(tempConfigPath).catch(() => {});
            return {
                files: {},
                diagnostics,
                implemented: [],
                duration: Date.now() - startTime,
                name: appInfo.name,
                version: appInfo.version,
                typeScriptVersion: TS.version,
                permissions: appInfo.permissions,
            };
        } finally {
            // always remove the temp tsconfig
            await fs.unlink(tempConfigPath).catch(() => {});
        }

        // Collect all emitted .js from our BUILD_DIR
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

        const collect = async (dir: string, base = ''): Promise<void> => {
            for (const entry of await fs.readdir(dir, {
                withFileTypes: true,
            })) {
                const full = path.join(dir, entry.name);
                const rel = path.join(base, entry.name);
                if (entry.isDirectory()) {
                    await collect(full, rel);
                } else if (entry.isFile() && rel.endsWith('.js')) {
                    const compiled = await fs.readFile(full, 'utf8');
                    result.files[rel] = {
                        name: rel,
                        content: '', // TS sources already in memory
                        compiled,
                        version: 1,
                    };
                }
            }
        };
        await collect(path.join(this.sourcePath, BUILD_DIR));

        // Point at the main JS file
        const mainJs = appInfo.classFile.replace(/\.ts$/, '.js');
        result.mainFile = result.files[mainJs];

        // Extract implemented interfaces from the TS AST
        const srcNode = TS.createSourceFile(
            appInfo.classFile,
            sourceFiles[appInfo.classFile].content,
            TS.ScriptTarget.Latest,
            true,
        );
        result.implemented = this.extractInterfaces(srcNode);

        // Run inheritance checks
        this.appValidator.checkInheritance(
            appInfo.classFile.replace(/\.ts$/, ''),
            result,
        );

        // Cleanup our build folder
        await fs.rm(path.join(this.sourcePath, BUILD_DIR), {
            recursive: true,
            force: true,
        });

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

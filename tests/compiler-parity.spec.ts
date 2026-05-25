import { expect } from "chai";
import { describe, it, beforeEach, afterEach } from "mocha";
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import typescript from "typescript";

import type { IAppSource, ICompilerFile } from "../src/definition";
import { AppsEngineValidator } from "../src/compiler/AppsEngineValidator";
import { TypescriptCompiler } from "../src/compiler/TypescriptCompiler";
import { TscBasedCompiler } from "../src/compiler/TscBasedCompiler";

// TypescriptCompiler mutates its sourceFiles argument in-place (renames .ts keys to .js).
// Always pass a clone so the two compilers don't interfere with each other.
function cloneFiles(
    files: Record<string, ICompilerFile>,
): Record<string, ICompilerFile> {
    return Object.fromEntries(
        Object.entries(files).map(([k, v]) => [k, { ...v }]),
    );
}

describe("Compiler parity (TypescriptCompiler vs TscBasedCompiler)", () => {
    let tmpDir: string;
    let validator: AppsEngineValidator;
    let tsCompiler: TypescriptCompiler;
    let tscCompiler: TscBasedCompiler;

    const baseAppInfo: IAppSource["appInfo"] = {
        id: "4f7788b8-efe7-47aa-8284-4b59f65ea034",
        nameSlug: "test",
        author: { name: "Test Author", support: "", homepage: "" },
        description: "Test App",
        iconFile: "icon.png",
        implements: [],
        name: "test",
        version: "1.0.0",
        classFile: "MyApp.ts",
        permissions: [],
        requiredApiVersion: "",
    };

    beforeEach(async () => {
        const prefix = path.join(os.tmpdir(), "rc-parity-test-");
        tmpDir = await fs.mkdtemp(prefix);

        await fs.writeFile(
            path.join(tmpDir, "app.json"),
            JSON.stringify({
                id: baseAppInfo.id,
                version: baseAppInfo.version,
                classFile: baseAppInfo.classFile,
                permissions: baseAppInfo.permissions,
            }),
            "utf8",
        );

        validator = new AppsEngineValidator(require);
        validator.checkInheritance = () => {};

        tsCompiler = new TypescriptCompiler(
            process.cwd(),
            typescript,
            validator,
        );
        tscCompiler = new TscBasedCompiler(tmpDir, validator);
    });

    afterEach(async () => {
        await fs.rm(tmpDir, { recursive: true, force: true });
    });

    it("both detect the same implemented interfaces", async () => {
        const sourceFiles: Record<string, ICompilerFile> = {
            "MyApp.ts": {
                name: "MyApp.ts",
                content: `
          export abstract class App {}

          export interface IPostMessageSent {
            executePostMessageSent(): void;
          }

          export class MyApp extends App implements IPostMessageSent {
            public executePostMessageSent(): void {}
          }
        `,
                version: 1,
            },
        };

        const [tsResult, tscResult] = await Promise.all([
            Promise.resolve(
                tsCompiler.transpileSource({
                    appInfo: baseAppInfo,
                    sourceFiles: cloneFiles(sourceFiles),
                }),
            ),
            tscCompiler.transpileSource({
                appInfo: baseAppInfo,
                sourceFiles: cloneFiles(sourceFiles),
            }),
        ]);

        expect(tsResult.implemented).to.deep.equal(["IPostMessageSent"]);
        expect(tscResult.implemented).to.deep.equal(tsResult.implemented);
    });

    it("both produce no app-source errors for valid code", async () => {
        const sourceFiles: Record<string, ICompilerFile> = {
            "MyApp.ts": {
                name: "MyApp.ts",
                content: `
          export class MyApp {
            public greet(name: string): string {
              return "Hello, " + name;
            }
          }
        `,
                version: 1,
            },
        };

        const [tsResult, tscResult] = await Promise.all([
            Promise.resolve(
                tsCompiler.transpileSource({
                    appInfo: baseAppInfo,
                    sourceFiles: cloneFiles(sourceFiles),
                }),
            ),
            tscCompiler.transpileSource({
                appInfo: baseAppInfo,
                sourceFiles: cloneFiles(sourceFiles),
            }),
        ]);

        expect(tsResult.diagnostics).to.be.empty;
        expect(tscResult.diagnostics).to.be.empty;
    });

    it("both report errors for the same invalid code", async () => {
        const appInfo = { ...baseAppInfo, classFile: "Bad.ts" };
        await fs.writeFile(
            path.join(tmpDir, "app.json"),
            JSON.stringify({
                ...JSON.parse(
                    await fs.readFile(path.join(tmpDir, "app.json"), "utf8"),
                ),
                classFile: "Bad.ts",
            }),
            "utf8",
        );

        const sourceFiles: Record<string, ICompilerFile> = {
            "Bad.ts": {
                name: "Bad.ts",
                content: "const x: string = 123;",
                version: 1,
            },
        };

        const [tsResult, tscResult] = await Promise.all([
            Promise.resolve(
                tsCompiler.transpileSource({
                    appInfo,
                    sourceFiles: cloneFiles(sourceFiles),
                }),
            ),
            tscCompiler.transpileSource({
                appInfo,
                sourceFiles: cloneFiles(sourceFiles),
            }),
        ]);

        expect(tsResult.diagnostics).to.not.be.empty;
        expect(tscResult.diagnostics).to.not.be.empty;
    });

    it("both output the same set of compiled file names", async () => {
        const sourceFiles: Record<string, ICompilerFile> = {
            "MyApp.ts": {
                name: "MyApp.ts",
                content: `
          import { Helper } from "./Helper";
          export class MyApp {
            private h = new Helper();
          }
        `,
                version: 1,
            },
            "Helper.ts": {
                name: "Helper.ts",
                content: "export class Helper {}",
                version: 1,
            },
        };

        const [tsResult, tscResult] = await Promise.all([
            Promise.resolve(
                tsCompiler.transpileSource({
                    appInfo: baseAppInfo,
                    sourceFiles: cloneFiles(sourceFiles),
                }),
            ),
            tscCompiler.transpileSource({
                appInfo: baseAppInfo,
                sourceFiles: cloneFiles(sourceFiles),
            }),
        ]);

        const tsFiles = Object.keys(tsResult.files).sort();
        const tscFiles = Object.keys(tscResult.files).sort();

        expect(tsFiles).to.deep.equal(["Helper.js", "MyApp.js"]);
        expect(tscFiles).to.deep.equal(tsFiles);
    });
});

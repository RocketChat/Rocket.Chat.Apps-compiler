import { expect } from "chai";
import { describe, it, beforeEach } from "mocha";
import typescript from "typescript";

import type { IAppSource, ICompilerFile } from "../src/definition";
import { AppsEngineValidator } from "../src/compiler/AppsEngineValidator";
import { TypescriptCompiler } from "../src/compiler/TypescriptCompiler";

describe("TypescriptCompiler", () => {
    let validator: AppsEngineValidator;
    let compiler: TypescriptCompiler;

    const baseAppInfo: IAppSource["appInfo"] = {
        id: "4f7788b8-efe7-47aa-8284-4b59f65ea034",
        nameSlug: "test",
        author: {
            name: "Test Author",
            support: "",
            homepage: "",
        },
        description: "Test App",
        iconFile: "icon.png",
        implements: [],
        name: "test",
        version: "1.0.0",
        classFile: "Foo.ts",
        permissions: [],
        requiredApiVersion: "",
    };

    beforeEach(() => {
        validator = new AppsEngineValidator(require);
        validator.checkInheritance = () => {};

        // TypescriptCompiler is fully in-memory; sourcePath only needs access to
        // node_modules so the LanguageService can resolve @types/node.
        compiler = new TypescriptCompiler(process.cwd(), typescript, validator);
    });

    it("compiles a simple class with no errors", () => {
        const sourceFiles: Record<string, ICompilerFile> = {
            "Foo.ts": {
                name: "Foo.ts",
                content: `
          export class Foo {
            public run(): void {
              // nothing
            }
          }
        `,
                version: 1,
            },
        };

        const result = compiler.transpileSource({
            appInfo: baseAppInfo,
            sourceFiles,
        });

        expect(result.diagnostics).to.be.empty;
        expect(Object.keys(result.files)).to.include("Foo.js");
        expect(result.mainFile?.name).to.equal("Foo.js");
        expect(result.mainFile?.compiled).to.be.a("string").and.not.empty;
    });

    it("produces diagnostics on invalid TS", () => {
        const badAppInfo = { ...baseAppInfo, classFile: "Bad.ts" };

        const sourceFiles: Record<string, ICompilerFile> = {
            "Bad.ts": {
                name: "Bad.ts",
                content: "const x: string = 123;",
                version: 1,
            },
        };

        const { diagnostics } = compiler.transpileSource({
            appInfo: badAppInfo,
            sourceFiles,
        });

        expect(diagnostics).to.not.be.empty;
        expect(diagnostics[0].filename).to.include("Bad.ts");
    });

    it('detects implemented interfaces in a "real" App class', () => {
        const testAppInfo = { ...baseAppInfo, classFile: "TestApp.ts" };

        const sourceFiles: Record<string, ICompilerFile> = {
            "TestApp.ts": {
                name: "TestApp.ts",
                content: `
          export abstract class App {}

          export interface IPostMessageSent {
            executePostMessageSent(): void;
          }

          export class TestApp
            extends App
            implements IPostMessageSent
          {
            public executePostMessageSent(): void {
              // no-op
            }
          }
        `,
                version: 1,
            },
        };

        const result = compiler.transpileSource({
            appInfo: testAppInfo,
            sourceFiles,
        });

        expect(result.diagnostics).to.be.empty;
        expect(result.implemented).to.deep.equal(["IPostMessageSent"]);
    });

    it("normalizes backslash separators in sourceFiles keys and classFile (Windows paths)", () => {
        // Simulate an IAppSource constructed on Windows where path.join produces
        // backslash-separated keys and classFile comes from app.json with backslashes.
        const appInfo = { ...baseAppInfo, classFile: "lib\\Foo.ts" };

        const sourceFiles: Record<string, ICompilerFile> = {
            "lib\\Foo.ts": {
                name: "lib\\Foo.ts",
                content: "export class Foo {}",
                version: 1,
            },
        };

        const result = compiler.transpileSource({ appInfo, sourceFiles });

        expect(result.diagnostics).to.be.empty;
        // Keys in result.files must use forward slashes regardless of input
        expect(Object.keys(result.files)).to.include("lib/Foo.js");
        expect(Object.keys(result.files)).to.not.include("lib\\Foo.js");
        // mainFile must be resolved correctly via the normalised classFile
        expect(result.mainFile).to.exist;
        expect(result.mainFile.name).to.equal("lib/Foo.js");
    });

    it("throws on invalid permission names", () => {
        const badAppInfo = {
            ...baseAppInfo,
            permissions: [{ name: "not-a-real-permission-xyz" }],
        };

        const sourceFiles: Record<string, ICompilerFile> = {
            "Foo.ts": {
                name: "Foo.ts",
                content: "export class Foo {}",
                version: 1,
            },
        };

        expect(() =>
            compiler.transpileSource({ appInfo: badAppInfo, sourceFiles }),
        ).to.throw(/Invalid permission/);
    });
});

import { expect } from 'chai';
import { describe, it, beforeEach, afterEach } from 'mocha';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';

import { IAppSource, ICompilerFile } from '../src/definition';
import { AppsEngineValidator } from '../src/compiler/AppsEngineValidator';
import { TscBasedCompiler } from '../src/compiler/TscBasedCompiler';

describe('TscBasedCompiler', () => {
    let tmpDir: string;
    let validator: AppsEngineValidator;
    let compiler: TscBasedCompiler;

    // minimal appInfo shape
    const baseAppInfo: IAppSource['appInfo'] = {
        id: '4f7788b8-efe7-47aa-8284-4b59f65ea034',
        nameSlug: 'test',
        author: {
            name: 'Test Author',
            support: '',
            homepage: '',
        },
        description: 'Test App',
        iconFile: 'icon.png',
        implements: [],
        name: 'test',
        version: '1.0.0',
        classFile: 'Foo.ts', // default; tests will override as needed
        permissions: [],
        requiredApiVersion: '',
    };

    beforeEach(async () => {
        // 1) create a fresh temp dir
        const prefix = path.join(os.tmpdir(), 'rc-test-');
        tmpDir = await fs.mkdtemp(prefix);

        // 2) write a minimal app.json so createRequire() works
        const appJson = {
            id: baseAppInfo.id,
            version: baseAppInfo.version,
            classFile: baseAppInfo.classFile,
            permissions: baseAppInfo.permissions,
        };
        await fs.writeFile(
            path.join(tmpDir, 'app.json'),
            JSON.stringify(appJson),
            'utf8',
        );

        // 3) instantiate and stub out inheritance checking
        validator = new AppsEngineValidator(require);
        // skip the real inheritance check in tests
        validator.checkInheritance = () => {};

        compiler = new TscBasedCompiler(tmpDir, validator);
    });

    afterEach(async () => {
        // clean up
        await fs.rm(tmpDir, { recursive: true, force: true });
    });

    it('compiles a simple class with no errors', async () => {
        // we only care here that TS compiles and interfaces are extracted
        const sourceFiles: Record<string, ICompilerFile> = {
            'Foo.ts': {
                name: 'Foo.ts',
                content: `
          export interface IWidget { run(): void }
          export class Foo implements IWidget {
            public run(): void {
              // nothing
            }
          }
        `,
                version: 1,
            },
        };

        const result = await compiler.transpileSource({
            appInfo: baseAppInfo,
            sourceFiles,
        });

        expect(result.diagnostics).to.be.empty;
        expect(Object.keys(result.files)).to.include('Foo.js');
        expect(result.implemented).to.deep.equal(['IWidget']);
        expect(result.mainFile?.name).to.equal('Foo.js');
    });

    it('produces diagnostics on invalid TS', async () => {
        // override to point at Bad.ts
        const badAppInfo = { ...baseAppInfo, classFile: 'Bad.ts' };
        await fs.writeFile(
            path.join(tmpDir, 'app.json'),
            JSON.stringify({
                id: badAppInfo.id,
                version: badAppInfo.version,
                classFile: badAppInfo.classFile,
                permissions: badAppInfo.permissions,
            }),
            'utf8',
        );

        const sourceFiles: Record<string, ICompilerFile> = {
            'Bad.ts': {
                name: 'Bad.ts',
                content: 'const x: string = 123;',
                version: 1,
            },
        };

        const { diagnostics } = await compiler.transpileSource({
            appInfo: badAppInfo,
            sourceFiles,
        });

        expect(diagnostics).to.not.be.empty;
        expect(diagnostics[0]).to.have.property('filename', 'Bad.ts');
    });

    it('detects implemented interfaces in a “real” App class', async () => {
        // override to point at TestApp.ts
        const testAppInfo = { ...baseAppInfo, classFile: 'TestApp.ts' };
        await fs.writeFile(
            path.join(tmpDir, 'app.json'),
            JSON.stringify({
                id: testAppInfo.id,
                version: testAppInfo.version,
                classFile: testAppInfo.classFile,
                permissions: testAppInfo.permissions,
            }),
            'utf8',
        );

        const sourceFiles: Record<string, ICompilerFile> = {
            'TestApp.ts': {
                name: 'TestApp.ts',
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

        const result = await compiler.transpileSource({
            appInfo: testAppInfo,
            sourceFiles,
        });

        expect(result.diagnostics).to.be.empty;
        expect(result.implemented).to.deep.equal(['IPostMessageSent']);
    });
});

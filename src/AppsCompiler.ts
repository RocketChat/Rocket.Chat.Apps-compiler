import * as fs from 'fs';
import * as fallbackTypescript from 'typescript';

import { createRequire } from 'module';
import { getAppSource } from './compiler/getAppSource';
import { ICompilerDescriptor, ICompilerResult } from './definition';
import { FolderDetails } from './misc/folderDetails';
import { AppPackager } from './misc/appPackager';
import { TypescriptCompiler } from './compiler/TypescriptCompiler';
import { AppsEngineValidator } from './compiler/AppsEngineValidator';

export type TypeScript = typeof fallbackTypescript;

export class AppsCompiler {
    private compilationResult: ICompilerResult | undefined;

    private readonly validator: AppsEngineValidator;

    private readonly typescriptCompiler: TypescriptCompiler;

    constructor(
        private readonly compilerDesc: ICompilerDescriptor,
        private readonly sourcePath: string,
        ts: TypeScript = fallbackTypescript,
    ) {
        this.validator = new AppsEngineValidator(createRequire(`${ sourcePath }/app.json`));

        this.typescriptCompiler = new TypescriptCompiler(sourcePath, ts, this.validator);
    }

    public getLatestCompilationResult(): AppsCompiler['compilationResult'] {
        return this.compilationResult;
    }

    public async compile(): Promise<ICompilerResult> {
        const source = await getAppSource(this.sourcePath);

        this.compilationResult = this.typescriptCompiler.transpileSource(source);

        return this.getLatestCompilationResult();
    }

    public async outputZip(outputPath: string): Promise<Buffer> {
        const fd = new FolderDetails(this.sourcePath);

        try {
            // @NOTE this is important for generating the zip file with the correct name
            await fd.readInfoFile();
        } catch (e) {
            console.error(e && e.message ? e.message : e);
            return;
        }

        const compilationResult = this.getLatestCompilationResult();

        if (!compilationResult) {
            throw new Error('No compilation data found');
        }

        const packager = new AppPackager(this.compilerDesc, fd, compilationResult, outputPath);

        return fs.promises.readFile(await packager.zipItUp());
    }
}

import * as fs from "fs";
import * as path from "path";
import * as fallbackTypescript from "typescript";

import { createRequire } from "module";
import { getAppSource } from "./compiler/getAppSource";
import {
    IBundledCompilerResult,
    ICompilerDescriptor,
    ICompilerResult,
} from "./definition";
import { FolderDetails } from "./misc/folderDetails";
import { AppPackager } from "./packager";
import { AppsEngineValidator } from "./compiler/AppsEngineValidator";
import getBundler, { AvailableBundlers, BundlerFunction } from "./bundler";
import { TscBasedCompiler } from "./compiler/TscBasedCompiler";

export type TypeScript = typeof fallbackTypescript;

export class AppsCompiler {
    private compilationResult?: ICompilerResult;

    private readonly bundler: BundlerFunction;

    private readonly validator: AppsEngineValidator;

    private readonly typescriptCompiler: TscBasedCompiler;

    constructor(
        private readonly compilerDesc: ICompilerDescriptor,
        private readonly sourcePath: string,
        ts: TypeScript = fallbackTypescript
    ) {
        this.validator = new AppsEngineValidator(
            createRequire(path.join(sourcePath, "app.json"))
        );

        // this.typescriptCompiler = new TypescriptCompiler(sourcePath, ts, this.validator);
        this.typescriptCompiler = new TscBasedCompiler(
            sourcePath,
            this.validator
        );
        this.bundler = getBundler(AvailableBundlers.esbuild);
    }

    public getLatestCompilationResult(): ICompilerResult {
        return this.compilationResult;
    }

    public async run(outputPath: string): Promise<Buffer> {
        await this.compile();
        await this.bundle();

        return this.outputZip(outputPath);
    }

    public async compile(): Promise<ICompilerResult> {
        const source = await getAppSource(this.sourcePath);

        this.compilationResult = await this.typescriptCompiler.transpileSource(
            source
        );

        return this.getLatestCompilationResult();
    }

    public async bundle(): Promise<IBundledCompilerResult> {
        this.compilationResult = await this.bundler(
            this.getLatestCompilationResult(),
            this.validator
        );

        return this.getLatestCompilationResult() as IBundledCompilerResult;
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
            throw new Error("No compilation data found");
        }

        const packager = new AppPackager(
            this.compilerDesc,
            fd,
            compilationResult,
            outputPath
        );

        return fs.promises.readFile(await packager.zipItUp());
    }
}

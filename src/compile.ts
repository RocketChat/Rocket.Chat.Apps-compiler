/* eslint-disable @typescript-eslint/no-var-requires */

import { createRequire } from 'module';
import { inspect } from 'util';
import path from 'path';

import * as TS from 'typescript';

import log from './misc/logger';

import { AppsCompiler } from '.';
import { CompilerFileNotFoundError, ICompilerDescriptor, ICompilerResult } from './definition';

const { promises: fs, constants: { R_OK: READ_ACCESS } } = require('fs');

export async function compile(compilerDesc: ICompilerDescriptor, sourceDir: string, outputFile: string): Promise<ICompilerResult> {
    sourceDir = path.resolve(sourceDir);
    outputFile = path.resolve(outputFile);

    log.info('Compiling app at ', sourceDir);

    const sourceAppManifest = path.format({ dir: sourceDir, base: 'app.json' });

    try {
        log.debug('Checking access to app\'s source folder');

        await fs.access(sourceAppManifest, READ_ACCESS);
    } catch (error) {
        log.error(`Can't read app's manifest in "${ sourceAppManifest }". Are you sure there is an app there?`);
        throw new CompilerFileNotFoundError(sourceAppManifest);
    }

    const appRequire = createRequire(sourceAppManifest);

    log.debug('Created require function for the app\'s folder scope');

    let appTs: typeof TS | undefined;

    try {
        appTs = appRequire('typescript') as typeof TS;

        log.debug(`Using TypeScript ${ appTs.version } as specified in app's dependencies`);
    } catch {
        log.debug("App doesn't have the typescript package as a dependency - compiler will fall back to TypeScript 2.9.2");
    }

    try {
        const compiler = new AppsCompiler(compilerDesc, sourceDir, appTs);

        log.debug('Starting compilation...');

        const result = await compiler.compile();

        if (result.diagnostics.length) {
            return result;
        }

        log.debug('Compilation complete, inspection \n', inspect(result));
        log.debug('Starting bundling...');

        await compiler.bundle();

        log.debug('Compilation complete, inspection \n', inspect(compiler.getLatestCompilationResult()));
        log.debug('Starting packaging...');

        await compiler.outputZip(outputFile);

        log.info(`Compilation successful! Took ${ result.duration / 1000 }s. Package saved at `, outputFile);

        return compiler.getLatestCompilationResult();
    } catch (error) {
        log.error('Compilation was unsuccessful');

        throw error;
    }
}

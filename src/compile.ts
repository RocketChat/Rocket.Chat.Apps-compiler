/* eslint-disable @typescript-eslint/no-var-requires */

import { createRequire } from 'module';
import { inspect } from 'util';
import path from 'path';

import * as TS from 'typescript';

import logger from './misc/logger';

import { AppsCompiler } from '.';
import { CompilerFileNotFoundError, ICompilerDescriptor, ICompilerResult } from './definition';

const { promises: fs, constants: { R_OK: READ_ACCESS } } = require('fs');

export async function compile(compilerDesc: ICompilerDescriptor, sourceDir: string, outputFile: string, useNativeCompiler = false): Promise<ICompilerResult> {
    sourceDir = path.resolve(sourceDir);
    outputFile = path.resolve(outputFile);

    logger.info('Compiling app at ', sourceDir);

    const sourceAppManifest = path.format({ dir: sourceDir, base: 'app.json' });

    try {
        logger.debug('Checking access to app\'s source folder');

        await fs.access(sourceAppManifest, READ_ACCESS);
    } catch (error) {
        logger.error(`Can't read app's manifest in "${ sourceAppManifest }". Are you sure there is an app there?`);
        throw new CompilerFileNotFoundError(sourceAppManifest);
    }

    const appRequire = createRequire(sourceAppManifest);

    logger.debug('Created require function for the app\'s folder scope');

    let appTs: typeof TS | undefined;

    try {
        appTs = appRequire('typescript') as typeof TS;

        logger.debug(`Using TypeScript ${ appTs.version } as specified in app's dependencies`);
    } catch {
        logger.debug("App doesn't have the typescript package as a dependency - compiler will fall back to TypeScript 2.9.2");
    }

    try {
        const compiler = new AppsCompiler(compilerDesc, sourceDir, appTs, useNativeCompiler);

        logger.debug('Starting compilation...');

        const result = await compiler.compile();

        if (result.diagnostics.length) {
            return result;
        }

        logger.debug('Compilation complete, inspection \n', inspect(result));
        logger.debug('Starting bundling...');

        await compiler.bundle();

        logger.debug('Compilation complete, inspection \n', inspect(compiler.getLatestCompilationResult()));
        logger.debug('Starting packaging...');

        await compiler.outputZip(outputFile);

        logger.info(`Compilation successful! Took ${ result.duration / 1000 }s. Package saved at `, outputFile);

        return compiler.getLatestCompilationResult();
    } catch (error) {
        logger.error('Compilation was unsuccessful');

        throw error;
    }
}

/* eslint-disable @typescript-eslint/no-var-requires */

import { createRequire } from 'module';
import { inspect } from 'util';
import path from 'path';

import * as TS from 'typescript';

import { AppsCompiler } from '.';
import { CompilerError } from './definition/CompilerError';
import { ICompilerResult } from './definition';

const { promises: fs, constants: { R_OK: READ_ACCESS } } = require('fs');

const log = require('simple-node-logger').createSimpleLogger({
    timestampFormat: 'YYYY-MM-DD HH:mm:ss.SSS',
});

log.setLevel(process.env.LOG_LEVEL || 'info');

export async function compile(sourceDir: string, outputFile: string): Promise<ICompilerResult> {
    sourceDir = path.resolve(sourceDir);
    outputFile = path.resolve(outputFile);

    log.info('Compiling app at ', sourceDir);

    const sourceAppManifest = path.format({ dir: sourceDir, base: 'app.json' });

    try {
        log.debug('Checking access to app\'s source folder');

        await fs.access(sourceAppManifest, READ_ACCESS);
    } catch (error) {
        log.error(`Can't read app's manifest in "${ sourceAppManifest }". Are you sure there is an app there?`);
        throw error;
    }

    const appRequire = createRequire(sourceAppManifest);

    log.debug('Created require function for the app\'s folder scope');

    let appTs: typeof TS;

    try {
        appTs = appRequire('typescript');

        log.debug(`Using TypeScript ${ appTs.version } as specified in app's dependencies`);
    } catch {
        log.debug("App doesn't have the typescript package as a dependency - compiler will fall back to TypeScript 2.9.2");
    }

    try {
        const compiler = new AppsCompiler(appTs);

        log.debug('Starting compilation...');

        const result = await compiler.compile(sourceDir);

        if (result.diagnostics.length) {
            throw new CompilerError(result.diagnostics);
        }

        log.debug('Compilation complete, inspection \n', inspect(result));
        log.debug('Starting packaging...');

        await compiler.outputZip(outputFile);

        log.info(`Compilation successful! Took ${result.duration / 1000}s. Package saved at `, outputFile);

        return result;
    } catch (error) {
        log.error('Compilation was unsuccessful');

        throw error;
    }
}

#!/usr/bin/env node

/* eslint-disable @typescript-eslint/no-var-requires */

'use strict';

import { createRequire } from 'module';
import path from 'path';

import meow from 'meow';
import * as TS from 'typescript';

import { AppsCompiler } from '../src';

const { promises: fs, constants: { R_OK: READ_ACCESS } } = require('fs');


const log = require('simple-node-logger').createSimpleLogger({
    timestampFormat: 'YYYY-MM-DD HH:mm:ss.SSS',
});

type CLIFlagTypes = {
    sourceDir: meow.StringFlag,
    outputFile: meow.StringFlag,
};

const CLIResult = meow<CLIFlagTypes>(`
USAGE
    $ compile -s [path/to/source/app] -o [path/to/output/file]
`,
{
    flags: {
        outputFile: {
            type: 'string',
            alias: 'o',
            isRequired: true,
        },
        sourceDir: {
            type: 'string',
            alias: 's',
            isRequired: true,
        },
    },
});

log.setLevel(process.env.LOG_LEVEL || 'info');

async function run(cli: typeof CLIResult) {
    const sourceDir = path.resolve(cli.flags.sourceDir as string);
    const outputFile = path.resolve(cli.flags.outputFile as string);

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

        const diag = await compiler.compile(sourceDir);

        log.debug('Compilation complete, diagnostics: ', diag);
        log.debug('Starting packaging...');

        await compiler.outputZip(outputFile);
    } catch (error) {
        log.error('Compilation was unsuccessful');
        throw error;
    }

    log.info('Compilation successful! Package saved at ', outputFile);
}

// eslint-disable-next-line
run(CLIResult).catch(err => (console.error(err), process.exitCode = 1));

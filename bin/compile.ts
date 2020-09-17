#!/usr/bin/env node

/* eslint-disable @typescript-eslint/no-var-requires */

'use strict';

import meow from 'meow';

import { compile } from '../src';

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
        sourceDir: {
            type: 'string',
            alias: 's',
            isRequired: true,
        },
        outputFile: {
            type: 'string',
            alias: 'o',
            isRequired: true,
        },
    },
});

const { sourceDir, outputFile } = CLIResult.flags;

// eslint-disable-next-line
compile(sourceDir as string, outputFile as string).catch(err => (console.error(err), process.exitCode = 1));

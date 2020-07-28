import * as fallbackTypescript from 'typescript';

import { IAppsCompiler, ICompilerFile, ICompilerResult } from './definition';

export class AppsCompiler implements IAppsCompiler {
    constructor(
        private readonly ts = fallbackTypescript,
    ) {

    }

    public toJs(classFile: string, files: { [filename: string]: ICompilerFile }): ICompilerResult {
        return {} as ICompilerResult;
    }
}

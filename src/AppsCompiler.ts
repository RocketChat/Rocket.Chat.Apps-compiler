import * as fallbackTypescript from 'typescript';

import { IAppsCompiler, IAppSource, ICompilerResult } from './definition';

export class AppsCompiler implements IAppsCompiler {
    constructor(
        private readonly ts = fallbackTypescript,
    ) {
        console.log(this.ts.version);
    }

    public toJs({ classFile, files }: IAppSource): ICompilerResult {
        console.log(classFile);
        return { files } as ICompilerResult;
    }
}

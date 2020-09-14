import { Diagnostic } from 'typescript';

import { ICompilerFile } from './ICompilerFile';

export interface ICompilerResult {
    files: { [s: string]: ICompilerFile };
    implemented: Array<string>;
    diagnostics: Array<Diagnostic>;
}

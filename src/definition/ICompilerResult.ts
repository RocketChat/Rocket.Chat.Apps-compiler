
import { ICompilerDiagnostic } from './ICompilerDiagnostic';

import { ICompilerFile } from './ICompilerFile';

export interface ICompilerResult {
    files: { [s: string]: ICompilerFile };
    implemented: Array<string>;
    diagnostics: Array<ICompilerDiagnostic>;
    duration: number;
    typeScriptVersion: string;
}

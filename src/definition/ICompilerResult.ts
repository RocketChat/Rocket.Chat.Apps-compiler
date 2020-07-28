import { ICompilerFile } from './ICompilerFile';
import { ICompilerError } from './ICompilerError';

export interface ICompilerResult {
    files: { [s: string]: ICompilerFile };
    implemented: Array<string>;
    compilerErrors: Array<ICompilerError>;
}

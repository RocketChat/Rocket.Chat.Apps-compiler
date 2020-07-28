import { ICompilerFile } from './ICompilerFile';

export interface IAppSource {
    classFile: string;
    files: { [filename: string]: ICompilerFile };
}

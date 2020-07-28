import { ICompilerFile } from './ICompilerFile';
import { ICompilerResult } from './ICompilerResult';

export interface IAppsCompiler {
    /**
     * Compile an Rocket.Chat app into Javascript.
     * @param classFile entry class filename, including the `.ts` extension
     * @param files map of filenames and the compileFiles, see ICompileFile interfaace for the detail.
     */
    toJs(classFile: string, files: { [filename: string]: ICompilerFile }): ICompilerResult;
}

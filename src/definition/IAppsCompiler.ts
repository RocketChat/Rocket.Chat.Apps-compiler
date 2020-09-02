import { Diagnostic } from 'typescript';
import { ICompilerError } from '.';

export interface IAppsCompiler {
    compile(path: string): Promise<ICompilerError[]>;
    outputZip(outputPath: string): Promise<Buffer>;
    output(): { [filename: string]: string };
}

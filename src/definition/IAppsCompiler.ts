import { Diagnostic } from 'typescript';

export interface IAppsCompiler {
    compile(path: string): Promise<Diagnostic[]>;
    outputZip(outputPath: string): Promise<Buffer>;
    output(): { [filename: string]: string };
}

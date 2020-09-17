import { ICompilerDiagnostic } from './ICompilerDiagnostic';

export class CompilerError extends Error {
    constructor(readonly diagnostics: Array<ICompilerDiagnostic>) {
        super('Compilation error');
    }
}

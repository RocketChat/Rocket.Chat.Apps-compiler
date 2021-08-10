import { IPermission } from '@rocket.chat/apps-engine/definition/permissions/IPermission';
import { ICompilerDiagnostic } from './ICompilerDiagnostic';
import { ICompilerFile } from './ICompilerFile';

export interface ICompilerResult {
    files: { [s: string]: ICompilerFile };
    mainFile?: ICompilerFile;
    implemented: Array<string>;
    diagnostics: Array<ICompilerDiagnostic>;
    duration: number;
    name: string;
    version: string;
    typeScriptVersion: string;
    permissions?: Array<IPermission>;
}

export interface IBundledCompilerResult extends ICompilerResult {
    bundle: string;
}

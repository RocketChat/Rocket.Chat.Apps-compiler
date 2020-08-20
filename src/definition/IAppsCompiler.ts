import { IAppSource } from './IAppSource';
import { ICompilerResult } from './ICompilerResult';

export interface IAppsCompiler {
    /**
     * Compile an Rocket.Chat app into Javascript.
     */
    toJs({ classFile, files }: IAppSource): ICompilerResult;
}
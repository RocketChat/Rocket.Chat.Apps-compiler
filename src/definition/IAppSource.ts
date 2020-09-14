import { ICompilerFile } from './ICompilerFile';
import { IAppInfo } from './IAppInfo';

export interface IAppSource {
    appInfo: IAppInfo;
    sourceFiles: { [filename: string]: ICompilerFile };
}

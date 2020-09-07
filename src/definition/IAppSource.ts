import { ICompilerFile } from './ICompilerFile';
import { IAppInfo } from './IAppInfo';

export interface IAppSource {
    appInfo: IAppInfo;
    assets: { [filename: string]: string };
    sourceFiles: { [filename: string]: ICompilerFile };
}

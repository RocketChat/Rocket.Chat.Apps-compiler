import { ICompilerFile } from './ICompilerFile';
import { IAppInfo } from './IAppInfo';

export interface IAppSource {
    appInfo: IAppInfo;
    files: { [filename: string]: ICompilerFile };
}

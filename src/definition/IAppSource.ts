import { IAppInfo } from '@rocket.chat/apps-engine/definition/metadata';

import { ICompilerFile } from './ICompilerFile';

export interface IAppSource {
    appInfo: IAppInfo;
    sourceFiles: { [filename: string]: ICompilerFile };
}

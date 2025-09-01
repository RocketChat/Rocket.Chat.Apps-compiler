import type { IAppInfo } from "@rocket.chat/apps-engine/definition/metadata";

import type { ICompilerFile } from "./ICompilerFile";

export interface IAppSource {
    appInfo: IAppInfo;
    sourceFiles: { [filename: string]: ICompilerFile };
}

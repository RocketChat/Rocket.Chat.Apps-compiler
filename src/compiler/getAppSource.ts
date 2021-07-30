import { promises as fs } from 'fs';
import { resolve, relative } from 'path';
import { IAppInfo } from '@rocket.chat/apps-engine/definition/metadata';

import { IAppSource, ICompilerFile, IMapCompilerFile } from '../definition';

async function walkDirectory(directory: string): Promise<ICompilerFile[]> {
    const dirents = await fs.readdir(directory, { withFileTypes: true });
    const files = await Promise.all(
        dirents
            .map(async (dirent) => {
                const res = resolve(directory, dirent.name);

                const dirsToIgnore = ['node_modules', '.git'];
                if (dirsToIgnore.some((dir) => res.includes(dir))) {
                    return null;
                }

                if (dirent.isDirectory() || dirent.isSymbolicLink()) {
                    return walkDirectory(res);
                }

                const content = await fs.readFile(res, 'utf8');

                return {
                    content,
                    name: res,
                    version: 0,
                };
            })
            .filter((entry) => entry),
    );

    return Array.prototype.concat(...files);
}

function filterProjectFiles(projectDirectory: string, directoryWalkData: ICompilerFile[]): ICompilerFile[] {
    return directoryWalkData
        // Leave out falsy values
        .filter((file: ICompilerFile) => file && !file.name.startsWith('.'))
        // Get the file names like it was inside the project's directory
        .map((file: ICompilerFile) => ({ ...file, name: relative(projectDirectory, file.name) }));
}

function makeICompilerFileMap(compilerFiles: ICompilerFile[]): IMapCompilerFile {
    return compilerFiles
        .map((file: ICompilerFile) => ({ [file.name]: file }))
        .reduce((acc: IMapCompilerFile, curr: IMapCompilerFile) => ({ ...acc, ...curr }), {});
}

function getAppInfo(projectFiles: ICompilerFile[]): IAppInfo {
    const appJson = projectFiles.find((file: ICompilerFile) => file.name === 'app.json');

    if (!appJson) {
        throw new Error('There is no app.json file in the project');
    }

    try {
        return JSON.parse(appJson.content) as IAppInfo;
    } catch (error) {
        throw new Error('app.json parsing fail');
    }
}

function getTypescriptFilesFromProject(projectFiles: ICompilerFile[]): ICompilerFile[] {
    return projectFiles.filter((file: ICompilerFile) => file.name.endsWith('.ts'));
}

export async function getAppSource(path: string): Promise<IAppSource> {
    const directoryWalkData: ICompilerFile[] = await walkDirectory(path);
    const projectFiles: ICompilerFile[] = filterProjectFiles(path, directoryWalkData);
    const tsFiles: ICompilerFile[] = getTypescriptFilesFromProject(projectFiles);
    const appInfo: IAppInfo = getAppInfo(projectFiles);
    const files: IMapCompilerFile = makeICompilerFileMap(tsFiles);

    return { appInfo, sourceFiles: files };
}

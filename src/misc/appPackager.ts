import * as path from 'path';

import * as fs from 'fs-extra';
import * as Yazl from 'yazl';
import glob, { IOptions } from 'glob';

import { FolderDetails } from './folderDetails';
import { IFiles } from '../definition/IFiles';
import packageInfo from '../../package.json';

export class AppPackager {
    public static GlobOptions: IOptions = {
        dot: false,
        silent: true,
        ignore: [
            '**/README.md',
            '**/tslint.json',
            '**/*.js.map',
            '**/*.ts',
            '**/*.d.ts',
            '**/*.spec.ts',
            '**/*.test.ts',
            '**/dist/**',
            '**/.*',
        ],
    };

    public static PackagerInfo: { [key: string]: string } = {
        tool: packageInfo.name,
        version: packageInfo.version,
    };

    private zip: Yazl.ZipFile = new Yazl.ZipFile();

    constructor(private fd: FolderDetails, private compiledFiles: IFiles, private outputFilename: string) {}

    public async zipItUp(): Promise<string> {
        const zipName = this.outputFilename;

        this.zip.addBuffer(Buffer.from(JSON.stringify(AppPackager.PackagerInfo)), '.packagedby', { compress: true });

        this.zipFromCompiledSource(this.compiledFiles);

        await this.zipSupportFiles(this.fd);

        this.zip.end();

        await this.asyncWriteZip(this.zip, zipName);

        return zipName;
    }

    private async zipSupportFiles(fd: FolderDetails): Promise<void> {
        let matches;

        try {
            matches = await this.asyncGlob();
        } catch (e) {
            console.warn(`Failed to retrieve the list of files for the App ${ this.fd.info.name }.`);
            throw e;
        }

        // Ensure we have some files to package up before we do the packaging
        if (matches.length === 0) {
            throw new Error('No files to package were found');
        }

        await Promise.all(
            matches.map(async (realPath) => {
                const zipPath = path.relative(fd.folder, realPath);

                const fileStat = await fs.stat(realPath);

                const options: Partial<Yazl.Options> = {
                    compress: true,
                    mtime: fileStat.mtime,
                    mode: fileStat.mode,
                };

                this.zip.addFile(realPath, zipPath, options);
            }));
    }

    private zipFromCompiledSource(compiledFiles: IFiles): void {
        Object.keys(compiledFiles)
            .map((fileName) => this.zip.addBuffer(Buffer.from(compiledFiles[fileName]), fileName, { compress: true }));
    }

    // tslint:disable-next-line:promise-function-async
    private asyncGlob(): Promise<Array<string>> {
        return new Promise((resolve, reject) => {
            glob(this.fd.toZip, AppPackager.GlobOptions, (err, matches) => {
                if (err) {
                    reject(err);
                    return;
                }

                resolve(matches);
            });
        });
    }

    // tslint:disable-next-line:promise-function-async
    private asyncWriteZip(zip: Yazl.ZipFile, zipName: string): Promise<void> {
        return new Promise((resolve) => {
            fs.mkdirpSync(path.dirname(zipName));
            zip.outputStream.pipe(fs.createWriteStream(zipName)).on('close', resolve);
        });
    }
}

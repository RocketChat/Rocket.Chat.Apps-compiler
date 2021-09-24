import * as path from 'path';

import * as fs from 'fs-extra';
import * as Yazl from 'yazl';
import glob, { IOptions } from 'glob';

import { FolderDetails } from '../misc/folderDetails';
import { IBundledCompilerResult, ICompilerDescriptor, ICompilerResult } from '../definition';
import { isBundled } from '../bundler';
import logger from '../misc/logger';

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

    private zip = new Yazl.ZipFile();

    constructor(
        private readonly compilerDesc: ICompilerDescriptor,
        private fd: FolderDetails,
        private compilationResult: ICompilerResult | IBundledCompilerResult,
        private outputFilename: string,
    ) { }

    public async zipItUp(): Promise<string> {
        const zipName = this.outputFilename;

        this.zip.addBuffer(Buffer.from(JSON.stringify(this.compilerDesc)), '.packagedby', { compress: true });

        this.overwriteAppManifest();

        this.zipFilesFromCompiledSource();

        await this.zipSupportFiles();

        this.zip.end();

        await this.writeZip(this.zip, zipName);

        return zipName;
    }

    private overwriteAppManifest(): void {
        // At this point, the interface names in the implemented property
        // have been validated and guaranteed to be correct, so we type cast
        this.fd.info.implements = this.compilationResult.implemented as any;

        fs.writeFileSync(this.fd.infoFile, JSON.stringify(this.fd.info, null, 4));
    }

    private async zipSupportFiles(): Promise<void> {
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

        if (!this.isFilePresent(matches, 'package-lock.json')) {
            logger.warn('No package-lock.json found');
        }

        await Promise.all(
            matches.map(async (realPath) => {
                const zipPath = path.relative(this.fd.folder, realPath);

                const fileStat = await fs.stat(realPath);

                const options: Partial<Yazl.Options> = {
                    compress: true,
                    mtime: fileStat.mtime,
                    mode: fileStat.mode,
                };

                this.zip.addFile(realPath, zipPath, options);
            }));
    }

    private zipFilesFromCompiledSource(): void {
        if (isBundled(this.compilationResult)) {
            this.zip.addBuffer(Buffer.from(this.compilationResult.bundle), this.compilationResult.mainFile.name);
        } else {
            Object.entries(this.compilationResult.files)
                .map(([filename, contents]) => this.zip.addBuffer(
                    Buffer.from(contents.compiled),
                    filename,
                ));
        }
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
    private writeZip(zip: Yazl.ZipFile, zipName: string): Promise<void> {
        return new Promise((resolve, reject) => {
            fs.mkdirpSync(path.dirname(zipName));
            zip.outputStream.pipe(fs.createWriteStream(zipName))
                .on('close', resolve)
                .on('error', reject);
        });
    }

    private isFilePresent(fileList: Array<string>, fileName: string): boolean {
        const targetFilePath = path.join(this.fd.folder, fileName);
        return fileList.includes(targetFilePath);
    }
}

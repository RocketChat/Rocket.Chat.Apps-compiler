import * as path from 'path';

import * as fs from 'fs-extra';
import * as Yazl from 'yazl';


export async function zipItUp(): Promise<string> {
    let matches;

    const PackagerInfo: { [key: string]: string } = {
        tool: '@rocket.chat/apps-cli',
        version: '1.6.0',
    };

    try {
        matches = await this.asyncGlob();
    } catch (e) {
        this.command.warn(`Failed to retrieve the list of files for the App ${ this.fd.info.name }.`);
        throw e;
    }

    // Ensure we have some files to package up before we do the packaging
    if (matches.length === 0) {
        throw new Error('No files to package were found');
    }

    const zipName = path.join('dist', `${ this.fd.info.nameSlug }_${ this.fd.info.version }.zip`);
    const zip = new Yazl.ZipFile();

    zip.addBuffer(Buffer.from(JSON.stringify(AppPackager.PackagerInfo)), '.packagedby', { compress: true });

    for (const realPath of matches) {
        const zipPath = path.relative(this.fd.folder, realPath);
        // @ts-ignore
        const fileStat = await fs.stat(realPath);

        const options: Partial<Yazl.Options> = {
            compress: true,
            mtime: fileStat.mtime,
            mode: fileStat.mode,
        };

        zip.addFile(realPath, zipPath, options);
    }

    zip.end();

    await this.asyncWriteZip(zip, zipName);

    return zipName;
}

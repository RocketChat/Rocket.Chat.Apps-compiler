import * as fs from 'fs';
import { patchRequire } from 'fs-monkey';
import { vol } from 'memfs';
import * as path from 'path';

interface IFiles {
    [fullpath: string]: string;
}

/**
 * A file system in the memory that can help us require a Node.js
 * module from files in the memory.
 */
export const MemFS = new class {
    public files: IFiles = {};

    constructor() {
        this.require = this.require.bind(this);
    }

    /**
     * Add files to the memory file system from a plain JavaScript object
     *
     * @param files a plain JavaScript object whose key is the path and value
     * is the content of the file. NOTE: All path should start with '/' to be an
     * absolute path.
     *
     * @example
     *
     * {
     *    '/foo/bar.js': 'module.exports = { name: 'Jack' }',
     *    '/main.js': 'module.exports = { age: 22 }',
     * }
     */
    public addFiles(files: IFiles) {
        Object.assign(this.files, files);
        return this;
    }

    /**
     * Add files to the memory file system recursively from a directory in the local disk
     *
     * @param workdingDirectory current working directory
     * @param dir the directory path
     */
    public addFilesFromLocalDir(workdingDirectory: string, dir: string) {
        const recursiveListFiles = (rootPath: string): any => {
            const dirents = fs.readdirSync(rootPath, { withFileTypes: true })
                .map((subdir) => {
                    const fullpath = path.resolve(rootPath, subdir.name);
                    return fs.statSync(fullpath).isDirectory()
                        ? recursiveListFiles(fullpath)
                        : fullpath;
                }) as any;

            return dirents.flat(Infinity);
        };

        const lib = recursiveListFiles(dir)
            .reduce((lib: { [path: string]: string }, filenname: string): any =>
                Object.assign(lib, {
                    [path.relative(workdingDirectory, filenname)]: fs.readFileSync(filenname, { encoding: 'utf-8' }),
                }), []);

        Object.assign(this.files, lib);
        return this;
    }

    /**
     * require a module from the memory file system
     *
     * @param path the module's path
     */
    public require(path: string): Promise<any> {
        const transformedFiles = Object.entries(this.files)
            .map(([path, content]) => ({ [`/${ path }`]: content }))
            .reduce((files, file) => Object.assign(files, file), {});

        vol.fromJSON(transformedFiles);
        const unpatch = patchRequire(vol);
        // eslint-disable-next-line @typescript-eslint/no-var-requires,import/no-dynamic-require
        const module = require(`/${ path }`);
        unpatch();

        return module;
    }
}();

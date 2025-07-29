export class CompilerFileNotFoundError extends Error {
    constructor(readonly path: string) {
        super("File not found");
    }
}

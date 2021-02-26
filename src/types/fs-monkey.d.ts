declare module 'fs-monkey' {
    export function patchRequire(volume: Volume): () => void;
}

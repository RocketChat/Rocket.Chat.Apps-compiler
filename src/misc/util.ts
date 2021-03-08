// The fallback typescript v2.9.2 is too old, we need it for polyfill
export type Omit<T, K extends keyof T> = Pick<T, Exclude<keyof T, K>>;

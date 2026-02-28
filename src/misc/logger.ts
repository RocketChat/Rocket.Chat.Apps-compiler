type LogLevel = "trace" | "debug" | "info" | "warn" | "error" | "fatal";

const LEVEL_ORDER: Record<LogLevel, number> = {
    trace: 10,
    debug: 20,
    info: 30,
    warn: 40,
    error: 50,
    fatal: 60,
};

const normalizeLevel = (level: string | undefined): LogLevel => {
    if (!level) {
        return "info";
    }

    const normalized = level.toLowerCase() as LogLevel;
    return LEVEL_ORDER[normalized] ? normalized : "info";
};

const now = (): string => {
    const date = new Date();
    const pad = (value: number, size = 2): string =>
        value.toString().padStart(size, "0");

    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`;
};

class NativeLogger {
    private level: LogLevel = "info";

    public setLevel(level: string): void {
        this.level = normalizeLevel(level);
    }

    private shouldLog(level: LogLevel): boolean {
        return LEVEL_ORDER[level] >= LEVEL_ORDER[this.level];
    }

    private log(
        method: "debug" | "info" | "warn" | "error",
        level: LogLevel,
        args: unknown[],
    ): void {
        if (!this.shouldLog(level)) {
            return;
        }

        console[method](`[${now()}] ${level.toUpperCase()}`, ...args);
    }

    public debug(...args: unknown[]): void {
        this.log("debug", "debug", args);
    }

    public info(...args: unknown[]): void {
        this.log("info", "info", args);
    }

    public warn(...args: unknown[]): void {
        this.log("warn", "warn", args);
    }

    public error(...args: unknown[]): void {
        this.log("error", "error", args);
    }
}

const logger = new NativeLogger();
logger.setLevel(process.env.LOG_LEVEL);

export default logger;

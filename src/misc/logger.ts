const pino = require("pino");


const logger = pino({
    level: process.env.LOG_LEVEL || "info",
    timestamp: pino.stdTimeFunctions.isoTime,
    transport: {
        target: 'pino-pretty',
        options: {
            colorize: true
        }
    }
});

export default logger;

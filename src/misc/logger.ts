/* eslint-disable @typescript-eslint/no-var-requires */
const logger = require("simple-node-logger").createSimpleLogger({
    timestampFormat: "YYYY-MM-DD HH:mm:ss.SSS",
});

logger.setLevel(process.env.LOG_LEVEL || "info");

export default logger;

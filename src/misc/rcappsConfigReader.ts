import * as fs from "fs";
import * as path from "path";
import logger from "./logger";

export interface IRcappsConfig {
    ignore?: string[];
    include?: string[];
}

/**
 * Reads and parses the .rcappsconfig file from the given directory
 * @param projectPath The path to the project directory
 * @returns The parsed configuration or null if file doesn't exist
 */
export async function readRcappsConfig(projectPath: string): Promise<IRcappsConfig | null> {
    const configPath = path.join(projectPath, ".rcappsconfig");
    
    try {
        const configContent = await fs.promises.readFile(configPath, "utf8");
        const config = JSON.parse(configContent) as IRcappsConfig;
        
        logger.debug(`Loaded .rcappsconfig from ${configPath}`);
        return config;
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
            logger.debug("No .rcappsconfig file found, using default configuration");
            return null;
        }
        
        logger.warn(`Failed to parse .rcappsconfig file: ${error.message}`);
        return null;
    }
}

/**
 * Merges the default ignore patterns with those from .rcappsconfig
 * @param defaultIgnore Default ignore patterns
 * @param config The .rcappsconfig configuration
 * @returns Combined ignore patterns
 */
export function mergeIgnorePatterns(defaultIgnore: string[], config: IRcappsConfig | null): string[] {
    if (!config || !config.ignore) {
        return defaultIgnore;
    }
    
    // Combine default ignore patterns with those from .rcappsconfig
    // .rcappsconfig patterns take precedence (are added last)
    return [...defaultIgnore, ...config.ignore];
}

/**
 * Checks if a file path should be ignored based on the configuration
 * @param filePath The file path to check
 * @param ignorePatterns Array of ignore patterns (glob-style)
 * @returns true if the file should be ignored
 */
export function shouldIgnoreFile(filePath: string, ignorePatterns: string[]): boolean {
    return ignorePatterns.some(pattern => {
        // Support both glob patterns and simple directory/file names
        // Check for exact matches, basename matches, and path contains matches
        const normalizedPath = path.normalize(filePath).replace(/\\/g, "/");
        const normalizedPattern = pattern.replace(/\\/g, "/");
        
        // Simple pattern matching - check if the pattern matches the path
        let isMatch = false;
        
        // Exact match
        if (normalizedPath === normalizedPattern) {
            isMatch = true;
        }
        // Basename match
        else if (path.basename(normalizedPath) === normalizedPattern) {
            isMatch = true;
        }
        // Path contains pattern
        else if (normalizedPath.includes(normalizedPattern)) {
            isMatch = true;
        }
        // Glob-style patterns
        else if (normalizedPattern.includes("*") || normalizedPattern.includes("?")) {
            // Convert simple glob pattern to regex
            const regexPattern = normalizedPattern
                .replace(/\./g, "\\.")
                .replace(/\*/g, ".*")
                .replace(/\?/g, ".");
            try {
                const regex = new RegExp(`^${regexPattern}$`);
                isMatch = regex.test(normalizedPath) || regex.test(path.basename(normalizedPath));
            } catch (e) {
                // If regex fails, fall back to simple contains check
                isMatch = normalizedPath.includes(normalizedPattern.replace(/\*/g, ""));
            }
        }
        
        if (isMatch) {
            logger.debug(`File ${filePath} ignored by pattern: ${pattern}`);
        }
        
        return isMatch;
    });
}
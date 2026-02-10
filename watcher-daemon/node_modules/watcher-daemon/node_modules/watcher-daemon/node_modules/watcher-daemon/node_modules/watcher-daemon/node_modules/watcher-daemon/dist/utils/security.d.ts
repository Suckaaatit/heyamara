export interface SecurityConfig {
    allowedBasePaths: string[];
    allowSymlinks: boolean;
    maxFileSize: number;
    blockedExtensions: string[];
}
export declare class SecurityValidator {
    private config;
    constructor(config?: Partial<SecurityConfig>);
    /**
     * Validates that a file path is within allowed directories
     * and doesn't contain path traversal attempts.
     */
    validateFilePath(filePath: string): Promise<boolean>;
    /**
     * Validates watch directory is safe to monitor.
     */
    validateWatchDirectory(watchDir: string): boolean;
    /**
     * Sanitizes a user-provided path to prevent traversal.
     */
    sanitizePath(inputPath: string): string;
    /**
     * Validates path containment while preventing prefix collisions.
     */
    private isPathWithinBase;
}
export declare const defaultSecurityValidator: SecurityValidator;
//# sourceMappingURL=security.d.ts.map
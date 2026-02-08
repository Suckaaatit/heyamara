"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.defaultSecurityValidator = exports.SecurityValidator = void 0;
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const Logger_1 = __importDefault(require("../logger/Logger"));
class SecurityValidator {
    config;
    constructor(config = {}) {
        this.config = {
            allowedBasePaths: config.allowedBasePaths || [process.cwd()],
            allowSymlinks: config.allowSymlinks ?? false,
            maxFileSize: config.maxFileSize || 100 * 1024 * 1024, // 100MB
            blockedExtensions: config.blockedExtensions || ['.exe', '.dll', '.so', '.dylib', '.bin'],
        };
    }
    /**
     * Validates that a file path is within allowed directories
     * and doesn't contain path traversal attempts.
     */
    async validateFilePath(filePath) {
        try {
            // Resolve to absolute path
            const absolutePath = path_1.default.resolve(filePath);
            // Check for path traversal (shouldn't escape allowed base)
            const isWithinAllowed = this.config.allowedBasePaths.some((base) => {
                return this.isPathWithinBase(absolutePath, base);
            });
            if (!isWithinAllowed) {
                Logger_1.default.warn('Security: Path outside allowed directories', {
                    path: absolutePath,
                    allowedBases: this.config.allowedBasePaths,
                });
                return false;
            }
            // Check blocked extensions
            const ext = path_1.default.extname(absolutePath).toLowerCase();
            if (this.config.blockedExtensions.includes(ext)) {
                Logger_1.default.warn('Security: Blocked file extension', { path: absolutePath, ext });
                return false;
            }
            // Check for symlinks if not allowed
            if (!this.config.allowSymlinks) {
                try {
                    const stats = await fs_1.default.promises.lstat(absolutePath);
                    if (stats.isSymbolicLink()) {
                        Logger_1.default.warn('Security: Symlink detected and blocked', { path: absolutePath });
                        return false;
                    }
                }
                catch (error) {
                    const code = error && typeof error === 'object' && 'code' in error ? error.code : null;
                    if (code !== 'ENOENT') {
                        throw error;
                    }
                    // If file is missing (e.g., delete event), allow path validation to proceed.
                }
            }
            // Optional size check (skip if file no longer exists)
            try {
                const stats = await fs_1.default.promises.stat(absolutePath);
                if (stats.size > this.config.maxFileSize) {
                    Logger_1.default.warn('Security: File exceeds max size', {
                        path: absolutePath,
                        size: stats.size,
                        maxSize: this.config.maxFileSize,
                    });
                    return false;
                }
            }
            catch (error) {
                const code = error && typeof error === 'object' && 'code' in error ? error.code : null;
                if (code !== 'ENOENT') {
                    throw error;
                }
            }
            return true;
        }
        catch (error) {
            Logger_1.default.warn('Security: Failed to validate path', {
                path: filePath,
                error: error instanceof Error ? error.message : 'Unknown',
            });
            return false;
        }
    }
    /**
     * Validates watch directory is safe to monitor.
     */
    validateWatchDirectory(watchDir) {
        const absolutePath = path_1.default.resolve(watchDir);
        const normalizedPath = process.platform === 'win32' ? absolutePath.toLowerCase() : absolutePath;
        // Block system directories
        const blockedPaths = [
            '/etc',
            '/usr',
            '/bin',
            '/sbin',
            '/lib',
            '/lib64',
            '/proc',
            '/sys',
            '/dev',
            '/root',
        ];
        for (const blocked of blockedPaths) {
            if (normalizedPath === blocked || normalizedPath.startsWith(`${blocked}/`)) {
                Logger_1.default.error('Security: Cannot watch system directory', {
                    path: absolutePath,
                    blocked,
                });
                return false;
            }
        }
        if (process.platform === 'win32') {
            const driveMatch = absolutePath.match(/^([a-zA-Z]:)[\\/]/);
            if (driveMatch) {
                const drive = driveMatch[1].toLowerCase();
                const windowsBlocked = [
                    `${drive}\\windows`,
                    `${drive}\\program files`,
                    `${drive}\\program files (x86)`,
                    `${drive}\\programdata`,
                    `${drive}\\$recycle.bin`,
                    `${drive}\\system volume information`,
                ];
                for (const blocked of windowsBlocked) {
                    if (normalizedPath === blocked || normalizedPath.startsWith(`${blocked}\\`)) {
                        Logger_1.default.error('Security: Cannot watch Windows system directory', {
                            path: absolutePath,
                            blocked,
                        });
                        return false;
                    }
                }
            }
        }
        // Must be within allowed base paths
        const isWithinAllowed = this.config.allowedBasePaths.some((base) => {
            return this.isPathWithinBase(absolutePath, base);
        });
        if (!isWithinAllowed) {
            Logger_1.default.error('Security: Watch directory outside allowed paths', {
                path: absolutePath,
                allowedBases: this.config.allowedBasePaths,
            });
            return false;
        }
        Logger_1.default.info('Security: Watch directory validated', { path: absolutePath });
        return true;
    }
    /**
     * Sanitizes a user-provided path to prevent traversal.
     */
    sanitizePath(inputPath) {
        // Remove null bytes
        let sanitized = inputPath.replace(/\0/g, '');
        // Normalize path
        sanitized = path_1.default.normalize(sanitized);
        // Remove leading .. sequences
        while (sanitized.startsWith('..')) {
            sanitized = sanitized.slice(2);
            if (sanitized.startsWith('/') || sanitized.startsWith('\\')) {
                sanitized = sanitized.slice(1);
            }
        }
        return sanitized;
    }
    /**
     * Validates path containment while preventing prefix collisions.
     */
    isPathWithinBase(targetPath, basePath) {
        const resolvedTarget = path_1.default.resolve(targetPath);
        const resolvedBase = path_1.default.resolve(basePath);
        const normalizedTarget = process.platform === 'win32' ? resolvedTarget.toLowerCase() : resolvedTarget;
        const normalizedBase = process.platform === 'win32' ? resolvedBase.toLowerCase() : resolvedBase;
        return normalizedTarget === normalizedBase || normalizedTarget.startsWith(`${normalizedBase}${path_1.default.sep}`);
    }
}
exports.SecurityValidator = SecurityValidator;
exports.defaultSecurityValidator = new SecurityValidator();
//# sourceMappingURL=security.js.map
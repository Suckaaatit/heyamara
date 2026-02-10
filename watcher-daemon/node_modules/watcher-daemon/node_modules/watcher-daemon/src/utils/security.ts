import path from 'path';
import fs from 'fs';
import Logger from '../logger/Logger';

export interface SecurityConfig {
  allowedBasePaths: string[];
  allowSymlinks: boolean;
  maxFileSize: number;
  blockedExtensions: string[];
}

export class SecurityValidator {
  private config: SecurityConfig;

  constructor(config: Partial<SecurityConfig> = {}) {
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
  async validateFilePath(filePath: string): Promise<boolean> {
    try {
      // Resolve to absolute path
      const absolutePath = path.resolve(filePath);

      // Check for path traversal (shouldn't escape allowed base)
      const isWithinAllowed = this.config.allowedBasePaths.some((base) => {
        return this.isPathWithinBase(absolutePath, base);
      });
      if (!isWithinAllowed) {
        Logger.warn('Security: Path outside allowed directories', {
          path: absolutePath,
          allowedBases: this.config.allowedBasePaths,
        });
        return false;
      }

      // Check blocked extensions
      const ext = path.extname(absolutePath).toLowerCase();
      if (this.config.blockedExtensions.includes(ext)) {
        Logger.warn('Security: Blocked file extension', { path: absolutePath, ext });
        return false;
      }

      // Check for symlinks if not allowed
      if (!this.config.allowSymlinks) {
        try {
          const stats = await fs.promises.lstat(absolutePath);
          if (stats.isSymbolicLink()) {
            Logger.warn('Security: Symlink detected and blocked', { path: absolutePath });
            return false;
          }
        } catch (error) {
          const code =
            error && typeof error === 'object' && 'code' in error ? (error as { code?: string }).code : null;
          if (code !== 'ENOENT') {
            throw error;
          }
          // If file is missing (e.g., delete event), allow path validation to proceed.
        }
      }

      // Optional size check (skip if file no longer exists)
      try {
        const stats = await fs.promises.stat(absolutePath);
        if (stats.size > this.config.maxFileSize) {
          Logger.warn('Security: File exceeds max size', {
            path: absolutePath,
            size: stats.size,
            maxSize: this.config.maxFileSize,
          });
          return false;
        }
      } catch (error) {
        const code =
          error && typeof error === 'object' && 'code' in error ? (error as { code?: string }).code : null;
        if (code !== 'ENOENT') {
          throw error;
        }
      }

      return true;
    } catch (error) {
      Logger.warn('Security: Failed to validate path', {
        path: filePath,
        error: error instanceof Error ? error.message : 'Unknown',
      });
      return false;
    }
  }

  /**
   * Validates watch directory is safe to monitor.
   */
  validateWatchDirectory(watchDir: string): boolean {
    const absolutePath = path.resolve(watchDir);
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
        Logger.error('Security: Cannot watch system directory', {
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
            Logger.error('Security: Cannot watch Windows system directory', {
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
      Logger.error('Security: Watch directory outside allowed paths', {
        path: absolutePath,
        allowedBases: this.config.allowedBasePaths,
      });
      return false;
    }

    Logger.info('Security: Watch directory validated', { path: absolutePath });
    return true;
  }

  /**
   * Sanitizes a user-provided path to prevent traversal.
   */
  sanitizePath(inputPath: string): string {
    // Remove null bytes
    let sanitized = inputPath.replace(/\0/g, '');
    // Normalize path
    sanitized = path.normalize(sanitized);
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
  private isPathWithinBase(targetPath: string, basePath: string): boolean {
    const resolvedTarget = path.resolve(targetPath);
    const resolvedBase = path.resolve(basePath);
    const normalizedTarget = process.platform === 'win32' ? resolvedTarget.toLowerCase() : resolvedTarget;
    const normalizedBase = process.platform === 'win32' ? resolvedBase.toLowerCase() : resolvedBase;
    return normalizedTarget === normalizedBase || normalizedTarget.startsWith(`${normalizedBase}${path.sep}`);
  }
}

export const defaultSecurityValidator = new SecurityValidator();

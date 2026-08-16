import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Stable machine-readable error codes. The web app switches on these rather than
 * on message text, so wording can change without breaking the client.
 */
export const ERROR_CODES = {
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  CSRF_FAILED: 'CSRF_FAILED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  EMAIL_TAKEN: 'EMAIL_TAKEN',
  RATE_LIMITED: 'RATE_LIMITED',
  PAYLOAD_TOO_LARGE: 'PAYLOAD_TOO_LARGE',
  UNSUPPORTED_FILE: 'UNSUPPORTED_FILE',
  LAST_OWNER: 'LAST_OWNER',
  INVITATION_INVALID: 'INVITATION_INVALID',
  INTERNAL: 'INTERNAL',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

export interface AppErrorDetail {
  path: string;
  message: string;
}

export class AppException extends HttpException {
  constructor(
    readonly code: ErrorCode,
    message: string,
    status: HttpStatus,
    readonly details?: AppErrorDetail[],
  ) {
    super({ code, message, details }, status);
  }

  static validation(message: string, details?: AppErrorDetail[]): AppException {
    return new AppException(
      ERROR_CODES.VALIDATION_FAILED,
      message,
      HttpStatus.BAD_REQUEST,
      details,
    );
  }

  static unauthenticated(message = 'Authentication required'): AppException {
    return new AppException(ERROR_CODES.UNAUTHENTICATED, message, HttpStatus.UNAUTHORIZED);
  }

  static invalidCredentials(): AppException {
    return new AppException(
      ERROR_CODES.INVALID_CREDENTIALS,
      'Incorrect email or password',
      HttpStatus.UNAUTHORIZED,
    );
  }

  static forbidden(message = 'You do not have permission to do that'): AppException {
    return new AppException(ERROR_CODES.FORBIDDEN, message, HttpStatus.FORBIDDEN);
  }

  /**
   * Used for both "does not exist" and "exists but you are not a member".
   * Collapsing the two is deliberate: it stops attackers probing for the
   * existence of another tenant's resources.
   */
  static notFound(message = 'Not found'): AppException {
    return new AppException(ERROR_CODES.NOT_FOUND, message, HttpStatus.NOT_FOUND);
  }

  static conflict(message: string, code: ErrorCode = ERROR_CODES.CONFLICT): AppException {
    return new AppException(code, message, HttpStatus.CONFLICT);
  }

  static rateLimited(retryAfterMs: number): AppException {
    const seconds = Math.ceil(retryAfterMs / 1000);
    return new AppException(
      ERROR_CODES.RATE_LIMITED,
      `Too many requests. Try again in ${seconds}s.`,
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }

  static unsupportedFile(message: string): AppException {
    return new AppException(
      ERROR_CODES.UNSUPPORTED_FILE,
      message,
      HttpStatus.UNSUPPORTED_MEDIA_TYPE,
    );
  }
}

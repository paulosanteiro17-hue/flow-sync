import {
  Catch,
  HttpException,
  HttpStatus,
  Logger,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Request, Response } from 'express';
import { AppException, ERROR_CODES, type AppErrorDetail, type ErrorCode } from '../errors';

interface ErrorResponseBody {
  statusCode: number;
  code: ErrorCode | string;
  message: string;
  requestId: string;
  details?: AppErrorDetail[];
}

/**
 * Single exit point for every error. Guarantees a stable body shape and that no
 * stack trace, SQL fragment or Prisma internal ever reaches the client.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const requestId = (request as Request & { id?: string }).id ?? 'unknown';

    const body = this.toBody(exception, requestId);

    if (body.statusCode >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        { requestId, path: request.url, method: request.method, err: exception },
        'Unhandled exception',
      );
    } else if (body.statusCode === HttpStatus.TOO_MANY_REQUESTS || body.statusCode === 403) {
      this.logger.warn({ requestId, path: request.url, code: body.code }, body.message);
    }

    response.status(body.statusCode).json(body);
  }

  private toBody(exception: unknown, requestId: string): ErrorResponseBody {
    if (exception instanceof AppException) {
      const payload = exception.getResponse() as {
        code: ErrorCode;
        message: string;
        details?: AppErrorDetail[];
      };
      return {
        statusCode: exception.getStatus(),
        code: payload.code,
        message: payload.message,
        requestId,
        ...(payload.details ? { details: payload.details } : {}),
      };
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const raw = exception.getResponse();
      const message =
        typeof raw === 'string'
          ? raw
          : ((raw as { message?: string | string[] }).message ?? exception.message);
      return {
        statusCode: status,
        code: this.codeForStatus(status),
        message: Array.isArray(message) ? message.join(', ') : message,
        requestId,
      };
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      return this.fromPrisma(exception, requestId);
    }

    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      code: ERROR_CODES.INTERNAL,
      message: 'Something went wrong on our side. Please try again.',
      requestId,
    };
  }

  private fromPrisma(
    exception: Prisma.PrismaClientKnownRequestError,
    requestId: string,
  ): ErrorResponseBody {
    switch (exception.code) {
      case 'P2002':
        return {
          statusCode: HttpStatus.CONFLICT,
          code: ERROR_CODES.CONFLICT,
          message: 'That value is already taken.',
          requestId,
        };
      case 'P2025':
        return {
          statusCode: HttpStatus.NOT_FOUND,
          code: ERROR_CODES.NOT_FOUND,
          message: 'Not found',
          requestId,
        };
      case 'P2003':
        return {
          statusCode: HttpStatus.BAD_REQUEST,
          code: ERROR_CODES.VALIDATION_FAILED,
          message: 'A referenced record does not exist.',
          requestId,
        };
      default:
        // The Prisma error code itself is safe to log but not to expose.
        this.logger.error({ requestId, prismaCode: exception.code }, 'Prisma error');
        return {
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          code: ERROR_CODES.INTERNAL,
          message: 'Something went wrong on our side. Please try again.',
          requestId,
        };
    }
  }

  private codeForStatus(status: number): ErrorCode {
    switch (status) {
      case HttpStatus.BAD_REQUEST:
        return ERROR_CODES.VALIDATION_FAILED;
      case HttpStatus.UNAUTHORIZED:
        return ERROR_CODES.UNAUTHENTICATED;
      case HttpStatus.FORBIDDEN:
        return ERROR_CODES.FORBIDDEN;
      case HttpStatus.NOT_FOUND:
        return ERROR_CODES.NOT_FOUND;
      case HttpStatus.CONFLICT:
        return ERROR_CODES.CONFLICT;
      case HttpStatus.TOO_MANY_REQUESTS:
        return ERROR_CODES.RATE_LIMITED;
      case HttpStatus.PAYLOAD_TOO_LARGE:
        return ERROR_CODES.PAYLOAD_TOO_LARGE;
      case HttpStatus.UNSUPPORTED_MEDIA_TYPE:
        return ERROR_CODES.UNSUPPORTED_FILE;
      default:
        return ERROR_CODES.INTERNAL;
    }
  }
}

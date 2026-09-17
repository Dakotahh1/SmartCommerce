import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import type { Response } from 'express';
import type { AuthenticatedRequest } from '../auth.decorators.js';

const DEFAULT_CODES: Record<number, string> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  405: 'METHOD_NOT_ALLOWED',
  409: 'CONFLICT',
  413: 'PAYLOAD_TOO_LARGE',
  422: 'UNPROCESSABLE_ENTITY',
  429: 'TOO_MANY_REQUESTS',
  502: 'BAD_GATEWAY',
  503: 'SERVICE_UNAVAILABLE',
};

export interface ErrorResponseBody {
  statusCode: number;
  code: string;
  message: string;
  details: unknown[];
  path: string;
  timestamp: string;
  requestId: string | null;
}

/**
 * Formato de error único para toda la API. Nunca expone trazas, consultas SQL ni
 * mensajes internos: los errores no controlados se registran y se responden como 500 genérico.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<AuthenticatedRequest>();
    const response = http.getResponse<Response>();
    const body = this.toBody(exception, request);

    if (body.statusCode >= 500) {
      this.logger.error(
        { err: exception, requestId: body.requestId, path: body.path },
        'Error no controlado',
      );
    }
    response.status(body.statusCode).json(body);
  }

  toBody(exception: unknown, request: AuthenticatedRequest): ErrorResponseBody {
    let statusCode: number = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 'INTERNAL_ERROR';
    let message = 'Error interno del servidor';
    let details: unknown[] = [];

    if (exception instanceof ThrottlerException) {
      statusCode = HttpStatus.TOO_MANY_REQUESTS;
      code = 'TOO_MANY_REQUESTS';
      message = 'Demasiadas solicitudes, intenta nuevamente en unos segundos';
    } else if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      code = DEFAULT_CODES[statusCode] ?? 'HTTP_ERROR';
      const payload = exception.getResponse();
      if (typeof payload === 'string') {
        message = payload;
      } else if (payload && typeof payload === 'object') {
        const data = payload as {
          code?: unknown;
          message?: unknown;
          details?: unknown;
        };
        if (typeof data.code === 'string') code = data.code;
        if (typeof data.message === 'string') message = data.message;
        if (Array.isArray(data.message)) {
          message = 'Datos inválidos';
          details = data.message;
        }
        if (Array.isArray(data.details)) details = data.details;
      }
      if (
        statusCode >= 500 &&
        !(payload && typeof payload === 'object' && 'code' in payload)
      ) {
        message = 'Error interno del servidor';
      }
    }

    return {
      statusCode,
      code,
      message,
      details,
      path: request.originalUrl?.split('?')[0] ?? request.url,
      timestamp: new Date().toISOString(),
      requestId: request.id ? String(request.id) : null,
    };
  }
}

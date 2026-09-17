import { HttpException, HttpStatus } from '@nestjs/common';

export interface ErrorDetail {
  field?: string;
  message: string;
}

/** Error de negocio con código estable que el frontend puede interpretar. */
export class AppException extends HttpException {
  constructor(
    status: HttpStatus,
    public readonly code: string,
    message: string,
    public readonly details: ErrorDetail[] = [],
  ) {
    super({ code, message, details }, status);
  }
}

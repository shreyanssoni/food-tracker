import { type ClassValue } from 'clsx';
import clsx from 'clsx';

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

export class ApiError extends Error {
  status: number;
  details?: unknown;

  constructor(message: string, status: number = 500, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
    
    // Set the prototype explicitly to ensure instanceof works correctly
    Object.setPrototypeOf(this, ApiError.prototype);
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      status: this.status,
      ...(this.details !== undefined ? { details: this.details } : {})
    };
  }
}

export function handleApiError(error: unknown): { status: number; message: string; details?: unknown } {
  console.error('API Error:', error);
  
  if (error instanceof ApiError) {
    return {
      status: error.status,
      message: error.message,
      ...(error.details !== undefined ? { details: error.details } : {})
    };
  }

  if (error instanceof Error) {
    return {
      status: 500,
      message: error.message || 'An unexpected error occurred',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    };
  }

  return {
    status: 500,
    message: 'An unknown error occurred',
    details: error
  };
}

export function assert(condition: unknown, message: string, status: number = 400): asserts condition {
  if (!condition) {
    throw new ApiError(message, status);
  }
}

export function assertAuth(session: any): asserts session is { user: { id: string } } {
  if (!session?.user?.id) {
    throw new ApiError('Unauthorized', 401);
  }
}

export function validateWithZod<T>(schema: { parse: (data: unknown) => T }, data: unknown): T {
  try {
    return schema.parse(data);
  } catch (error) {
    throw new ApiError('Validation failed', 400, error);
  }
}

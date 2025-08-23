import { NextResponse } from 'next/server';
import { handleApiError } from './error';

type ApiResponseSuccess<T> = {
  success: true;
  data: T;
};

type ApiResponseError = {
  success: false;
  error: {
    message: string;
    details?: unknown;
  };
};

export type ApiResponse<T> = ApiResponseSuccess<T> | ApiResponseError;

export function createSuccessResponse<T>(data: T): ApiResponseSuccess<T> {
  return {
    success: true,
    data,
  };
}

export function createErrorResponse(error: unknown): ApiResponseError {
  const { message, details } = handleApiError(error);
  return {
    success: false,
    error: {
      message,
      ...(details !== undefined ? { details } : {}),
    },
  };
}

export function apiHandler<T>(handler: () => Promise<T> | T) {
  return async (): Promise<NextResponse<ApiResponse<T>>> => {
    try {
      const data = await handler();
      return NextResponse.json(createSuccessResponse(data));
    } catch (error) {
      const errorResponse = createErrorResponse(error);
      return NextResponse.json(errorResponse, {
        status: error instanceof Error && 'status' in error ? (error as any).status : 500,
      });
    }
  };
}

export function withAuth<T>(
  handler: (req: Request, userId: string) => Promise<T>,
  options?: { requireAuth?: boolean }
) {
  return async (req: Request): Promise<NextResponse<ApiResponse<T>>> => {
    const { requireAuth = true } = options || {};
    
    // In a real implementation, you would get the session here
    // For now, we'll use a placeholder
    const session = { user: { id: 'user-123' } }; // Replace with actual session check
    
    if (requireAuth && !session?.user?.id) {
      return NextResponse.json(
        createErrorResponse(new Error('Unauthorized')),
        { status: 401 }
      );
    }

    try {
      const data = await handler(req, session?.user?.id || '');
      return NextResponse.json(createSuccessResponse(data));
    } catch (error) {
      const errorResponse = createErrorResponse(error);
      return NextResponse.json(errorResponse, {
        status: error instanceof Error && 'status' in error ? (error as any).status : 500,
      });
    }
  };
}

export async function safeJsonParse<T>(response: Response): Promise<T | null> {
  const text = await response.text();
  try {
    return text ? (JSON.parse(text) as T) : null;
  } catch (error) {
    console.error('Failed to parse JSON response:', { text, error });
    throw new Error('Failed to parse server response');
  }
}

export async function fetchApi<T>(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<T | null> {
  const response = await fetch(input, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  });

  if (!response.ok) {
    const errorData = await safeJsonParse<{ error?: string; message?: string }>(
      response.clone()
    );
    const errorMessage =
      errorData?.error || errorData?.message || response.statusText;
    throw new Error(errorMessage);
  }

  return safeJsonParse<T>(response);
}

import { NextResponse } from "next/server";
import { z } from "zod";

type ApiErrorCode =
  | "BAD_REQUEST"
  | "FORBIDDEN"
  | "INTERNAL_ERROR"
  | "NOT_FOUND"
  | "UNAUTHORIZED"
  | "VALIDATION_ERROR";

export function apiError(
  code: ApiErrorCode,
  message: string,
  status: number,
  details?: unknown
) {
  return NextResponse.json(
    {
      error: {
        code,
        message,
        ...(details === undefined ? {} : { details }),
      },
    },
    { status }
  );
}

export function unauthorized(message = "Unauthorized") {
  return apiError("UNAUTHORIZED", message, 401);
}

export function badRequest(message = "Bad request", details?: unknown) {
  return apiError("BAD_REQUEST", message, 400, details);
}

export function notFound(message = "Not found") {
  return apiError("NOT_FOUND", message, 404);
}

export function validationError(error: z.ZodError) {
  return apiError("VALIDATION_ERROR", "Invalid request", 400, z.treeifyError(error));
}

export function internalError(scope: string, error: unknown) {
  console.error(`[${scope}] Unexpected error`, { error });
  return apiError("INTERNAL_ERROR", "Something went wrong. Please try again.", 500);
}

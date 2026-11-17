export interface ValidationDetail {
  field: string;
  rule: string;
  context?: Record<string, any>;
}

export interface AppErrorResponse {
  success: boolean;
  code: string;
  message?: string;
  errors?: ValidationDetail[];
  meta?: Record<string, any>;
}

export function isAppErrorResponse(value: unknown): value is AppErrorResponse {
  if (typeof value !== 'object' || value === null) return false;

  const obj = value as Record<string, unknown>;

  return typeof obj['success'] === 'boolean' && typeof obj['code'] === 'string';
}

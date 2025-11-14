/**
 * Custom Error Classes
 * 
 * Standardized error types for better error handling and debugging.
 */

/**
 * Base error class for application errors
 */
export class AppError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 500,
    public cause?: Error
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Error for validation failures
 */
export class ValidationError extends AppError {
  constructor(message: string, public field: string) {
    super(message, 'VALIDATION_ERROR', 400);
  }
}

/**
 * Error for external API failures
 */
export class ApiError extends AppError {
  constructor(
    message: string,
    public url: string,
    public statusCode: number,
    cause?: Error
  ) {
    super(message, 'API_ERROR', statusCode, cause);
  }
}

/**
 * Error for database operations
 */
export class DatabaseError extends AppError {
  constructor(message: string, public operation: string, cause?: Error) {
    super(message, 'DATABASE_ERROR', 500, cause);
  }
}

/**
 * Error for cache/Redis operations
 */
export class CacheError extends AppError {
  constructor(message: string, public operation: string, cause?: Error) {
    super(message, 'CACHE_ERROR', 500, cause);
  }
}

/**
 * Error for Kafka operations
 */
export class KafkaError extends AppError {
  constructor(message: string, public operation: string, cause?: Error) {
    super(message, 'KAFKA_ERROR', 500, cause);
  }
}


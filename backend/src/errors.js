"use strict";

class AppError extends Error {
  constructor(message, statusCode = 400, code = "bad_request", details = null) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

class AuthenticationError extends AppError {
  constructor(message = "Требуется вход") {
    super(message, 401, "authentication_required");
  }
}

class AuthorizationError extends AppError {
  constructor(message = "Недостаточно прав") {
    super(message, 403, "forbidden");
  }
}

class ConflictError extends AppError {
  constructor(message, details = null) {
    super(message, 409, "conflict", details);
  }
}

class LockedError extends AppError {
  constructor(message, details = null) {
    super(message, 423, "locked", details);
  }
}

module.exports = { AppError, AuthenticationError, AuthorizationError, ConflictError, LockedError };

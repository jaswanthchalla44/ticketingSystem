"""Errors that become HTTP responses. Raise these; api_handler turns them into JSON."""


class ApiError(Exception):
    status = 500
    code = "internal_error"

    def __init__(self, message, details=None):
        super().__init__(message)
        self.message = message
        self.details = details


class BadRequest(ApiError):
    status = 400
    code = "bad_request"


class Unauthorized(ApiError):
    status = 401
    code = "unauthorized"


class Forbidden(ApiError):
    status = 403
    code = "forbidden"


class NotFound(ApiError):
    status = 404
    code = "not_found"


class MethodNotAllowed(ApiError):
    status = 405
    code = "method_not_allowed"


class Conflict(ApiError):
    status = 409
    code = "conflict"


class TooManyRequests(ApiError):
    status = 429
    code = "too_many_requests"


class ValidationFailed(ApiError):
    status = 422
    code = "validation_error"

    def __init__(self, details):
        super().__init__("request is invalid", details=details)


class UpstreamError(ApiError):
    status = 502
    code = "upstream_error"


class ConfigError(RuntimeError):
    """The environment does not match the contract. Not a client error, so it is never shown as 4xx."""

"""Transport-agnostic exceptions for the OpenF1 fetch services.

The OpenF1 fetch logic lives in the router modules and raises ``fastapi.HTTPException``
so the web endpoints keep their exact status codes. The scheduler, however, must not
depend on FastAPI semantics. ``app.services.openf1_fetch`` translates the HTTP errors
into the domain exceptions below at its boundary, and the scheduler branches on them:

  retryable  -> OpenF1NoMatch, OpenF1NotReady, OpenF1Upstream
  terminal   -> OpenF1Ambiguous, OpenF1NotFound, OpenF1BadInput

Each exception carries the original ``http_status`` so callers that still speak HTTP can
faithfully reconstruct the response.
"""

from __future__ import annotations


class OpenF1FetchError(Exception):
    """Base class for all OpenF1 fetch failures."""

    http_status = 502

    def __init__(self, detail: str = "OpenF1 fetch failed") -> None:
        super().__init__(detail)
        self.detail = detail


class OpenF1NotFound(OpenF1FetchError):
    """A required local record (session/event/circuit) was not found."""

    http_status = 404


class OpenF1BadInput(OpenF1FetchError):
    """The local record is missing data required to fetch (e.g. start time)."""

    http_status = 400


class OpenF1NoMatch(OpenF1FetchError):
    """No OpenF1 meeting/session could be matched (often: not published yet)."""

    http_status = 422


class OpenF1NotReady(OpenF1FetchError):
    """OpenF1 matched but returned no data yet (e.g. results not published)."""

    http_status = 422


class OpenF1Ambiguous(OpenF1FetchError):
    """The match was ambiguous and needs human disambiguation."""

    http_status = 409


class OpenF1Upstream(OpenF1FetchError):
    """OpenF1 request failed (network/HTTP/unexpected payload)."""

    http_status = 502


# Status codes the web routes use, mapped to the domain exception the scheduler sees.
HTTP_STATUS_TO_EXCEPTION: dict[int, type[OpenF1FetchError]] = {
    404: OpenF1NotFound,
    400: OpenF1BadInput,
    422: OpenF1NoMatch,
    409: OpenF1Ambiguous,
    502: OpenF1Upstream,
}

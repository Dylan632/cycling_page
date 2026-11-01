"""Reliable HTTP and record collection seams for the Keep importer."""

from __future__ import annotations

import time
from collections.abc import Callable, Iterable
from concurrent.futures import ThreadPoolExecutor
from typing import Any, TypeVar

KEEP_REQUEST_TIMEOUT = (5.0, 30.0)
KEEP_REQUEST_ATTEMPTS = 3
RETRYABLE_STATUS_CODES = frozenset({408, 429, 500, 502, 503, 504})

# Keep answers one record per request, so a full history sync is dominated by
# round-trip latency rather than CPU. A handful of parallel readers keeps the
# daily publication inside its schedule without hammering the API; parsing stays
# on the caller's thread and starts as each answer arrives, so the decode of one
# record overlaps the requests still in flight for the rest of the batch.
KEEP_RECORD_WORKERS = 8


class KeepRequestError(RuntimeError):
    """Raised when a Keep request cannot produce a valid JSON response."""


class KeepRecordError(RuntimeError):
    """Raised when one record would make a Keep import partial."""

    def __init__(self, record_id: str, error: Exception):
        self.record_id = record_id
        super().__init__(f"Keep record {record_id} could not be parsed: {error}")


RawRecord = TypeVar("RawRecord")
ParsedRecord = TypeVar("ParsedRecord")


def collect_keep_records(
    record_ids: Iterable[str],
    load_record: Callable[[str], RawRecord],
    parse_record: Callable[[RawRecord], ParsedRecord | None],
    *,
    max_workers: int = 1,
) -> list[ParsedRecord]:
    """Load a complete Keep batch, failing instead of returning partial data.

    Records are fetched concurrently when ``max_workers`` exceeds one, but they
    are always parsed and returned in the caller's order so the published
    snapshot stays byte-identical to a sequential run. Parsing a record starts
    as soon as it arrives, so CPU work overlaps the requests still in flight.
    The first record that fails (in that same order) aborts the whole batch.
    """
    ids = list(record_ids)

    if max_workers > 1 and len(ids) > 1:
        with ThreadPoolExecutor(max_workers=min(max_workers, len(ids))) as pool:
            pending = [pool.submit(load_record, record_id) for record_id in ids]
            parsed_records: list[ParsedRecord | None] = []
            failures: list[tuple[str, Exception]] = []
            for record_id, future in zip(ids, pending):
                try:
                    raw = future.result()
                    parsed = parse_record(raw)
                    if parsed is None:
                        raise ValueError("parser returned no activity")
                except Exception as error:  # noqa: BLE001 - re-raised with context
                    failures.append((record_id, error))
                    parsed_records.append(None)
                    continue
                parsed_records.append(parsed)
        if failures:
            failed_id, error = failures[0]
            raise KeepRecordError(failed_id, error) from error
        return [record for record in parsed_records if record is not None]

    records: list[ParsedRecord] = []
    for record_id in ids:
        try:
            raw = load_record(record_id)
        except Exception as error:  # noqa: BLE001 - re-raised with context
            raise KeepRecordError(record_id, error) from error
        try:
            parsed = parse_record(raw)
            if parsed is None:
                raise ValueError("parser returned no activity")
        except Exception as error:
            raise KeepRecordError(record_id, error) from error
        records.append(parsed)
    return records


def request_json(
    session: Any,
    method: str,
    url: str,
    *,
    headers: dict[str, str] | None = None,
    data: dict[str, str] | None = None,
    timeout: tuple[float, float] = KEEP_REQUEST_TIMEOUT,
    max_attempts: int = KEEP_REQUEST_ATTEMPTS,
    sleep: Callable[[float], None] = time.sleep,
) -> dict[str, Any]:
    """Return one Keep JSON response with bounded retries and explicit timeouts."""
    if max_attempts < 1:
        raise ValueError("max_attempts must be at least one")

    last_error: Exception | None = None
    for attempt in range(1, max_attempts + 1):
        response = None
        try:
            response = session.request(
                method,
                url,
                headers=headers,
                data=data,
                timeout=timeout,
            )
            response.raise_for_status()
            payload = response.json()
            if not isinstance(payload, dict):
                raise ValueError("Keep returned a non-object JSON response")
            return payload
        except Exception as error:
            last_error = error
            status_code = getattr(response, "status_code", None)
            retryable = response is None or status_code in RETRYABLE_STATUS_CODES
            if not retryable or attempt == max_attempts:
                break
            sleep(float(2 ** (attempt - 1)))

    raise KeepRequestError(
        f"Keep {method.upper()} {url} failed after {max_attempts} attempts"
    ) from last_error

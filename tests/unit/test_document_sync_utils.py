from datetime import datetime, timezone

from paperless_dedupe.worker.tasks.document_sync import parse_date_field


def test_parse_date_field_none_returns_none():
    assert parse_date_field(None) is None


def test_parse_date_field_preserves_timezone_for_aware_datetime():
    aware = datetime(2024, 1, 1, 8, 30, tzinfo=timezone.utc)
    result = parse_date_field(aware)
    assert result is aware


def test_parse_date_field_adds_timezone_for_naive_datetime():
    naive = datetime(2024, 1, 1, 8, 30)
    result = parse_date_field(naive)
    assert result.tzinfo == timezone.utc
    assert result.hour == naive.hour
    assert result.minute == naive.minute


def test_parse_date_field_parses_string_and_normalizes_to_utc():
    iso_string = "2024-01-01T12:15:00"
    result = parse_date_field(iso_string)
    assert result is not None
    assert result.tzinfo == timezone.utc
    assert result.year == 2024
    assert result.month == 1
    assert result.day == 1
    assert result.hour == 12
    assert result.minute == 15


def test_parse_date_field_invalid_string_returns_none():
    assert parse_date_field("not-a-date") is None

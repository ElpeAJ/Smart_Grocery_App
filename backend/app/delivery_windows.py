from datetime import datetime, timedelta
from typing import TypedDict


PUBLIC_OPEN_HOUR = 8
PUBLIC_CLOSE_HOUR = 20
OPERATIONS_CLOSE_HOUR = 22
SLOT_HOURS = 2
MIN_PREP_MINUTES = 60


class DeliveryWindow(TypedDict):
    key: str
    label: str
    starts_at: str
    ends_at: str


def _to_window_key(start: datetime, end: datetime) -> str:
    return f"{start.isoformat()}|{end.isoformat()}"


def _format_window_label(now: datetime, start: datetime, end: datetime) -> str:
    day_label = "Today" if start.date() == now.date() else "Tomorrow"
    return f"{day_label}, {start.strftime('%-I:%M %p')} - {end.strftime('%-I:%M %p')}"


def get_available_delivery_windows(now: datetime | None = None) -> list[DeliveryWindow]:
    now = now or datetime.now()
    earliest_ready = now + timedelta(minutes=MIN_PREP_MINUTES)
    windows: list[DeliveryWindow] = []

    for day_offset in range(0, 2):
        current_date = (now + timedelta(days=day_offset)).date()
        slot_start = datetime.combine(current_date, datetime.min.time()).replace(hour=PUBLIC_OPEN_HOUR)
        last_slot_start = datetime.combine(current_date, datetime.min.time()).replace(
            hour=OPERATIONS_CLOSE_HOUR - SLOT_HOURS
        )

        while slot_start <= last_slot_start:
            slot_end = slot_start + timedelta(hours=SLOT_HOURS)

            if day_offset == 0 and slot_start < earliest_ready:
                slot_start += timedelta(hours=SLOT_HOURS)
                continue

            windows.append(
                {
                    "key": _to_window_key(slot_start, slot_end),
                    "label": _format_window_label(now, slot_start, slot_end),
                    "starts_at": slot_start.isoformat(),
                    "ends_at": slot_end.isoformat(),
                }
            )
            slot_start += timedelta(hours=SLOT_HOURS)

    return windows


def resolve_delivery_window(window_key: str, now: datetime | None = None) -> DeliveryWindow:
    available_windows = get_available_delivery_windows(now=now)
    for window in available_windows:
        if window["key"] == window_key:
            return window

    raise ValueError("Selected delivery window is no longer available")

from collections import defaultdict
from datetime import date, datetime, time, timedelta
from statistics import mean
from typing import Literal, Optional

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from ..dependencies import require_roles

router = APIRouter(prefix="/reports", tags=["Reports"])

ReportPeriod = Literal["day", "week", "month", "quarter", "half_year", "year"]


def get_period_bounds(period: ReportPeriod, anchor_date: Optional[date] = None) -> tuple[datetime, datetime]:
    target_date = anchor_date or datetime.utcnow().date()

    if period == "day":
        start_date = target_date
        end_date = target_date
    elif period == "week":
        start_date = target_date - timedelta(days=target_date.weekday())
        end_date = start_date + timedelta(days=6)
    elif period == "month":
        start_date = target_date.replace(day=1)
        if start_date.month == 12:
            end_date = date(start_date.year + 1, 1, 1) - timedelta(days=1)
        else:
            end_date = date(start_date.year, start_date.month + 1, 1) - timedelta(days=1)
    elif period == "quarter":
        quarter_start_month = ((target_date.month - 1) // 3) * 3 + 1
        start_date = date(target_date.year, quarter_start_month, 1)
        if quarter_start_month == 10:
            end_date = date(target_date.year + 1, 1, 1) - timedelta(days=1)
        else:
            end_date = date(target_date.year, quarter_start_month + 3, 1) - timedelta(days=1)
    elif period == "half_year":
        half_start_month = 1 if target_date.month <= 6 else 7
        start_date = date(target_date.year, half_start_month, 1)
        if half_start_month == 1:
            end_date = date(target_date.year, 7, 1) - timedelta(days=1)
        else:
            end_date = date(target_date.year + 1, 1, 1) - timedelta(days=1)
    else:
        start_date = date(target_date.year, 1, 1)
        end_date = date(target_date.year, 12, 31)

    start = datetime.combine(start_date, time.min)
    end = datetime.combine(end_date + timedelta(days=1), time.min)
    return start, end


def round_metric(value: Optional[float]) -> float:
    if value is None:
        return 0.0
    return round(value, 1)


def get_duration_minutes(start: Optional[datetime], end: Optional[datetime]) -> Optional[float]:
    if not start or not end:
        return None
    seconds = max((end - start).total_seconds(), 0)
    return round(max(seconds / 60, 1), 1)


def build_pick_stats_for_order(order: models.Order, picker_user_id: Optional[int] = None) -> tuple[Optional[float], int]:
    relevant_records = []
    items_count = 0

    for item in order.items:
        pick_record = item.pick_record
        if not pick_record or not pick_record.picked_at:
            continue
        if picker_user_id is not None and pick_record.picker_user_id != picker_user_id:
            continue
        relevant_records.append(pick_record.picked_at)
        items_count += item.quantity

    if not relevant_records or items_count == 0:
        return None, 0

    return get_duration_minutes(min(relevant_records), max(relevant_records)), items_count


def build_delivery_stats_for_order(order: models.Order) -> tuple[Optional[float], Optional[float]]:
    delivery = order.delivery
    if not delivery:
        return None, None

    delivery_minutes = get_duration_minutes(delivery.started_at, delivery.delivered_at)
    assignment_to_delivery_minutes = get_duration_minutes(delivery.driver_assigned_at, delivery.delivered_at)
    return delivery_minutes, assignment_to_delivery_minutes


def build_report_entry(
    order: models.Order,
    completion_record: Optional[models.OrderCompletionRecord] = None,
    picker_user_id: Optional[int] = None,
    completed_at_override: Optional[datetime] = None,
) -> schemas.ReportEntry:
    total_amount = sum(item.quantity * item.unit_price for item in order.items)
    delivery_id = order.delivery.id if order.delivery else None
    driver_name = completion_record.driver.full_name if completion_record and completion_record.driver else None
    customer_name = order.user.full_name if order.user else None
    store_name = order.store.name if order.store else None
    pick_minutes, items_count = build_pick_stats_for_order(order, picker_user_id)
    delivery_minutes, assignment_to_delivery_minutes = build_delivery_stats_for_order(order)
    completed_at = completed_at_override or (completion_record.completed_at if completion_record else None)

    if completed_at is None:
        relevant_pick_times = [
            item.pick_record.picked_at
            for item in order.items
            if item.pick_record
            and item.pick_record.picked_at
            and (picker_user_id is None or item.pick_record.picker_user_id == picker_user_id)
        ]
        completed_at = max(relevant_pick_times) if relevant_pick_times else order.created_at

    return schemas.ReportEntry(
        order_id=order.id,
        customer_id=order.user_id,
        customer_name=customer_name,
        store_id=order.store_id,
        store_name=store_name,
        order_status=order.status,
        total_amount=total_amount,
        completed_at=completed_at,
        delivery_id=delivery_id,
        driver_id=completion_record.driver_user_id if completion_record else None,
        driver_name=driver_name,
        items_count=items_count,
        pick_minutes=pick_minutes,
        delivery_minutes=delivery_minutes,
        assignment_to_delivery_minutes=assignment_to_delivery_minutes,
        review=order.review,
    )


def get_staff_completed_picking_orders(
    db: Session,
    period_start: datetime,
    picker_user_id: int,
) -> list[models.Order]:
    pick_records = (
        db.query(models.OrderItemPickRecord)
        .filter(
            models.OrderItemPickRecord.picker_user_id == picker_user_id,
            models.OrderItemPickRecord.picked_at >= period_start,
        )
        .all()
    )

    candidate_order_ids = {
        pick_record.order_item.order_id
        for pick_record in pick_records
        if pick_record.order_item is not None
    }

    if not candidate_order_ids:
        return []

    return (
        db.query(models.Order)
        .filter(
            models.Order.id.in_(candidate_order_ids),
            models.Order.status.in_(("awaiting_review", "out_for_delivery", "delivered")),
        )
        .all()
    )


def build_picker_summary(entries: list[schemas.ReportEntry]) -> schemas.PickerPerformanceSummary:
    pick_entries = [entry for entry in entries if entry.pick_minutes is not None and entry.items_count > 0]
    pick_minutes = [entry.pick_minutes for entry in pick_entries if entry.pick_minutes is not None]
    total_items = sum(entry.items_count for entry in pick_entries)
    total_hours = sum((entry.pick_minutes or 0) / 60 for entry in pick_entries)
    average_items_per_hour = total_items / total_hours if total_hours > 0 else 0.0

    return schemas.PickerPerformanceSummary(
        total_orders_picked=len(pick_entries),
        total_items_picked=total_items,
        average_pick_minutes=round_metric(mean(pick_minutes) if pick_minutes else 0.0),
        average_items_per_hour=round_metric(average_items_per_hour),
        fastest_pick_minutes=round_metric(min(pick_minutes)) if pick_minutes else None,
        slowest_pick_minutes=round_metric(max(pick_minutes)) if pick_minutes else None,
    )


def build_driver_summary(entries: list[schemas.ReportEntry]) -> schemas.DriverPerformanceSummary:
    delivery_minutes = [entry.delivery_minutes for entry in entries if entry.delivery_minutes is not None]
    assignment_minutes = [
        entry.assignment_to_delivery_minutes
        for entry in entries
        if entry.assignment_to_delivery_minutes is not None
    ]

    return schemas.DriverPerformanceSummary(
        completed_deliveries=len(entries),
        average_delivery_minutes=round_metric(mean(delivery_minutes) if delivery_minutes else 0.0),
        average_assignment_to_delivery_minutes=round_metric(mean(assignment_minutes) if assignment_minutes else 0.0),
        fastest_delivery_minutes=round_metric(min(delivery_minutes)) if delivery_minutes else None,
        slowest_delivery_minutes=round_metric(max(delivery_minutes)) if delivery_minutes else None,
    )


def build_store_summaries(entries: list[schemas.ReportEntry]) -> list[schemas.StorePerformanceSummary]:
    grouped_entries: dict[tuple[Optional[int], str], list[schemas.ReportEntry]] = defaultdict(list)
    for entry in entries:
        grouped_entries[(entry.store_id, entry.store_name or "Unassigned")].append(entry)

    summaries: list[schemas.StorePerformanceSummary] = []
    for (store_id, store_name), grouped in grouped_entries.items():
        pick_minutes = [entry.pick_minutes for entry in grouped if entry.pick_minutes is not None]
        delivery_minutes = [entry.delivery_minutes for entry in grouped if entry.delivery_minutes is not None]
        summaries.append(
            schemas.StorePerformanceSummary(
                store_id=store_id,
                store_name=store_name,
                completed_orders=len(grouped),
                total_revenue=round(sum(entry.total_amount for entry in grouped), 2),
                average_pick_minutes=round_metric(mean(pick_minutes) if pick_minutes else 0.0),
                average_delivery_minutes=round_metric(mean(delivery_minutes) if delivery_minutes else 0.0),
            )
        )

    return sorted(summaries, key=lambda summary: summary.completed_orders, reverse=True)


def build_picker_leaderboard(
    db: Session,
    period_start: datetime,
    completion_records: list[models.OrderCompletionRecord],
) -> list[schemas.PickerLeaderboardEntry]:
    picker_groups: dict[int, list[schemas.ReportEntry]] = defaultdict(list)
    picker_names: dict[int, str] = {}

    pick_records = (
        db.query(models.OrderItemPickRecord)
        .filter(
            models.OrderItemPickRecord.picked_at >= period_start,
            models.OrderItemPickRecord.picker_user_id.isnot(None),
        )
        .all()
    )

    picker_order_pairs = {
        (record.picker_user_id, record.order_item.order_id)
        for record in pick_records
        if record.order_item is not None
    }

    for picker_user_id, order_id in picker_order_pairs:
        order = db.query(models.Order).filter(models.Order.id == order_id).first()
        completion_record = next((record for record in completion_records if record.order_id == order_id), None)
        if order is None or order.status not in {"awaiting_review", "out_for_delivery", "delivered"}:
            continue
        completed_at_override = max(
            (
                item.pick_record.picked_at
                for item in order.items
                if item.pick_record
                and item.pick_record.picker_user_id == picker_user_id
                and item.pick_record.picked_at
            ),
            default=order.created_at,
        )
        entry = build_report_entry(
            order,
            completion_record,
            picker_user_id=picker_user_id,
            completed_at_override=completed_at_override,
        )
        if entry.items_count == 0 or entry.pick_minutes is None:
            continue
        picker_groups[picker_user_id].append(entry)
        picker_names[picker_user_id] = next(
            (
                item.pick_record.picker.full_name
                for item in order.items
                if item.pick_record and item.pick_record.picker_user_id == picker_user_id and item.pick_record.picker
            ),
            f"Staff #{picker_user_id}",
        )

    leaderboard: list[schemas.PickerLeaderboardEntry] = []
    for picker_user_id, entries in picker_groups.items():
        minutes = [entry.pick_minutes for entry in entries if entry.pick_minutes is not None]
        total_items = sum(entry.items_count for entry in entries)
        total_hours = sum((entry.pick_minutes or 0) / 60 for entry in entries)
        leaderboard.append(
            schemas.PickerLeaderboardEntry(
                user_id=picker_user_id,
                full_name=picker_names.get(picker_user_id, f"Staff #{picker_user_id}"),
                completed_orders=len(entries),
                total_items_picked=total_items,
                average_pick_minutes=round_metric(mean(minutes) if minutes else 0.0),
                average_items_per_hour=round_metric(total_items / total_hours if total_hours > 0 else 0.0),
            )
        )

    return sorted(leaderboard, key=lambda entry: entry.completed_orders, reverse=True)


def build_driver_leaderboard(entries: list[schemas.ReportEntry]) -> list[schemas.DriverLeaderboardEntry]:
    groups: dict[int, list[schemas.ReportEntry]] = defaultdict(list)
    names: dict[int, str] = {}

    for entry in entries:
        if entry.driver_id is None:
            continue
        groups[entry.driver_id].append(entry)
        names[entry.driver_id] = entry.driver_name or f"Driver #{entry.driver_id}"

    leaderboard: list[schemas.DriverLeaderboardEntry] = []
    for driver_id, grouped in groups.items():
        delivery_minutes = [entry.delivery_minutes for entry in grouped if entry.delivery_minutes is not None]
        assignment_minutes = [
            entry.assignment_to_delivery_minutes
            for entry in grouped
            if entry.assignment_to_delivery_minutes is not None
        ]
        leaderboard.append(
            schemas.DriverLeaderboardEntry(
                user_id=driver_id,
                full_name=names.get(driver_id, f"Driver #{driver_id}"),
                completed_deliveries=len(grouped),
                average_delivery_minutes=round_metric(mean(delivery_minutes) if delivery_minutes else 0.0),
                average_assignment_to_delivery_minutes=round_metric(
                    mean(assignment_minutes) if assignment_minutes else 0.0
                ),
            )
        )

    return sorted(leaderboard, key=lambda entry: entry.completed_deliveries, reverse=True)


@router.get("/summary", response_model=schemas.ReportSummaryResponse)
def get_report_summary(
    period: ReportPeriod = "week",
    anchor_date: Optional[date] = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_roles("admin", "manager", "staff", "driver")),
):
    period_start, period_end = get_period_bounds(period, anchor_date)
    completion_query = db.query(models.OrderCompletionRecord).filter(
        models.OrderCompletionRecord.completed_at >= period_start,
        models.OrderCompletionRecord.completed_at < period_end,
    )

    scope: Literal["system", "staff", "driver"] = "system"
    picker_summary = None
    driver_summary = None
    system_summary = None

    if current_user.role == "driver":
        scope = "driver"
        completion_records = completion_query.filter(
            models.OrderCompletionRecord.driver_user_id == current_user.id
        ).all()
        entries = [
            build_report_entry(record.order, record)
            for record in completion_records
            if record.order is not None
        ]
        driver_summary = build_driver_summary(entries)
    elif current_user.role == "staff":
        scope = "staff"
        completed_picking_orders = get_staff_completed_picking_orders(db, period_start, current_user.id)
        completion_records = completion_query.filter(
            models.OrderCompletionRecord.order_id.in_([order.id for order in completed_picking_orders] or {-1})
        ).all()
        completion_record_by_order_id = {record.order_id: record for record in completion_records}
        entries = [
            build_report_entry(
                order,
                completion_record_by_order_id.get(order.id),
                picker_user_id=current_user.id,
            )
            for order in completed_picking_orders
        ]
        picker_summary = build_picker_summary(entries)
    else:
        completion_records = completion_query.all()
        entries = [
            build_report_entry(record.order, record)
            for record in completion_records
            if record.order is not None
        ]
        pick_minutes = [entry.pick_minutes for entry in entries if entry.pick_minutes is not None]
        delivery_minutes = [entry.delivery_minutes for entry in entries if entry.delivery_minutes is not None]
        system_summary = schemas.SystemPerformanceSummary(
            total_deliveries=len(entries),
            average_pick_minutes=round_metric(mean(pick_minutes) if pick_minutes else 0.0),
            average_delivery_minutes=round_metric(mean(delivery_minutes) if delivery_minutes else 0.0),
            stores=build_store_summaries(entries),
            picker_leaderboard=build_picker_leaderboard(db, period_start, completion_records),
            driver_leaderboard=build_driver_leaderboard(entries),
        )

    entries.sort(key=lambda entry: entry.completed_at, reverse=True)
    total_revenue = round(sum(entry.total_amount for entry in entries), 2)

    return schemas.ReportSummaryResponse(
        scope=scope,
        period=period,
        anchor_date=period_start.date(),
        range_start=period_start,
        range_end=period_end - timedelta(seconds=1),
        completed_orders=len(entries),
        total_revenue=total_revenue,
        entries=entries,
        picker_summary=picker_summary,
        driver_summary=driver_summary,
        system_summary=system_summary,
    )

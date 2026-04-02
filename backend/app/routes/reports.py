from datetime import datetime, timedelta
from typing import Literal

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from ..dependencies import require_roles

router = APIRouter(prefix="/reports", tags=["Reports"])

ReportPeriod = Literal["day", "week", "month", "quarter", "half_year", "year"]


def get_period_start(period: ReportPeriod) -> datetime:
    now = datetime.utcnow()

    if period == "day":
        return now - timedelta(days=1)
    if period == "week":
        return now - timedelta(days=7)
    if period == "month":
        return now - timedelta(days=30)
    if period == "quarter":
        return now - timedelta(days=91)
    if period == "half_year":
        return now - timedelta(days=182)
    return now - timedelta(days=365)


def build_report_entry(order: models.Order, completion_record: models.OrderCompletionRecord) -> schemas.ReportEntry:
    total_amount = sum(item.quantity * item.unit_price for item in order.items)
    delivery_id = order.delivery.id if order.delivery else None
    driver_name = completion_record.driver.full_name if completion_record.driver else None
    customer_name = order.user.full_name if order.user else None
    store_name = order.store.name if order.store else None

    return schemas.ReportEntry(
        order_id=order.id,
        customer_id=order.user_id,
        customer_name=customer_name,
        store_id=order.store_id,
        store_name=store_name,
        total_amount=total_amount,
        completed_at=completion_record.completed_at,
        delivery_id=delivery_id,
        driver_id=completion_record.driver_user_id,
        driver_name=driver_name,
    )


@router.get("/summary", response_model=schemas.ReportSummaryResponse)
def get_report_summary(
    period: ReportPeriod = "week",
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_roles("admin", "manager", "staff", "driver")),
):
    period_start = get_period_start(period)
    completion_query = db.query(models.OrderCompletionRecord).filter(
        models.OrderCompletionRecord.completed_at >= period_start
    )

    scope: Literal["system", "staff", "driver"] = "system"

    if current_user.role == "driver":
        scope = "driver"
        completion_records = completion_query.filter(
            models.OrderCompletionRecord.driver_user_id == current_user.id
        ).all()
    elif current_user.role == "staff":
        scope = "staff"
        pick_records = (
            db.query(models.OrderItemPickRecord)
            .filter(models.OrderItemPickRecord.picker_user_id == current_user.id)
            .all()
        )
        picked_order_ids = {
            pick_record.order_item.order_id
            for pick_record in pick_records
            if pick_record.order_item is not None
        }
        completion_records = completion_query.filter(
            models.OrderCompletionRecord.order_id.in_(picked_order_ids or {-1})
        ).all()
    else:
        completion_records = completion_query.all()

    entries = [
        build_report_entry(completion_record.order, completion_record)
        for completion_record in completion_records
        if completion_record.order is not None
    ]
    entries.sort(key=lambda entry: entry.completed_at, reverse=True)
    total_revenue = sum(entry.total_amount for entry in entries)

    return schemas.ReportSummaryResponse(
        scope=scope,
        period=period,
        completed_orders=len(entries),
        total_revenue=total_revenue,
        entries=entries,
    )

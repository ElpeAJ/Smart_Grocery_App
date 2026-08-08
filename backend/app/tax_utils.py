RAW_FOOD_CATEGORY_NAMES = {
    "Fresh Fruits",
    "Fresh Vegetables",
    "Tubers and Roots",
    "Grains and Cereals",
    "Beans and Legumes",
    "Meat and Poultry",
    "Fish and Seafood",
    "Dairy and Eggs",
}

VAT_RATE = 0.15


def get_tax_rate_for_category_name(category_name: str | None) -> float:
    if category_name and category_name in RAW_FOOD_CATEGORY_NAMES:
        return 0.0
    return VAT_RATE


def get_product_tax_rate(product) -> float:
    category_name = None
    if getattr(product, "category", None):
        category_name = product.category.name
    return get_tax_rate_for_category_name(category_name)


def get_product_tax_status(product) -> str:
    return "tax_exempt" if get_product_tax_rate(product) == 0 else "vat_15"


def round_money(value: float) -> float:
    return round(float(value), 2)


def compute_line_subtotal(unit_price: float, quantity: int) -> float:
    return round_money(unit_price * quantity)


def compute_line_tax(unit_price: float, quantity: int, tax_rate: float) -> float:
    return round_money(compute_line_subtotal(unit_price, quantity) * tax_rate)


def compute_line_total(unit_price: float, quantity: int, tax_rate: float) -> float:
    return round_money(compute_line_subtotal(unit_price, quantity) + compute_line_tax(unit_price, quantity, tax_rate))

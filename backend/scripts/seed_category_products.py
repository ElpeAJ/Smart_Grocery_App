import sqlite3
from itertools import cycle
from pathlib import Path


DB_PATH = Path(__file__).resolve().parents[1] / "smart_grocery.db"
TARGET_PER_CATEGORY = 15


CATEGORY_PRODUCTS = {
    "Baby Food and Baby Care": [
        "Cerelac Wheat 400g",
        "Cerelac Maize 400g",
        "Cow & Gate Baby Cereal",
        "Infant Formula Stage 1",
        "Toddler Formula Stage 3",
        "Baby Diapers Small Pack",
        "Baby Diapers Jumbo Pack",
        "Baby Wipes Aloe Pack",
        "Baby Lotion Gentle Care",
        "Baby Powder Soft Touch",
        "Baby Bath Wash",
        "Baby Feeding Bottle 250ml",
        "Baby Bib Set",
        "Baby Food Apple Puree",
        "Baby Food Banana Puree",
    ],
    "Beans and Legumes": [
        "Brown Beans 1kg",
        "Black Eyed Beans 1kg",
        "Red Kidney Beans 1kg",
        "Soya Beans 1kg",
        "Lentils 500g",
        "Split Peas 500g",
        "Bambara Beans 1kg",
        "Groundnuts Raw 1kg",
        "Groundnuts Roasted 500g",
        "Cowpeas 1kg",
        "Green Peas Dried 500g",
        "Chickpeas 500g",
        "Bean Mix Family Pack",
        "Ayoyo Beans 1kg",
        "Beans Flour 500g",
    ],
    "Beverages": [
        "Malt Drink Can",
        "Malt Drink Bottle",
        "Ginger Drink 1L",
        "Sobolo Drink 1L",
        "Lamugin Drink 500ml",
        "Chapman Mix 1L",
        "Tamarind Drink 500ml",
        "Pineapple Drink 1L",
        "Zobo Ginger Blend",
        "Coconut Drink 330ml",
        "Fruit Cocktail Drink 1L",
        "Energy Drink Can",
        "Sparkling Apple Drink",
        "Iced Tea Peach Bottle",
        "Kunu Drink 500ml",
    ],
    "Bread and Pastries": [
        "Tea Bread Large",
        "Butter Bread Loaf",
        "Wheat Bread Loaf",
        "Sugar Bread Loaf",
        "Meat Pie",
        "Chicken Pie",
        "Sausage Roll",
        "Doughnut Pack",
        "Croissant Butter",
        "Cupcake Vanilla",
        "Rock Buns Pack",
        "Chin Chin Bakery Bag",
        "Coconut Bread Loaf",
        "Baguette",
        "Banana Bread Loaf",
    ],
    "Breakfast Foods": [
        "Corn Flakes 500g",
        "Golden Morn 500g",
        "Weetabix 24 Pack",
        "Quaker Oats 500g",
        "Granola Honey 400g",
        "Muesli Fruit Mix 500g",
        "Milo Cereal Duo",
        "Chocolate Cereal 375g",
        "Porridge Mix 500g",
        "Custard Powder 400g",
        "Pancake Mix 500g",
        "Waffle Mix 400g",
        "Breakfast Sausage Pack",
        "Hot Chocolate Mix 400g",
        "Oatmeal Sachet Box",
    ],
    "Dairy and Eggs": [
        "Fresh Milk 1L",
        "Evaporated Milk Tin",
        "Condensed Milk Tin",
        "Full Cream Milk Powder",
        "Skimmed Milk Powder",
        "Yoghurt Strawberry Cup",
        "Yoghurt Vanilla Cup",
        "Greek Yoghurt Tub",
        "Cheddar Cheese Slices",
        "Mozzarella Cheese Pack",
        "Butter Salted 250g",
        "Margarine 500g",
        "Eggs Crate 30",
        "Eggs Half Crate 15",
        "Whipping Cream 250ml",
    ],
    "Fish and Seafood": [
        "Tilapia Whole",
        "Salmon Fillet Pack",
        "Mackerel Pack",
        "Herrings Smoked Pack",
        "Sardines Tin",
        "Tuna Chunks Tin",
        "Shrimps Pack",
        "Crab Pack",
        "Catfish Smoked",
        "Koobi Pack",
        "Keta School Boys",
        "Red Fish Smoked",
        "Octopus Seafood Mix",
        "Prawns Jumbo Pack",
        "Anchovies Dry Pack",
    ],
    "Flour and Baking": [
        "All Purpose Flour 1kg",
        "Self Raising Flour 1kg",
        "Bread Flour 1kg",
        "Cake Flour 1kg",
        "Baking Powder Tin",
        "Baking Soda Pack",
        "Vanilla Essence Bottle",
        "Mixed Spice Bottle",
        "Cocoa Powder 250g",
        "Icing Sugar 500g",
        "Brown Sugar 1kg",
        "Yeast Sachet Box",
        "Sprinkles Pack",
        "Cupcake Liners Pack",
        "Fondant Icing 500g",
    ],
    "Fresh Fruits": [
        "Banana Bunch",
        "Avocado Bag",
        "Orange Pack",
        "Mango Basket",
        "Pineapple Whole",
        "Watermelon Slice Pack",
        "Papaya Whole",
        "Apple Pack",
        "Grapes Punnet",
        "Strawberries Punnet",
        "Lemon Pack",
        "Lime Pack",
        "Coconut Whole",
        "Pear Pack",
        "Guava Pack",
    ],
    "Fresh Vegetables": [
        "Tomatoes Basket",
        "Onions 1kg",
        "Bell Peppers Pack",
        "Okra Pack",
        "Garden Eggs Pack",
        "Cabbage Whole",
        "Carrots 1kg",
        "Cucumber Pack",
        "Lettuce Head",
        "Spring Onions Bunch",
        "Green Pepper Pack",
        "Scotch Bonnet Pepper Pack",
        "Kontomire Bunch",
        "Green Beans Pack",
        "Broccoli Head",
    ],
    "Frozen Foods": [
        "Frozen Chicken Wings",
        "Frozen Chicken Thighs",
        "Frozen French Fries",
        "Frozen Vegetable Mix",
        "Frozen Pizza",
        "Frozen Sausage Pack",
        "Frozen Meatballs",
        "Frozen Spring Rolls",
        "Frozen Fish Fillets",
        "Frozen Sweet Corn",
        "Frozen Peas",
        "Frozen Chicken Nuggets",
        "Frozen Burger Patties",
        "Frozen Puff Pastry",
        "Ice Cream Vanilla Tub",
    ],
    "Grains and Cereals": [
        "White Maize 1kg",
        "Yellow Maize 1kg",
        "Millet 1kg",
        "Sorghum 1kg",
        "Guinea Corn 1kg",
        "Wheat Grain 1kg",
        "Pearl Barley 500g",
        "Fonio 500g",
        "Rolled Oats 1kg",
        "Corn Dough Pack",
        "Tom Brown Mix 500g",
        "Gari Ijebu 1kg",
        "Gari White 1kg",
        "Hominy Corn 1kg",
        "Popped Corn Kernels 500g",
    ],
    "Hair Care and Beauty": [
        "Shampoo Moisture 400ml",
        "Conditioner Repair 400ml",
        "Hair Food Pomade",
        "Leave In Conditioner",
        "Hair Gel Strong Hold",
        "Edge Control Jar",
        "Hair Serum Oil",
        "Hair Relaxer Kit",
        "Shower Cap Pack",
        "Wide Tooth Comb",
        "Hair Brush Soft",
        "Hair Spray Bottle",
        "Body Mist Floral",
        "Lip Gloss Clear",
        "Face Powder Compact",
    ],
    "Health and Wellness": [
        "Vitamin C Tablets",
        "Multivitamin Capsules",
        "Immune Booster Syrup",
        "Pain Relief Tablets",
        "Antacid Sachets",
        "First Aid Bandages",
        "Digital Thermometer",
        "Hand Sanitizer 250ml",
        "Face Mask Pack",
        "ORS Sachet",
        "Herbal Tea Cleanse",
        "Eucalyptus Balm",
        "Inhaler Steam Rub",
        "Glucose Powder",
        "Hot Water Bottle",
    ],
    "Household Cleaning": [
        "Dishwashing Liquid 1L",
        "Multipurpose Cleaner 1L",
        "Toilet Cleaner 750ml",
        "Bleach 1L",
        "Floor Cleaner 1L",
        "Glass Cleaner 500ml",
        "Air Freshener Spray",
        "Disinfectant Spray",
        "Scouring Powder",
        "Sponges Pack",
        "Scrubbing Brush",
        "Mop Head",
        "Broom Soft",
        "Trash Bags Large",
        "Bucket 15L",
    ],
    "Juices and Soft Drinks": [
        "Orange Juice 1L",
        "Apple Juice 1L",
        "Mango Juice 1L",
        "Pineapple Juice 1L",
        "Fruit Punch 1L",
        "Cola 1.5L",
        "Lemon Lime Soda 1.5L",
        "Orange Soda 1.5L",
        "Ginger Ale 1L",
        "Tonic Water 1L",
        "Club Soda 1L",
        "Can Cola Pack",
        "Can Orange Soda Pack",
        "Can Malt Pack",
        "Sparkling Water 500ml",
    ],
    "Laundry and Fabric Care": [
        "Washing Powder 1kg",
        "Washing Powder 3kg",
        "Liquid Detergent 1L",
        "Fabric Softener 1L",
        "Bleach for Whites",
        "Stain Remover Spray",
        "Bar Soap Laundry",
        "Laundry Basket",
        "Clothes Pegs Pack",
        "Ironing Starch Spray",
        "Scent Booster Beads",
        "Hand Wash Detergent",
        "Delicates Laundry Soap",
        "Drying Rack Clips",
        "Wool Wash Liquid",
    ],
    "Meat and Poultry": [
        "Chicken Whole",
        "Chicken Breast Pack",
        "Chicken Gizzard Pack",
        "Beef Cubes 1kg",
        "Goat Meat Pack",
        "Mutton Pack",
        "Turkey Wings Pack",
        "Turkey Tail Pack",
        "Pork Chops Pack",
        "Minced Meat 500g",
        "Cow Leg Pack",
        "Chicken Sausage Pack",
        "Liver Pack",
        "Cow Skin Wele Pack",
        "Smoked Turkey Pack",
    ],
    "Oils and Cooking Fats": [
        "Vegetable Oil 1L",
        "Vegetable Oil 3L",
        "Sunflower Oil 1L",
        "Canola Oil 1L",
        "Palm Oil 1L",
        "Red Palm Oil 500ml",
        "Olive Oil 500ml",
        "Groundnut Oil 1L",
        "Coconut Oil 500ml",
        "Margarine 250g",
        "Shortening 500g",
        "Butter Ghee 250g",
        "Cooking Spray",
        "Sesame Oil 250ml",
        "Corn Oil 1L",
    ],
    "Pantry Essentials": [
        "Sea Salt 1kg",
        "White Sugar 1kg",
        "Brown Sugar 500g",
        "Honey 500ml",
        "Vinegar 500ml",
        "Soy Sauce 250ml",
        "Mayonnaise 500ml",
        "Ketchup 500ml",
        "Salad Cream 500ml",
        "Peanut Butter 500g",
        "Jam Strawberry 450g",
        "Custard Powder 1kg",
        "Instant Noodles Family Pack",
        "Cube Seasoning Jar",
        "Table Salt 500g",
    ],
    "Paper Products and Disposables": [
        "Toilet Roll 4 Pack",
        "Toilet Roll 12 Pack",
        "Kitchen Towels 2 Pack",
        "Serviettes 100 Pack",
        "Paper Plates Pack",
        "Paper Cups Pack",
        "Plastic Cups Pack",
        "Plastic Plates Pack",
        "Foil Wrap Roll",
        "Cling Film Roll",
        "Tissue Box",
        "Wet Towels Pack",
        "Bin Liners Medium",
        "Aluminium Trays Pack",
        "Food Storage Bags",
    ],
    "Personal Care and Toiletries": [
        "Bath Soap Bar",
        "Body Wash 500ml",
        "Toothpaste 140g",
        "Toothbrush Soft",
        "Mouthwash 500ml",
        "Deodorant Roll On",
        "Deodorant Spray",
        "Body Lotion 400ml",
        "Hand Cream 100ml",
        "Shaving Stick Pack",
        "Shaving Cream",
        "Sanitary Pads Pack",
        "Panty Liners Pack",
        "Cotton Buds Box",
        "Petroleum Jelly Jar",
    ],
    "Rice and Pasta": [
        "Perfumed Rice 5kg",
        "Jasmine Rice 5kg",
        "Basmati Rice 5kg",
        "Brown Rice 2kg",
        "Local Rice 5kg",
        "Spaghetti 500g",
        "Macaroni 500g",
        "Penne Pasta 500g",
        "Fusilli Pasta 500g",
        "Lasagna Sheets 500g",
        "Instant Noodles Chicken",
        "Instant Noodles Beef",
        "Rice Vermicelli 400g",
        "Couscous 500g",
        "Semolina 1kg",
    ],
    "Snacks and Biscuits": [
        "Chocolate Biscuits Pack",
        "Digestive Biscuits Pack",
        "Cream Crackers Pack",
        "Plantain Chips Pack",
        "Potato Chips Pack",
        "Peanut Crunch Pack",
        "Chin Chin Sweet Pack",
        "Popcorn Butter Pack",
        "Salted Cashews Pack",
        "Mixed Nuts Pack",
        "Wafer Biscuits Pack",
        "Coconut Cookies Pack",
        "Shortbread Pack",
        "Cheese Balls Pack",
        "Pretzel Sticks Pack",
    ],
    "Spices and Seasonings": [
        "Curry Powder",
        "Thyme Bottle",
        "Black Pepper Bottle",
        "White Pepper Bottle",
        "Ginger Powder Bottle",
        "Garlic Powder Bottle",
        "Paprika Bottle",
        "Nutmeg Bottle",
        "Anise Seed Pack",
        "Bay Leaves Pack",
        "Seasoning Cubes Pack",
        "All Purpose Seasoning",
        "Suya Spice Pack",
        "Chili Powder Bottle",
        "Mixed Herbs Bottle",
    ],
    "Sweets and Confectionery": [
        "Chocolate Bar Milk",
        "Chocolate Bar Dark",
        "Toffee Assorted Pack",
        "Mint Candy Pack",
        "Lollipop Pack",
        "Chewing Gum Pack",
        "Jelly Beans Pack",
        "Marshmallows Pack",
        "Caramel Candy Pack",
        "Hard Candy Fruity",
        "Biscuits and Cream Bar",
        "Wafer Chocolate Bar",
        "Candy Cane Pack",
        "Peanut Brittle Pack",
        "Gummy Bears Pack",
    ],
    "Tea, Coffee and Cocoa": [
        "Black Tea Bags 100",
        "Green Tea Bags 50",
        "Lemon Tea Bags 50",
        "Instant Coffee Jar",
        "Ground Coffee 250g",
        "Coffee Creamer 400g",
        "Hot Chocolate Drink 500g",
        "Pure Cocoa Powder 250g",
        "Milo Refill 500g",
        "Nescafe Sachets Pack",
        "Cappuccino Mix Box",
        "Espresso Beans 250g",
        "Herbal Tea Mix",
        "Ginger Tea Box",
        "Honey Tea Blend",
    ],
    "Tomato Mix and Canned Goods": [
        "Tomato Paste Tin",
        "Tomato Mix Sachet",
        "Baked Beans Tin",
        "Sweet Corn Tin",
        "Green Peas Tin",
        "Mushroom Slices Tin",
        "Chopped Tomatoes Tin",
        "Tinned Sardines",
        "Tinned Mackerel",
        "Corned Beef Tin",
        "Tuna in Oil Tin",
        "Coconut Milk Tin",
        "Evaporated Milk Tin Large",
        "Beans in Tomato Sauce",
        "Mixed Vegetables Tin",
    ],
    "Tubers and Roots": [
        "Yam Tubers Pack",
        "Cassava Bag",
        "Sweet Potato 1kg",
        "Irish Potatoes 2kg",
        "Plantain Bunch",
        "Cocoyam Pack",
        "Ginger Root 500g",
        "Turmeric Root 500g",
        "Beetroot Pack",
        "Radish Pack",
        "Dasheen Pack",
        "Yam Flour 1kg",
        "Cassava Flour 1kg",
        "Plantain Flour 1kg",
        "Potato Crisps Raw Pack",
    ],
    "Water": [
        "Bottled Water 500ml",
        "Bottled Water 1.5L",
        "Mineral Water 500ml Pack",
        "Mineral Water 1.5L Pack",
        "Sachet Water Bag",
        "Sparkling Water 500ml",
        "Sparkling Water 1L",
        "Flavoured Water Lemon",
        "Flavoured Water Berry",
        "Alkaline Water 1L",
        "Natural Spring Water 750ml",
        "Electrolyte Water 500ml",
        "Premium Glass Water 750ml",
        "Kids Water Bottle Pack",
        "Water Dispenser Bottle 18L",
    ],
}


CATEGORY_BASE_PRICES = {
    "Fresh Fruits": 8.0,
    "Fresh Vegetables": 5.0,
    "Tubers and Roots": 7.5,
    "Grains and Cereals": 9.0,
    "Rice and Pasta": 10.0,
    "Beans and Legumes": 9.5,
    "Flour and Baking": 8.5,
    "Spices and Seasonings": 4.5,
    "Oils and Cooking Fats": 15.0,
    "Tomato Mix and Canned Goods": 6.5,
    "Breakfast Foods": 12.0,
    "Bread and Pastries": 5.5,
    "Dairy and Eggs": 10.5,
    "Meat and Poultry": 22.0,
    "Fish and Seafood": 20.0,
    "Frozen Foods": 18.0,
    "Snacks and Biscuits": 4.0,
    "Sweets and Confectionery": 3.5,
    "Beverages": 5.0,
    "Juices and Soft Drinks": 6.0,
    "Tea, Coffee and Cocoa": 11.0,
    "Water": 2.5,
    "Baby Food and Baby Care": 14.0,
    "Household Cleaning": 11.5,
    "Laundry and Fabric Care": 12.0,
    "Personal Care and Toiletries": 9.0,
    "Hair Care and Beauty": 13.0,
    "Health and Wellness": 14.5,
    "Paper Products and Disposables": 7.0,
    "Pantry Essentials": 6.5,
}


STOCK_PATTERN = [10, 14, 18, 24, 30, 12, 16, 20, 28, 35, 15, 22, 26, 32, 40]


def make_description(name: str, category: str) -> str:
    return f"Manager-curated {category.lower()} item: {name}."


def make_price(category: str, index: int) -> float:
    base = CATEGORY_BASE_PRICES.get(category, 8.0)
    return round(base + (index % 5) * 1.75 + (index // 5) * 0.9, 2)


def main() -> None:
    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = sqlite3.Row
    cursor = connection.cursor()

    stores = cursor.execute("select id from stores order by id").fetchall()
    if not stores:
        raise SystemExit("No stores found. Create at least one store before seeding products.")

    store_cycle = cycle([row["id"] for row in stores])
    categories = {
        row["name"]: row["id"]
        for row in cursor.execute("select id, name from product_categories").fetchall()
    }

    inserted = 0

    for category_name, candidates in CATEGORY_PRODUCTS.items():
        category_id = categories.get(category_name)
        if category_id is None:
            continue

        existing_rows = cursor.execute(
            """
            select p.id, p.name
            from products p
            join product_category_assignments pca on pca.product_id = p.id
            where pca.category_id = ?
            """,
            (category_id,),
        ).fetchall()
        existing_names = {row["name"] for row in existing_rows}

        missing_names = [name for name in candidates if name not in existing_names]
        current_count = len(existing_rows)
        needed = max(0, TARGET_PER_CATEGORY - current_count)

        if needed == 0:
            continue

        for index, name in enumerate(missing_names[:needed]):
            store_id = next(store_cycle)
            cursor.execute(
                """
                insert into products (store_id, name, description, price, stock_quantity, status)
                values (?, ?, ?, ?, ?, ?)
                """,
                (
                    store_id,
                    name,
                    make_description(name, category_name),
                    make_price(category_name, index),
                    STOCK_PATTERN[index % len(STOCK_PATTERN)],
                    "in_stock",
                ),
            )
            product_id = cursor.lastrowid
            cursor.execute(
                """
                insert into product_category_assignments (product_id, category_id)
                values (?, ?)
                """,
                (product_id, category_id),
            )
            inserted += 1

        remaining = TARGET_PER_CATEGORY - (
            current_count + min(needed, len(missing_names))
        )
        for extra_index in range(remaining):
            store_id = next(store_cycle)
            extra_name = f"{category_name} Item {extra_index + 1}"
            cursor.execute(
                """
                insert into products (store_id, name, description, price, stock_quantity, status)
                values (?, ?, ?, ?, ?, ?)
                """,
                (
                    store_id,
                    extra_name,
                    make_description(extra_name, category_name),
                    make_price(category_name, extra_index + len(missing_names)),
                    STOCK_PATTERN[(extra_index + len(missing_names)) % len(STOCK_PATTERN)],
                    "in_stock",
                ),
            )
            product_id = cursor.lastrowid
            cursor.execute(
                """
                insert into product_category_assignments (product_id, category_id)
                values (?, ?)
                """,
                (product_id, category_id),
            )
            inserted += 1

    connection.commit()
    connection.close()
    print(f"Inserted {inserted} products.")


if __name__ == "__main__":
    main()

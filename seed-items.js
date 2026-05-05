require("dotenv").config({ path: ".env.local" });
const mongoose = require("mongoose");

const menuItemSchema = new mongoose.Schema({
  restaurantId: mongoose.Schema.Types.ObjectId,
  name: String,
  description: String,
  price: Number,
  category: String,
  imageUrl2D: String,
  model3DUrl: String,
  isActive: { type: Boolean, default: true },
  displayOrder: { type: Number, default: 0 },
  arEnabled: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
});

const MenuItem = mongoose.model("MenuItem", menuItemSchema);

async function seed() {
  try {
    await mongoose.connect(process.env.DATABASE_URL || process.env.MONGODB_URI);
    console.log("Connected to MongoDB");

    const RESTAURANT_ID = "69d8b9057e1081f915428d8a";

    const sampleItems = [
      {
        name: "Margherita Pizza",
        description: "Classic Italian pizza with fresh basil and mozzarella",
        category: "mains",
        price: 14.99,
      },
      {
        name: "Caesar Salad",
        description:
          "Crisp romaine lettuce with parmesan and creamy Caesar dressing",
        category: "starters",
        price: 9.99,
      },
      {
        name: "Pasta Carbonara",
        description:
          "Authentic Italian pasta with eggs, pecorino cheese, and pancetta",
        category: "mains",
        price: 16.99,
      },
      {
        name: "Tiramisu",
        description: "Traditional Italian dessert with mascarpone and espresso",
        category: "desserts",
        price: 8.99,
      },
      {
        name: "Espresso",
        description: "Strong Italian espresso shot",
        category: "drinks",
        price: 3.99,
      },
      {
        name: "Bruschetta",
        description: "Toasted bread with tomato, garlic, and basil",
        category: "starters",
        price: 8.99,
      },
      {
        name: "Risotto Milanese",
        description: "Creamy saffron risotto with parmesan",
        category: "mains",
        price: 18.99,
      },
      {
        name: "Panna Cotta",
        description: "Silky smooth vanilla panna cotta with berries",
        category: "desserts",
        price: 9.99,
      },
      {
        name: "Caprese Salad",
        description: "Fresh tomato, mozzarella, and basil with balsamic glaze",
        category: "starters",
        price: 11.99,
      },
      {
        name: "Lasagna Bolognese",
        description: "Layered pasta with rich meat sauce and cheese",
        category: "mains",
        price: 15.99,
      },
      {
        name: "Gnocchi al Pesto",
        description: "Soft potato dumplings with fresh basil pesto",
        category: "mains",
        price: 14.99,
      },
      {
        name: "Affogato",
        description: "Vanilla gelato drowned in hot espresso",
        category: "desserts",
        price: 6.99,
      },
      {
        name: "Minestrone Soup",
        description: "Hearty vegetable and pasta soup",
        category: "starters",
        price: 7.99,
      },
      {
        name: "Osso Buco",
        description: "Slow-braised veal shanks with wine and vegetables",
        category: "mains",
        price: 24.99,
      },
      {
        name: "Panettone",
        description: "Traditional Italian Christmas cake with dried fruits",
        category: "desserts",
        price: 7.99,
      },
    ];

    let created = 0;
    for (const item of sampleItems) {
      const exists = await MenuItem.findOne({
        restaurantId: RESTAURANT_ID,
        name: item.name,
      });

      if (!exists) {
        const menuItem = new MenuItem({
          restaurantId: RESTAURANT_ID,
          ...item,
          isActive: true,
          displayOrder: created,
          imageUrl2D:
            "https://via.placeholder.com/300x300?text=" +
            encodeURIComponent(item.name),
        });
        await menuItem.save();
        created++;
        console.log(`✓ Created: ${item.name}`);
      }
    }

    const totalItems = await MenuItem.countDocuments({
      restaurantId: RESTAURANT_ID,
    });

    console.log(`\n✅ Complete!`);
    console.log(`Created ${created} new items`);
    console.log(`Total menu items for restaurant: ${totalItems}`);
    console.log(`Visit: http://localhost:3000/menu/kitchen`);

    process.exit(0);
  } catch (error) {
    console.error("Error:", error.message);
    process.exit(1);
  }
}

seed();

(async () => {
  const fetch = globalThis.fetch || require("node-fetch");
  const base = "http://localhost:5000/api/analytics/track";
  const restaurantId = "69d8b9057e1081f915428d8a";
  const combos = [
    [
      "6a005543ee372910123ffa11",
      "6a005543ee372910123ffa1d",
      "6a005544ee372910123ffa23",
    ],
    ["6a005543ee372910123ffa11", "6a005543ee372910123ffa1a"],
    ["6a005543ee372910123ffa14", "6a005543ee372910123ffa20"],
  ];

  let count = 0;
  for (let i = 0; i < combos.length; i++) {
    const sessionId = `seed-sess-${i + 1}`;
    const deviceId = `seed-device-${i + 1}`;
    const items = combos[i];
    for (let j = 0; j < items.length; j++) {
      const body = {
        restaurantId,
        eventType: "add_to_cart",
        deviceType: "Web",
        sessionId,
        deviceId,
        menuItemId: items[j],
        quantity: 1,
      };
      try {
        const res = await fetch(base, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        console.log(
          "posted",
          body.menuItemId,
          "status",
          res.status,
          data?.message || "",
        );
        count++;
      } catch (e) {
        console.error("post error", e.message);
      }
    }
  }
  console.log("done, events posted:", count);
})();

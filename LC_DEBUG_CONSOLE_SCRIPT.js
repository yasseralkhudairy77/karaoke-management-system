// 🔍 LC SELECTION DEBUG - Jalankan di Browser Console

// 1. Check semua rooms data
console.log("=== ALL ROOMS ===");
console.table(rooms.map(r => ({
  room_id: r.room_id,
  room_name: r.room_name,
  status: r.status,
  lc_ids: r.lc_ids,
  customer_name: r.customer_name,
})));

// 2. Check occupied rooms only
console.log("\n=== OCCUPIED ROOMS ONLY ===");
const occupiedRooms = rooms.filter(r => r.status === "occupied");
console.table(occupiedRooms.map(r => ({
  room_id: r.room_id,
  room_name: r.room_name,
  lc_ids: r.lc_ids,
  lc_ids_exists: !!r.lc_ids,
  lc_ids_type: typeof r.lc_ids,
  lc_ids_truthy: !!String(r.lc_ids || "").trim(),
})));

// 3. Check kondisi rendering untuk occupied room
console.log("\n=== RENDER CONDITION CHECK ===");
occupiedRooms.forEach(room => {
  const lcIds = String(room.lc_ids || "").trim();
  console.log(`${room.room_id}: lcIds="${lcIds}" | should_render_button=${!!lcIds}`);
});

// 4. Check button di DOM
console.log("\n=== BUTTON IN DOM ===");
occupiedRooms.forEach(room => {
  const lcButton = document.querySelector(`[data-room-id="${room.room_id}"] [data-action="show-lc-selection"]`);
  console.log(`${room.room_id}: button_exists=${!!lcButton}, button_visible=${lcButton ? lcButton.offsetHeight > 0 : 'N/A'}`);
  if (lcButton) {
    console.log(`  └─ Button text: "${lcButton.textContent}", disabled=${lcButton.disabled}`);
  }
});

// 5. Check API response raw
console.log("\n=== CALLING API getRooms ===");
fetch(API_BASE_URL + "?action=getRooms")
  .then(r => r.json())
  .then(data => {
    console.log("API Response - Occupied Rooms:");
    const occupied = data.rooms.filter(r => r.status === "occupied");
    console.table(occupied.map(r => ({
      room_id: r.room_id,
      status: r.status,
      lc_ids: r.lc_ids,
      lc_ids_raw: JSON.stringify(r.lc_ids),
    })));
  })
  .catch(err => console.error("API Error:", err));

// 6. Compare frontend vs backend data
console.log("\n=== FRONTEND vs BACKEND COMPARISON ===");
fetch(API_BASE_URL + "?action=getRooms")
  .then(r => r.json())
  .then(apiData => {
    const occupiedAPI = apiData.rooms.find(r => r.status === "occupied");
    const occupiedFront = rooms.find(r => r.status === "occupied");
    
    if (occupiedAPI && occupiedFront) {
      console.table({
        "Frontend lc_ids": occupiedFront.lc_ids,
        "Backend lc_ids": occupiedAPI.lc_ids,
        "Match": occupiedFront.lc_ids === occupiedAPI.lc_ids,
      });
    }
  });

console.log("\n✅ Debug selesai. Check console output di atas.");

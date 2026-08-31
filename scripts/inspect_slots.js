const fs = require('fs');

const state = JSON.parse(fs.readFileSync('full_initial_state.json', 'utf8'));
const slots = state.multiWidgetState.widgetsData.slots;

slots.forEach((slot, idx) => {
  const widget = slot.slotData?.widget;
  console.log(`Slot ${idx}: type = ${widget?.type}, slotType = ${slot.slotType}`);
  if (idx === slots.length - 1 || idx === slots.length - 2) {
    console.log(`Slot ${idx} data:`, JSON.stringify(widget?.data, null, 2));
  }
});

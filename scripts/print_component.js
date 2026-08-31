const fs = require('fs');

const state = JSON.parse(fs.readFileSync('full_initial_state.json', 'utf8'));

const slots = state.multiWidgetState.widgetsData.slots;
console.log(`Found ${slots.length} slots in multiWidgetState.widgetsData.slots.`);

slots.forEach((slot, idx) => {
  const widget = slot.slotData && slot.slotData.widget;
  if (!widget) return;
  const components = widget.data && widget.data.renderableComponents;
  if (components && components.length > 0) {
    components.forEach((c, cIdx) => {
      if (c.value && (c.value.author || c.value.text || c.value.rating)) {
        console.log(`Slot ${idx} Component ${cIdx}:`, JSON.stringify(c.value, null, 2));
      }
    });
  }
});

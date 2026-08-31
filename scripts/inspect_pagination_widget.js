const fs = require('fs');

const state = JSON.parse(fs.readFileSync('full_initial_state.json', 'utf8'));
const slots = state.multiWidgetState.widgetsData.slots;

slots.forEach((slot, idx) => {
  const widget = slot.slotData?.widget;
  if (!widget) return;
  const type = widget.type;
  if (type && (type.includes('PAGINATION') || type.includes('PAGE') || type.includes('FOOTER') || type.includes('NAV'))) {
    console.log(`Pagination/Nav widget at slot ${idx} (${type}):`, JSON.stringify(widget, null, 2));
  }
});

// Draw a scale preview of the first rows on one colourway's roll.
const integer = new Intl.NumberFormat('en-GB');

export function drawLayout(canvas, brief, result, message) {
  const width = Math.round(canvas.getBoundingClientRect().width);
  const height = Math.round(canvas.getBoundingClientRect().height);
  if (!width || !height) return;
  const ratio = Math.min(window.devicePixelRatio || 1, 3);
  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(height * ratio);
  const ctx = canvas.getContext('2d');
  ctx.scale(ratio, ratio);
  ctx.textBaseline = 'middle';
  ctx.font = '12px "DM Sans", Arial, sans-serif';

  const layout = result?.layout;
  if (!layout?.orientation) {
    const description = message || 'No feasible cutting direction';
    canvas.setAttribute('aria-label', description);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#e4ecdc';
    ctx.fillText(description, width / 2, height / 2, width - 12);
    return;
  }

  const rotated = layout.orientation === 'rotated';
  const pieceWidth = rotated ? brief.swatchHeightMm : brief.swatchWidthMm;
  const pieceHeight = rotated ? brief.swatchWidthMm : brief.swatchHeightMm;
  const padding = width < 350 ? 6 : 15;
  const top = 30;
  const bottom = 22;
  const fullWidthScale = (width - 2 * padding) / brief.rollWidthMm;
  const availableHeight = height - top - bottom;
  // A slightly narrower roll can show a complete second row without distorting the scale.
  const preferredRows = Math.min(
    3,
    layout.rowsPerColour,
    Math.max(1, Math.round(availableHeight / (pieceHeight * fullWidthScale))),
  );
  const scale = Math.min(fullWidthScale, availableHeight / (pieceHeight * preferredRows));
  const rowHeight = pieceHeight * scale;
  const columnWidth = pieceWidth * scale;
  const rollWidth = brief.rollWidthMm * scale;
  const start = (width - rollWidth) / 2;
  const rows = Math.min(
    3,
    layout.rowsPerColour,
    Math.max(1, Math.floor((height - top - bottom) / rowHeight + 1e-8)),
  );
  const chartBottom = top + rows * rowHeight;
  const offcut = brief.rollWidthMm - layout.across * pieceWidth;

  ctx.strokeStyle = '#b1c5ae';
  ctx.lineWidth = 1;
  const rulerY = top - 7;
  ctx.beginPath();
  ctx.moveTo(start, rulerY);
  ctx.lineTo(start + rollWidth, rulerY);
  ctx.moveTo(start, rulerY - 3);
  ctx.lineTo(start, rulerY + 3);
  ctx.moveTo(start + rollWidth, rulerY - 3);
  ctx.lineTo(start + rollWidth, rulerY + 3);
  ctx.stroke();
  ctx.textAlign = 'center';
  ctx.fillStyle = '#eef4e7';
  ctx.fillText(integer.format(brief.rollWidthMm) + ' mm cuttable width', width / 2, rulerY - 10);

  // The hatch also identifies empty positions in a partial last row.
  ctx.save();
  ctx.beginPath();
  ctx.rect(start, top, rollWidth, rows * rowHeight);
  ctx.clip();
  ctx.fillStyle = '#3b594c';
  ctx.fillRect(start, top, rollWidth, rows * rowHeight);
  ctx.strokeStyle = '#788f79';
  ctx.beginPath();
  for (let x = start - height; x < start + rollWidth + height; x += 6) {
    ctx.moveTo(x, chartBottom);
    ctx.lineTo(x + rows * rowHeight, top);
  }
  ctx.stroke();
  ctx.restore();

  const colours = ['#b8ccb0', '#aabfa4'];
  const gap = Math.min(1.4, columnWidth / 6, rowHeight / 6);
  const tile = document.createElement('canvas');
  tile.width = 6;
  tile.height = 6;
  const weave = tile.getContext('2d');
  weave.fillStyle = 'rgba(40,74,46,.07)';
  weave.fillRect(0, 1, 6, 1);
  weave.fillRect(2, 0, 1, 6);
  weave.fillStyle = 'rgba(236,239,220,.14)';
  weave.fillRect(0, 4, 6, 1);
  const grainPattern = ctx.createPattern(tile, 'repeat');
  for (let row = 0; row < rows; row++) {
    const count = Math.min(layout.across, Math.max(0, brief.quantity - row * layout.across));
    for (let col = 0; col < count; col++) {
      const x = start + col * columnWidth;
      const y = top + row * rowHeight;
      ctx.fillStyle = colours[(row + col) % 2];
      ctx.fillRect(x + gap / 2, y + gap / 2, columnWidth - gap, rowHeight - gap);
      if (columnWidth > 18 && rowHeight > 14) {
        ctx.fillStyle = grainPattern;
        ctx.fillRect(x + gap / 2, y + gap / 2, columnWidth - gap, rowHeight - gap);
      }
      if (columnWidth > 46 && rowHeight > 20) {
        ctx.fillStyle = '#365341';
        ctx.font = '11px "DM Sans", Arial, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(String(row * layout.across + col + 1).padStart(2, '0'), x + 7, y + 10);
      }
    }
  }
  ctx.strokeStyle = '#dee8d7';
  ctx.strokeRect(start, top, rollWidth, rows * rowHeight);
  ctx.textAlign = 'left';
  ctx.font = '11px "DM Sans", Arial, sans-serif';
  ctx.fillStyle = '#dce9d6';
  ctx.fillText(
    rows + ' of ' + integer.format(layout.rowsPerColour) + ' rows · one colourway',
    padding,
    Math.min(height - 7, chartBottom + 12),
  );
  canvas.setAttribute(
    'aria-label',
    integer.format(layout.across) +
      ' swatches across the roll. ' +
      rows +
      ' of ' +
      layout.rowsPerColour +
      ' rows shown. Swatch ' +
      pieceWidth +
      ' by ' +
      pieceHeight +
      ' millimetres in this orientation. ' +
      offcut +
      ' millimetres of unused width per full row.',
  );
}

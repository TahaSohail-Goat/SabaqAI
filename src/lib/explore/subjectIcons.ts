// Hand-drawn (canvas path) icons for each subject's book cover — original vector shapes, not
// copied from anywhere, so there's no licensing question the way using a scraped real book
// cover would raise. Kept simple/abstract on purpose, especially for Urdu/Islamiyat/Pakistan
// Studies, rather than attempting real script or specific iconography that could be gotten
// wrong or read as culturally presumptuous at this tiny scale.

export type IconDrawer = (ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) => void;

function drawStar(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, alpha = 0.9): void {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.fillStyle = `rgba(255,255,255,${alpha})`;
  ctx.beginPath();
  for (let i = 0; i < 5; i++) {
    const angle = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
    const ox = Math.cos(angle) * r;
    const oy = Math.sin(angle) * r;
    if (i === 0) ctx.moveTo(ox, oy);
    else ctx.lineTo(ox, oy);
    const innerAngle = angle + Math.PI / 5;
    ctx.lineTo(Math.cos(innerAngle) * r * 0.4, Math.sin(innerAngle) * r * 0.4);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

export const SUBJECT_ICONS: Record<string, IconDrawer> = {
  physics: (ctx, cx, cy, r) => {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.strokeStyle = 'rgba(255,255,255,0.88)';
    ctx.lineWidth = r * 0.06;
    for (const angle of [0, Math.PI / 3, -Math.PI / 3]) {
      ctx.save();
      ctx.rotate(angle);
      ctx.beginPath();
      ctx.ellipse(0, 0, r, r * 0.42, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.14, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  },

  chemistry: (ctx, cx, cy, r) => {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.strokeStyle = 'rgba(255,255,255,0.88)';
    ctx.lineWidth = r * 0.07;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(-r * 0.22, -r * 0.85);
    ctx.lineTo(-r * 0.22, -r * 0.05);
    ctx.lineTo(-r * 0.72, r * 0.7);
    ctx.quadraticCurveTo(-r * 0.55, r * 0.9, -r * 0.28, r * 0.9);
    ctx.lineTo(r * 0.28, r * 0.9);
    ctx.quadraticCurveTo(r * 0.55, r * 0.9, r * 0.72, r * 0.7);
    ctx.lineTo(r * 0.22, -r * 0.05);
    ctx.lineTo(r * 0.22, -r * 0.85);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-r * 0.32, -r * 0.85);
    ctx.lineTo(r * 0.32, -r * 0.85);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.beginPath();
    ctx.arc(-r * 0.12, r * 0.5, r * 0.08, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(r * 0.18, r * 0.28, r * 0.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  },

  biology: (ctx, cx, cy, r) => {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.strokeStyle = 'rgba(255,255,255,0.88)';
    ctx.lineWidth = r * 0.06;
    ctx.beginPath();
    ctx.moveTo(0, -r);
    ctx.quadraticCurveTo(r * 0.95, -r * 0.25, 0, r);
    ctx.quadraticCurveTo(-r * 0.95, -r * 0.25, 0, -r);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, -r * 0.78);
    ctx.lineTo(0, r * 0.82);
    ctx.stroke();
    ctx.restore();
  },

  mathematics: (ctx, cx, cy, r) => {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.strokeStyle = 'rgba(255,255,255,0.88)';
    ctx.lineWidth = r * 0.1;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-r * 0.75, -r * 0.55);
    ctx.lineTo(r * 0.75, -r * 0.55);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-r * 0.42, -r * 0.55);
    ctx.lineTo(-r * 0.58, r * 0.75);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(r * 0.42, -r * 0.55);
    ctx.quadraticCurveTo(r * 0.12, r * 0.2, r * 0.48, r * 0.75);
    ctx.stroke();
    ctx.restore();
  },

  english: (ctx, cx, cy, r) => {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.strokeStyle = 'rgba(255,255,255,0.88)';
    ctx.lineWidth = r * 0.06;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-r * 0.55, r * 0.85);
    ctx.quadraticCurveTo(r * 0.1, r * 0.45, r * 0.7, -r * 0.85);
    ctx.quadraticCurveTo(r * 0.05, -r * 0.5, -r * 0.2, r * 0.15);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-r * 0.65, r * 0.92);
    ctx.lineTo(-r * 0.35, r * 0.6);
    ctx.stroke();
    ctx.restore();
  },

  urdu: (ctx, cx, cy, r) => {
    // Abstract flowing swirl (not a real script character) — a calligraphic gesture, not an
    // attempt at actual Urdu/Nastaliq script.
    ctx.save();
    ctx.translate(cx, cy);
    ctx.strokeStyle = 'rgba(255,255,255,0.88)';
    ctx.lineWidth = r * 0.09;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-r * 0.75, r * 0.3);
    ctx.quadraticCurveTo(-r * 0.15, -r * 0.85, r * 0.4, -r * 0.15);
    ctx.quadraticCurveTo(r * 0.85, r * 0.3, r * 0.48, r * 0.78);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.88)';
    ctx.beginPath();
    ctx.arc(-r * 0.72, r * 0.32, r * 0.075, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  },

  computer_science: (ctx, cx, cy, r) => {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.strokeStyle = 'rgba(255,255,255,0.88)';
    ctx.lineWidth = r * 0.1;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(-r * 0.15, -r * 0.55);
    ctx.lineTo(-r * 0.75, 0);
    ctx.lineTo(-r * 0.15, r * 0.55);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(r * 0.15, -r * 0.55);
    ctx.lineTo(r * 0.75, 0);
    ctx.lineTo(r * 0.15, r * 0.55);
    ctx.stroke();
    ctx.restore();
  },

  islamiyat: (ctx, cx, cy, r) => {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.75, Math.PI * 0.15, Math.PI * 1.55, false);
    ctx.arc(r * 0.28, 0, r * 0.62, Math.PI * 1.55, Math.PI * 0.15, true);
    ctx.closePath();
    ctx.fill();
    drawStar(ctx, r * 0.48, -r * 0.15, r * 0.16);
    ctx.restore();
  },

  pakistan_studies: (ctx, cx, cy, r) => {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = r * 0.06;
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.82, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-r * 0.82, 0);
    ctx.lineTo(r * 0.82, 0);
    ctx.moveTo(0, -r * 0.82);
    ctx.lineTo(0, r * 0.82);
    ctx.stroke();
    drawStar(ctx, 0, 0, r * 0.24);
    ctx.restore();
  },
};

export function getSubjectIcon(subjectCode: string): IconDrawer | null {
  return SUBJECT_ICONS[subjectCode] ?? null;
}

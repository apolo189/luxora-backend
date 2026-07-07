/**
 * Builds a single text editing instruction for the Gemini image-editing
 * model, enforcing Luxora's "obedience priority" rule: the color/material/
 * style direction must be IDENTICAL across all 4 variants — only intensity
 * (Safe -> Wow) may change. Because this model edits the whole photo from a
 * text instruction (no mask required), a single call can update walls AND
 * floor together in one pass, whichever the chosen scope requires.
 */

// Intensity presets: language-only differences (never touch color/material).
const VARIANT_INTENSITY = {
  safe: {
    styleModifiers: 'a clean, faithful, true-to-life reproduction with realistic, unembellished lighting — a conservative, safe preview of the exact choices'
  },
  elegant: {
    styleModifiers: 'a refined, polished look with softly enhanced natural lighting and a subtle tasteful sheen'
  },
  premium: {
    styleModifiers: 'an elevated, high-end material feel with richer contrast, warm depth, and editorial-photography-quality lighting'
  },
  wow: {
    styleModifiers: 'maximum showroom drama — bold contrast, luxurious and striking, magazine-cover-quality dramatic lighting, while remaining photorealistic'
  }
};

const STYLE_LABELS = {
  minimal: 'minimal, clean, quiet, restrained',
  warm: 'warm, inviting, soft, natural',
  'modern-premium': 'sharp, elevated, modern premium',
  luxury: 'luxury, rich materials, high-end',
  contemporary: 'balanced, on-trend, contemporary',
  'soft-organic': 'soft organic, textural, natural forms'
};

// Furniture handling instructions, folded into the prompt when the user
// asks to declutter the room or add new furniture. Left empty for "keep"
// (the default), which means "do not mention furniture at all" so the
// model's default behavior (leave everything else untouched) applies.
const FURNITURE_INSTRUCTIONS = {
  keep: '',
  declutter: 'Also remove all furniture, decor, and loose objects/clutter from the room, leaving it clean and empty. Keep the walls, floor, ceiling, windows, doors, and architectural structure exactly as they are otherwise.',
  furnish: 'Also add tasteful, appropriately-scaled furniture and decor suited to this room type and the overall design style described below, arranged realistically for the space and camera angle shown in the photo.'
};

function describeScope(config) {
  const lines = [];
  if (config.wallColorHex && (config.scope === 'walls-only' || config.scope === 'walls-floors')) {
    lines.push(`Repaint/refinish ALL the walls to the color "${config.wallColorName}" (hex ${config.wallColorHex}), using a "${config.wallDesign}" finish/texture.`);
  }
  if (config.wallColorHex && config.scope === 'accent-wall') {
    lines.push(`Repaint/refinish ONLY the single most visually prominent feature wall (leave the other walls exactly as they are in the original photo) to the color "${config.wallColorName}" (hex ${config.wallColorHex}), using a "${config.wallDesign}" finish/texture.`);
  }
  if (config.floorColorHex && (config.scope === 'floors-only' || config.scope === 'walls-floors')) {
    lines.push(`Replace the flooring with a "${config.floorColorName}" (hex ${config.floorColorHex}) floor in a "${config.floorDesign}" style.`);
  }
  return lines.join(' ');
}

/**
 * @param {object} config
 * @param {string} config.roomType - e.g. "living-room"
 * @param {string} config.scope - "walls-only" | "floors-only" | "walls-floors" | "accent-wall"
 * @param {string} config.style - Luxora style id, e.g. "modern-premium"
 * @param {string} [config.wallColorName] @param {string} [config.wallColorHex] @param {string} [config.wallDesign]
 * @param {string} [config.floorColorName] @param {string} [config.floorColorHex] @param {string} [config.floorDesign]
 * @param {'keep'|'declutter'|'furnish'} [config.furnitureMode]
 * @param {'safe'|'elegant'|'premium'|'wow'} variantId
 */
function buildPrompt(config, variantId) {
  const intensity = VARIANT_INTENSITY[variantId] || VARIANT_INTENSITY.safe;
  const styleWords = STYLE_LABELS[config.style] || config.style || '';
  const scopeDescription = describeScope(config);
  const roomLabel = config.roomType ? config.roomType.replace(/-/g, ' ') : 'room';
  const furnitureMode = config.furnitureMode || 'keep';
  const furnitureInstruction = FURNITURE_INSTRUCTIONS[furnitureMode] || '';

  // The "do not change anything else" rule must be relaxed for furniture
  // when the user explicitly asked to declutter or add furniture — otherwise
  // it would directly contradict the furniture instruction above.
  const preserveClause = furnitureMode === 'keep'
    ? 'Keep the exact same camera angle, perspective, room layout, furniture, windows, doors, ceiling, and light sources as the original photo. Change ONLY the surface(s) explicitly described above — do not alter, add, or remove anything else in the scene.'
    : 'Keep the exact same camera angle, perspective, room layout, windows, doors, ceiling, and light sources as the original photo. Change ONLY the surface(s) explicitly described above plus the furniture as instructed below — do not alter anything else in the scene.';

  const prompt = [
    `Edit this real photo of a ${roomLabel} for an interior design sales presentation.`,
    scopeDescription,
    furnitureInstruction,
    `Overall interior design style to aim for: ${styleWords}.`,
    `Rendering intensity/mood for this specific version: ${intensity.styleModifiers}.`,
    `CRITICAL RULES: ${preserveClause}`,
    `Do not change the specified color or material away from what is stated above — only adjust realism, lighting integration, and finish polish according to the rendering intensity described.`,
    `The output must be a single photorealistic image, indistinguishable from a real photograph of the same room after this renovation.`
  ].filter(Boolean).join(' ');

  return { prompt };
}

module.exports = { VARIANT_INTENSITY, FURNITURE_INSTRUCTIONS, buildPrompt };


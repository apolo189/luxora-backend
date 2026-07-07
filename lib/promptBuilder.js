/**
 * Builds a single text editing instruction for the Gemini image-editing
 * model, enforcing Luxora's "obedience priority" rule: the color/material/
 * style direction must be IDENTICAL across all 4 variants — only intensity
 * (Safe -> Wow) may change. Because this model edits the whole photo from a
 * text instruction (no mask required), a single call can update walls AND
 * floor together in one pass, whichever the chosen scope requires.
 */

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

const FURNITURE_INSTRUCTIONS = {
  keep: '',
  declutter: 'MANDATORY TASK — DECLUTTER THE ROOM: You must physically remove EVERY piece of furniture, every decor item, every loose object, towel, plant, dish, and any clutter visible anywhere in this photo, including on countertops, floors, tables, and chairs. The room must end up completely empty of furniture and objects — a bare, clean, professionally staged empty room showing only the architectural shell (walls, floor, ceiling, windows, doors, built-in cabinetry/fixtures). This is just as important as the wall/floor color change — do not skip or under-apply it.',
  furnish: 'MANDATORY TASK — FURNISH THE ROOM: You must add complete, tasteful, appropriately-scaled furniture and decor suited to this room type and the design style described below (e.g. sofa/seating, tables, rugs, lighting, decor as appropriate for the room type), arranged realistically for the space and camera angle shown. This is just as important as the wall/floor color change — do not skip or under-apply it.'
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

function buildFurniturePrompt(config) {
  const furnitureMode = config.furnitureMode || 'keep';
  const instruction = FURNITURE_INSTRUCTIONS[furnitureMode];
  if (!instruction) return null;
  const roomLabel = config.roomType ? config.roomType.replace(/-/g, ' ') : 'room';

  const prompt = [
    `Edit this real photo of a ${roomLabel}.`,
    instruction,
    `Keep the exact same camera angle, perspective, room architecture, wall color/material, floor color/material, ceiling, windows, doors, and lighting exactly as they are in the original photo — this step must change ONLY the furniture/objects as instructed above, nothing else.`,
    `The output must be a single photorealistic image, indistinguishable from a real photograph of the same room.`
  ].filter(Boolean).join(' ');

  return { prompt };
}

function buildPrompt(config, variantId, opts = {}) {
  const intensity = VARIANT_INTENSITY[variantId] || VARIANT_INTENSITY.safe;
  const styleWords = STYLE_LABELS[config.style] || config.style || '';
  const scopeDescription = describeScope(config);
  const roomLabel = config.roomType ? config.roomType.replace(/-/g, ' ') : 'room';
  const furnitureMode = config.furnitureMode || 'keep';
  const skipFurniture = !!opts.skipFurnitureInstruction;
  const furnitureInstruction = skipFurniture ? '' : (FURNITURE_INSTRUCTIONS[furnitureMode] || '');

  let preserveClause;
  if (furnitureMode === 'keep') {
    preserveClause = 'Keep the exact same camera angle, perspective, room layout, furniture, windows, doors, ceiling, and light sources as the original photo. Change ONLY the surface(s) explicitly described above — do not alter, add, or remove anything else in the scene.';
  } else if (skipFurniture) {
    preserveClause = 'Keep the exact same camera angle, perspective, room layout, windows, doors, ceiling, and light sources as this photo. The furniture/objects currently shown in this photo are final and intentional — do NOT add, remove, or rearrange any furniture or objects. Change ONLY the surface(s) explicitly described above.';
  } else {
    preserveClause = 'Keep the exact same camera angle, perspective, room layout, windows, doors, ceiling, and light sources as the original photo. Change ONLY the surface(s) explicitly described above plus the furniture as instructed below — do not alter anything else in the scene.';
  }

  const prompt = [
    `Edit this real photo of a ${roomLabel} for an interior design sales presentation.`,
    furnitureInstruction,
    scopeDescription,
    `Overall interior design style to aim for: ${styleWords}.`,
    `Rendering intensity/mood for this specific version: ${intensity.styleModifiers}.`,
    `CRITICAL RULES: ${preserveClause}`,
    (!skipFurniture && furnitureMode !== 'keep') ? `Reminder: the furniture instruction above is mandatory and must be clearly, visibly applied in the output — it is not optional.` : '',
    `Do not change the specified color or material away from what is stated above — only adjust realism, lighting integration, and finish polish according to the rendering intensity described.`,
    `The output must be a single photorealistic image, indistinguishable from a real photograph of the same room after this renovation.`
  ].filter(Boolean).join(' ');

  return { prompt };
}

module.exports = { VARIANT_INTENSITY, FURNITURE_INSTRUCTIONS, buildPrompt, buildFurniturePrompt };

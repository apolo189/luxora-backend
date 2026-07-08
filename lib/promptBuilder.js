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
    styleModifiers: 'maximum showroom drama — bold contrast, luxurious and striking, magazine-cover-quality dramatic lighting and material finish, while remaining strictly photorealistic and faithful to the real room shown (do not add, remove, or change any objects/furniture to achieve this drama — only lighting and finish quality may intensify)'
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

function describeFinishHints(designName) {
  const d = (designName || '').toLowerCase();
  const hints = [];
  if (d.includes('gloss') || d.includes('polish')) hints.push('a glossy, light-reflective sheen');
  if (d.includes('matte') || (d.includes('smooth') && !d.includes('gloss'))) hints.push('a smooth matte finish');
  if (d.includes('marble')) hints.push('soft, natural stone veining');
  if (d.includes('travertine') || d.includes('limestone') || d.includes('terrazzo') || (d.includes('stone') && !d.includes('marble'))) hints.push('natural stone texture with subtle color variation');
  if (d.includes('wood') || d.includes('plank') || d.includes('oak') || d.includes('walnut')) hints.push('visible natural wood grain texture');
  if (d.includes('herringbone') || d.includes('chevron')) hints.push('laid in a distinct herringbone/chevron pattern');
  if (d.includes('concrete') || d.includes('microcement')) hints.push('a seamless, industrial-smooth concrete-look finish');
  if (d.includes('texture') || d.includes('stucco') || d.includes('plaster') || d.includes('limewash') || d.includes('venetian')) hints.push('a tactile, hand-applied textured surface');
  if (d.includes('wallpaper')) hints.push('a richly patterned decorative surface');
  if (d.includes('panel') || d.includes('slat') || d.includes('fluted') || d.includes('wainscoting') || d.includes('cladding')) hints.push('distinct three-dimensional paneling/molding detail, not a flat painted surface');
  return hints.join(', ');
}

function describeScope(config) {
  const lines = [];
  const wallHints = describeFinishHints(config.wallDesign);
  const floorHints = describeFinishHints(config.floorDesign);

  if (config.wallColorHex && (config.scope === 'walls-only' || config.scope === 'walls-floors')) {
    lines.push(`Completely repaint/refinish EVERY wall visible in this photo — full, solid, edge-to-edge coverage, with no wall left in its original color — to a "${config.wallColorName}" color (reference hex ${config.wallColorHex}), in a "${config.wallDesign}" style${wallHints ? ` (${wallHints})` : ''}. This wall color change is the single most important requested edit in this image and MUST be clearly, obviously visible in the output.`);
  }
  if (config.wallColorHex && config.scope === 'accent-wall') {
    lines.push(`Repaint/refinish ONLY the single most visually prominent feature wall (leave every other wall exactly as it is in the original photo) to a "${config.wallColorName}" color (reference hex ${config.wallColorHex}), in a "${config.wallDesign}" style${wallHints ? ` (${wallHints})` : ''}. This wall color change MUST be clearly, obviously visible in the output.`);
  }
  if (config.floorColorHex && (config.scope === 'floors-only' || config.scope === 'walls-floors')) {
    lines.push(`Completely replace the flooring across the ENTIRE visible floor area with a "${config.floorColorName}" floor (reference hex ${config.floorColorHex}) in a "${config.floorDesign}" style${floorHints ? ` (${floorHints})` : ''}. This floor change MUST be clearly, obviously visible in the output.`);
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

  let keepList;
  if (furnitureMode === 'keep') {
    keepList = 'the exact same camera angle, perspective, room layout, all furniture, all decor, windows, doors, ceiling, and light sources';
  } else if (skipFurniture) {
    keepList = 'the exact same camera angle, perspective, room layout, windows, doors, ceiling, and light sources — the furniture/objects currently shown in THIS photo are final and intentional, do not add, remove, or rearrange any of them';
  } else {
    keepList = 'the exact same camera angle, perspective, room layout, windows, doors, ceiling, and light sources';
  }

  const noHallucinationClause = 'Do not invent, add, or introduce any new furniture, decor, plants, people, or objects that are not already present in the original photo. A bolder or more dramatic rendering must come ONLY from lighting quality, material realism, and finish polish — never from adding new objects to the scene.';

  const prompt = [
    `PHOTOREALISTIC INTERIOR RENOVATION EDIT of this exact real photo of a ${roomLabel} — same room, same structure, same camera angle, same perspective, and same lighting direction as the original photo. This is for an interior design sales presentation, so accuracy to the requested changes matters more than creative interpretation.`,
    `KEEP UNCHANGED: ${keepList}. Do not alter, add, or remove anything in the scene except what is explicitly instructed below.`,
    furnitureInstruction,
    `REQUIRED CHANGES: ${scopeDescription}`,
    `Overall interior design style to aim for while applying the above: ${styleWords}.`,
    `Rendering intensity/mood for this specific version: ${intensity.styleModifiers}.`,
    noHallucinationClause,
    (!skipFurniture && furnitureMode !== 'keep') ? `Reminder: the furniture instruction above is mandatory and must be clearly, visibly applied in the output — it is not optional.` : '',
    `Reminder of the required changes (do not skip or under-apply these): ${scopeDescription}`,
    `The output must be a single photorealistic image, indistinguishable from a real photograph of THIS EXACT room after this renovation — not a generic stock photo of a similar room.`
  ].filter(Boolean).join(' ');

  return { prompt };
}

function buildSuggestionPrompt(config) {
  const roomLabel = config.roomType ? config.roomType.replace(/-/g, ' ') : 'room';
  const needsWalls = config.needsWalls !== false;
  const needsFloors = config.needsFloors !== false;

  const wallCatalog = (config.wallColorFamilies || [])
    .map(f => `${f.label}: ${f.colors.map(c => `${c.name} (${c.hex})`).join(', ')}`).join(' | ');
  const floorCatalog = (config.floorColorFamilies || [])
    .map(f => `${f.label}: ${f.colors.map(c => `${c.name} (${c.hex})`).join(', ')}`).join(' | ');
  const wallDesignCatalog = (config.wallDesigns || []).join(', ');
  const floorDesignCatalog = (config.floorDesigns || []).join(', ');

  const schemaFields = [];
  if (needsWalls) schemaFields.push('"wallColorName" (string, EXACT name from the wall color catalog), "wallColorHex" (string, the EXACT hex from the wall color catalog that matches wallColorName), "wallDesign" (string, EXACT name from the wall design catalog)');
  if (needsFloors) schemaFields.push('"floorColorName" (string, EXACT name from the floor color catalog), "floorColorHex" (string, the EXACT hex from the floor color catalog that matches floorColorName), "floorDesign" (string, EXACT name from the floor design catalog)');

  const prompt = [
    `You are a professional interior designer looking at a real photo of a ${roomLabel}.`,
    `STEP 1 — Identify the FIXED elements in this photo that will NOT be changed by this renovation: cabinet color/material/finish (if visible), countertop color/material (if visible), backsplash color/style (if visible), current wall color, and current floor color/material. Be specific and concise.`,
    `STEP 2 — Based on those fixed elements, recommend ${needsWalls && needsFloors ? '2 to 3 cohesive wall-color + floor-color/design combinations' : needsWalls ? '2 to 3 wall-color options' : '2 to 3 floor-color/design options'} that would look cohesive and elevate this specific room, reasoning explicitly about how each recommendation relates to the existing fixed elements you identified (e.g. "warm cherry cabinets + black countertops → a white marble floor with gray veining ties in the black countertops, while warm gold veining echoes the cherry wood tones").`,
    `IMPORTANT CONSTRAINT: you must choose each recommended color/design ONLY from the exact catalogs below — do not invent new names or hex codes, and do not alter the hex values. Pick whichever catalog entries best match your professional recommendation.`,
    needsWalls ? `WALL COLOR CATALOG (name (hex), grouped by family): ${wallCatalog}` : '',
    needsWalls ? `WALL DESIGN/FINISH CATALOG: ${wallDesignCatalog}` : '',
    needsFloors ? `FLOOR COLOR CATALOG (name (hex), grouped by family): ${floorCatalog}` : '',
    needsFloors ? `FLOOR DESIGN/FINISH CATALOG: ${floorDesignCatalog}` : '',
    `Respond ONLY with JSON matching exactly this shape (no extra commentary, no markdown fences):`,
    `{"fixedElements": {"cabinets": string, "countertop": string, "backsplash": string, "currentWallColor": string, "currentFloorColor": string}, "suggestions": [{"label": string (e.g. "Recommended", "Alternative", "Bold Option"), "reasoning": string (1-2 sentences explaining why this combination works with the fixed elements), ${schemaFields.join(', ')}}]}`,
    `If a fixed element is not visible/applicable in the photo, use an empty string "" for it. Return between 2 and 3 items in "suggestions".`
  ].filter(Boolean).join(' ');

  return { prompt };
}

module.exports = { VARIANT_INTENSITY, FURNITURE_INSTRUCTIONS, buildPrompt, buildFurniturePrompt, buildSuggestionPrompt };

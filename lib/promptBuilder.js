const VARIANT_INTENSITY = {
  safe: {
    label: 'Safe',
    styleModifiers: 'Apply the change in a subtle, tasteful, realistic way. Keep it conservative and true to the exact color/material requested, without exaggeration.'
  },
  elegant: {
    label: 'Elegant',
    styleModifiers: 'Apply the change in a refined, elegant way. Slightly enhance the material quality and lighting realism while staying faithful to the exact color/material requested.'
  },
  premium: {
    label: 'Premium',
    styleModifiers: 'Apply the change with a premium, high-end finish. Emphasize rich texture detail and realistic material quality, while staying faithful to the exact color/material requested.'
  },
  wow: {
    label: 'Wow',
    styleModifiers: 'Apply the change with maximum visual impact and a bold, striking presentation, while staying strictly faithful to the exact color/material requested (do not change the color/material itself, only the mood/lighting/impact).'
  }
};

const STYLE_LABELS = {
  modern: 'modern, clean, minimalist style',
  classic: 'classic, timeless, traditional style',
  industrial: 'industrial style with raw, urban aesthetic',
  scandinavian: 'Scandinavian style, light and cozy',
  minimalist: 'minimalist style, simple and uncluttered',
  rustic: 'rustic, warm, natural style'
};

function describeScope(config) {
  const {
    scope,
    wallColorName, wallColorHex, wallDesign,
    floorColorName, floorColorHex, floorDesign
  } = config;

  const parts = [];

  const needsWalls = scope === 'walls' || scope === 'walls-floors' || scope === 'accent-wall';
  const needsFloors = scope === 'floors' || scope === 'walls-floors';

  if (needsWalls) {
    const label = scope === 'accent-wall' ? 'ONLY the main accent wall (the single most prominent wall facing the camera)' : 'ALL the walls';
    parts.push(
      `Repaint/refinish ${label} using the color "${wallColorName}" (hex ${wallColorHex})${wallDesign ? `, with a "${wallDesign}" finish/texture` : ''}. Do not change any other wall or surface.`
    );
  }

  if (needsFloors) {
    parts.push(
      `Replace the flooring with "${floorColorName}" (hex ${floorColorHex})${floorDesign ? `, in a "${floorDesign}" material/pattern` : ''}. Do not change any other surface.`
    );
  }

  return parts.join(' ');
}

function buildPrompt(config, variantId) {
  const intensity = VARIANT_INTENSITY[variantId];
  const styleText = STYLE_LABELS[config.style] || config.style;
  const scopeText = describeScope(config);

  const prompt = `You are editing a real photo of a ${config.roomType || 'room'}.
${scopeText}
Overall design direction: ${styleText}.
${intensity.styleModifiers}

CRITICAL RULES:
- Keep the exact same camera angle, perspective, room layout, furniture, windows, doors, and all objects unchanged.
- Only change the surface(s) explicitly mentioned above. Do not alter anything else in the image.
- Do not deviate from the exact color/material specified above.
- The result must be photorealistic, with realistic lighting and shadows consistent with the original photo.
- Output only the edited photo.`;

  return { prompt };
}

module.exports = { VARIANT_INTENSITY, STYLE_LABELS, describeScope, buildPrompt };

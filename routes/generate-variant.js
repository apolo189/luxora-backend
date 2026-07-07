const express = require('express');
const router = express.Router();
const { buildPrompt, VARIANT_INTENSITY } = require('../lib/promptBuilder');
const { editImage } = require('../lib/gemini');

router.post('/', async (req, res) => {
  try {
    const {
      image,
      roomType,
      scope,
      style,
      variantId,
      wallColorName,
      wallColorHex,
      wallDesign,
      floorColorName,
      floorColorHex,
      floorDesign
    } = req.body || {};

    if (!image) return res.status(400).json({ error: 'Missing "image" field.' });
    if (!roomType) return res.status(400).json({ error: 'Missing "roomType" field.' });
    if (!scope) return res.status(400).json({ error: 'Missing "scope" field.' });
    if (!style) return res.status(400).json({ error: 'Missing "style" field.' });
    if (!variantId || !VARIANT_INTENSITY[variantId]) {
      return res.status(400).json({ error: `Invalid or missing "variantId". Must be one of: ${Object.keys(VARIANT_INTENSITY).join(', ')}` });
    }

    const needsWalls = scope === 'walls' || scope === 'walls-floors' || scope === 'accent-wall';
    const needsFloors = scope === 'floors' || scope === 'walls-floors';

    if (needsWalls && (!wallColorName || !wallColorHex)) {
      return res.status(400).json({ error: 'Missing wall color fields for this scope.' });
    }
    if (needsFloors && (!floorColorName || !floorColorHex)) {
      return res.status(400).json({ error: 'Missing floor color fields for this scope.' });
    }

    const match = /^data:(.+?);base64,(.+)$/.exec(image);
    if (!match) {
      return res.status(400).json({ error: 'Invalid "image" field. Expected a base64 data URL (data:image/...;base64,...).' });
    }
    const mimeType = match[1];
    const imageBase64 = match[2];

    const { prompt } = buildPrompt({
      roomType, scope, style,
      wallColorName, wallColorHex, wallDesign,
      floorColorName, floorColorHex, floorDesign
    }, variantId);

    const result = await editImage({ imageBase64, mimeType, prompt });

    res.json({
      variantId,
      imageUrl: `data:${result.mimeType};base64,${result.base64}`
    });
  } catch (err) {
    console.error('generate-variant error:', err);
    res.status(500).json({ error: err.message || 'Failed to generate variant.' });
  }
});

module.exports = router;

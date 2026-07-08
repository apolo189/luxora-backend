require('dotenv').config();
const express = require('express');
const cors = require('cors');
const generateVariantRoute = require('./routes/generate-variant');
const prepareRoomRoute = require('./routes/prepare-room');
const suggestDesignRoute = require('./routes/suggest-design');

const app = express();
const PORT = process.env.PORT || 8787;
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';

app.use(cors({ origin: CORS_ORIGIN }));
app.use(express.json({ limit: '25mb' }));

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    hasKey: Boolean(process.env.GEMINI_API_KEY),
    imageModel: process.env.GEMINI_IMAGE_MODEL || 'gemini-3-pro-image-preview'
  });
});

app.use('/api/generate-variant', generateVariantRoute);
app.use('/api/prepare-room', prepareRoomRoute);
app.use('/api/suggest-design', suggestDesignRoute);

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

app.listen(PORT, () => {
  if (!process.env.GEMINI_API_KEY) {
    console.warn('WARNING: GEMINI_API_KEY is not set. Requests will fail.');
  }
  console.log(`Luxora backend listening on port ${PORT}`);
});

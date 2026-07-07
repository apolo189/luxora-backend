const API_KEY = process.env.GEMINI_API_KEY;
const MODEL = process.env.GEMINI_IMAGE_MODEL || 'gemini-2.5-flash-image';

async function editImage({ imageBase64, mimeType, prompt }) {
  if (!API_KEY) {
    throw new Error('GEMINI_API_KEY is not set on the server. Add it in your hosting platform environment variables.');
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`;

  const body = {
    contents: [
      {
        parts: [
          { text: prompt },
          { inline_data: { mime_type: mimeType, data: imageBase64 } }
        ]
      }
    ]
  };

  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
  } catch (networkErr) {
    throw new Error(`Network error calling Gemini API: ${networkErr.message}`);
  }

  let data;
  try {
    data = await response.json();
  } catch (parseErr) {
    throw new Error(`Gemini API returned a non-JSON response (status ${response.status}).`);
  }

  if (!response.ok) {
    const apiMessage = data && data.error && data.error.message ? data.error.message : JSON.stringify(data);
    if (response.status === 404) {
      throw new Error(`Gemini API returned 404. The model name "${MODEL}" may be wrong or unavailable. Details: ${apiMessage}`);
    }
    throw new Error(`Gemini API error (status ${response.status}): ${apiMessage}`);
  }

  if (data.promptFeedback && data.promptFeedback.blockReason) {
    throw new Error(`Gemini blocked this request: ${data.promptFeedback.blockReason}`);
  }

  const candidate = data.candidates && data.candidates[0];
  const parts = candidate && candidate.content && candidate.content.parts ? candidate.content.parts : [];

  let imagePart = null;
  let textExplanation = '';

  for (const part of parts) {
    const inline = part.inlineData || part.inline_data;
    if (inline && inline.data) {
      imagePart = inline;
    }
    if (part.text) {
      textExplanation += part.text;
    }
  }

  if (!imagePart) {
    throw new Error(
      `Gemini did not return an image. ${textExplanation ? 'Model said: "' + textExplanation + '"' : 'No explanation was provided.'}`
    );
  }

  return {
    base64: imagePart.data,
    mimeType: imagePart.mimeType || imagePart.mime_type || 'image/png'
  };
}

module.exports = { editImage };

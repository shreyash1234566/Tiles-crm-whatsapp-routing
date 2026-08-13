import sharp from 'sharp';
import { NextResponse } from 'next/server';

const IS_TGM = String(process.env.BUSINESS_TYPE || process.env.NEXT_PUBLIC_BUSINESS_TYPE || '').trim().toLowerCase() === 'tiles';

const FURNITURE_PRODUCTS = [
  { id: 1, name: "Royal L-Shaped Sofa", category: "Sofas", price: 45000, material: "Fabric", color: "Grey", description: "Premium L-shaped sofa with foam cushioning", image: "🛋️" },
  { id: 2, name: "Milano King Bed", category: "Beds", price: 62000, material: "Sheesham Wood", color: "Walnut", description: "King size bed with hydraulic storage", image: "🛏️" },
  { id: 3, name: "Marble Dynasty Dining Set", category: "Dining", price: 38000, material: "Marble + Metal", color: "White", description: "6-seater dining table with marble top", image: "🪑" },
  { id: 4, name: "Executive Recliner Pro", category: "Sofas", price: 72000, material: "Leather", color: "Brown", description: "Premium leather recliner with USB charging", image: "💺" },
  { id: 5, name: "SlideMax 3-Door Wardrobe", category: "Storage", price: 55000, material: "Engineered Wood", color: "White", description: "3-door sliding wardrobe with full mirror", image: "🚪" },
  { id: 6, name: "ErgoMesh Office Chair", category: "Chairs", price: 14500, material: "Mesh + Metal", color: "Black", description: "Ergonomic office chair with lumbar support", image: "🪑" },
  { id: 7, name: "Woody Wall Bookshelf", category: "Storage", price: 22000, material: "Sheesham Wood", color: "Honey", description: "Wall-mounted bookshelf, 5 tiers", image: "📚" },
  { id: 8, name: "ComfyFold Sofa Bed", category: "Sofas", price: 32000, material: "Fabric + Metal", color: "Navy Blue", description: "Convertible sofa cum bed, 3-seater", image: "🛋️" },
  { id: 9, name: "Crystal TV Unit", category: "Living Room", price: 28000, material: "Engineered Wood", color: "Walnut", description: "TV unit with LED backlight panel", image: "📺" },
  { id: 10, name: "GlowUp Dressing Table", category: "Bedroom", price: 18500, material: "MDF + Mirror", color: "White", description: "Dressing table with LED vanity mirror", image: "💄" },
  { id: 11, name: "Adventure Bunk Bed", category: "Beds", price: 42000, material: "Metal + Wood", color: "Blue", description: "Bunk bed with built-in study table", image: "🛏️" },
  { id: 12, name: "Zenith Center Table", category: "Living Room", price: 12500, material: "Glass + Metal", color: "Clear", description: "Tempered glass center table, modern design", image: "☕" },
  { id: 13, name: "Heritage 8-Seater Dining", category: "Dining", price: 85000, material: "Teak Wood", color: "Dark Brown", description: "8-seater premium teak dining set", image: "🪑" },
  { id: 14, name: "CloudNine Bean Bag XXL", category: "Living Room", price: 3800, material: "Leatherette", color: "Tan", description: "XXL bean bag with refillable beans", image: "🫘" },
  { id: 15, name: "SoleKeeper Shoe Rack", category: "Storage", price: 8500, material: "Bamboo", color: "Natural", description: "4-tier bamboo shoe organizer", image: "👟" },
  { id: 16, name: "FocusDesk Study Table", category: "Bedroom", price: 21000, material: "Engineered Wood", color: "Oak", description: "Height-adjustable desk with 3 drawers", image: "📖" },
  { id: 17, name: "Tuscan 3-Seater Sofa", category: "Sofas", price: 38000, material: "Velvet", color: "Emerald Green", description: "Premium velvet sofa, tufted design", image: "🛋️" },
  { id: 18, name: "NightOwl Bedside Table", category: "Bedroom", price: 7500, material: "Pine Wood", color: "White", description: "2-drawer bedside table, minimalist", image: "🛏️" },
  { id: 19, name: "ModuLux Kitchen Cabinet", category: "Kitchen", price: 250000, material: "Marine Plywood", color: "White Glossy", description: "Full modular U-shaped kitchen", image: "🍳" },
  { id: 20, name: "CozyNest Accent Chair", category: "Chairs", price: 16000, material: "Fabric + Wood", color: "Mustard Yellow", description: "Accent chair with wooden legs", image: "💺" },
];

const TGM_PRODUCTS = [
  { id: 'tgm-1', name: 'Ivory Vein 600x600 GVT Tile', category: 'Vitrified Tiles', price: 1120, material: 'GVT', color: 'Ivory', description: 'Glossy floor tile, 17.22 sq.ft per box', image: '🧱', stock: 96 },
  { id: 'tgm-2', name: 'Calacatta Digital 600x1200 Tile', category: 'Digital Tiles', price: 1680, material: 'Porcelain', color: 'White / Grey Vein', description: 'Polished marble-look tile, 15.5 sq.ft per box', image: '⬜', stock: 48 },
  { id: 'tgm-3', name: 'Black Galaxy Granite 18mm', category: 'Granite Slabs', price: 245, material: 'Granite', color: 'Black / Gold Fleck', description: 'Actual slabs selected by lot and measured sq.ft', image: '🪨', stock: 1 },
  { id: 'tgm-4', name: 'Makrana White Marble 18mm', category: 'Marble Slabs', price: 290, material: 'Marble', color: 'White', description: 'Natural Indian marble for floors and vanity tops', image: '🪨', stock: 1 },
  { id: 'tgm-5', name: 'Italian Statuario Marble 20mm', category: 'Marble Slabs', price: 780, material: 'Marble', color: 'White / Dramatic Vein', description: 'Imported marble; approve actual slab before cutting', image: '🪨', stock: 1 },
  { id: 'tgm-6', name: 'Engineered Quartz Snow White', category: 'Engineered Quartz', price: 520, material: 'Engineered Quartz', color: 'White', description: 'Low-maintenance countertop surface', image: '⬜', stock: 1 },
];

const PRODUCTS = IS_TGM ? TGM_PRODUCTS : FURNITURE_PRODUCTS;

const FURNITURE_SYSTEM_PROMPT = `You are an expert interior designer and AI image-editing prompt engineer.
You will receive a base room photo and optionally a furniture reference image (both attached directly to this message — examine each carefully).
Your job is to produce structured JSON that will drive a SEARCH-AND-REPLACE image editing API.
That API takes the ORIGINAL room photo, finds a specific piece of furniture in it, and replaces it with a new one IN-PLACE (preserving all walls, floors, lighting, and perspective).
Look at BOTH images carefully before answering.

IMPORTANT: Return ONLY valid JSON, no markdown, no code fencing, no extra text. Do NOT wrap the JSON in backticks or any code block.

The JSON must follow this exact structure:
{"roomType":"Living Room | Bedroom | Dining Room | Kitchen | Office | Bathroom","currentStyle":"Modern | Traditional | Bohemian | Scandinavian | Industrial | Minimalist | Contemporary","colorPalette":["#hex1","#hex2","#hex3","#hex4"],"existingFurniture":["list of ALL furniture already visible in the room"],"searchPrompt":"A single simple noun of what to replace. No spatial words. Examples: sofa, tv, cabinet, chair, table","replacementPrompt":"Describe the NEW furniture item to place. If a furniture reference image was provided, describe IT precisely: exact color (e.g. deep teal, navy blue), material (velvet, leather, fabric), upholstery style (tufted, smooth), silhouette, number of seats, leg style. End with: photorealistic, natural lighting, seamless integration, interior design photography. Max 80 words.","recommendations":[{"category":"Sofas | Beds | Dining | Storage | Chairs | Living Room","suggestedStyle":"style","suggestedColor":"color","suggestedMaterial":"material","reason":"reason","priority":"High"}],"designTips":["tip1","tip2"],"overallAssessment":"assessment"}

CRITICAL RULES:
  - Output ONLY the raw JSON object. No text before or after it. No markdown fences.
  - 'searchPrompt' MUST be a single simple noun (e.g. 'sofa', 'tv', 'chair'). Never use spatial words.
  - 'replacementPrompt': If a furniture reference image is attached, describe THAT exact item's color, material, shape and style. Do NOT invent a generic item.
  - If the user provides an edit instruction, use it to identify the searchPrompt target noun exactly.

`;

const TGM_SYSTEM_PROMPT = `You are an expert tile, granite and marble visualizer and AI image-editing prompt engineer.
You receive a room or countertop photo and optionally a surface-material reference. Analyze the image precisely and return ONLY valid JSON.
The goal is material replacement in-place: floor tiles, a feature wall, backsplash, staircase treads, a countertop, vanity top or wall cladding. Preserve the room geometry, furniture, fixtures, lighting, perspective, grout scale and all non-target surfaces.
Return this exact shape:
{"roomType":"Living Room | Kitchen | Bathroom | Staircase | Exterior | Commercial","targetSurface":"floor | wall | countertop | backsplash | staircase | vanity","currentStyle":"style","colorPalette":["#hex1","#hex2","#hex3"],"searchPrompt":"floor | wall | countertop | backsplash | staircase","replacementPrompt":"precise stone/tile material description including color, vein, finish, tile size or slab finish; photorealistic, preserve geometry and perspective","recommendations":[{"category":"Vitrified Tiles | Wall Tiles | Granite Slabs | Marble Slabs | Engineered Quartz","suggestedStyle":"style","suggestedColor":"color","suggestedMaterial":"material","reason":"reason","priority":"High"}],"designTips":["tip1","tip2"],"overallAssessment":"assessment"}
Rules: searchPrompt is the target surface, never furniture. For natural stone mention that final shade and vein must be approved from the actual lot/slab. Do not invent a price or claim stock availability.`;

const SYSTEM_PROMPT = IS_TGM ? TGM_SYSTEM_PROMPT : FURNITURE_SYSTEM_PROMPT;

function matchProducts(recommendations) {
  return recommendations.map(rec => {
    // Score each product based on how well it matches the recommendation
    const scored = PRODUCTS.map(product => {
      let score = 0;
      
      // Category match (highest weight)
      if (product.category.toLowerCase() === rec.category.toLowerCase()) score += 50;
      // Partial category match
      if (product.category.toLowerCase().includes(rec.category.toLowerCase()) || 
          rec.category.toLowerCase().includes(product.category.toLowerCase())) score += 30;
      
      // Color match
      const recColor = (rec.suggestedColor || '').toLowerCase();
      const prodColor = product.color.toLowerCase();
      if (prodColor.includes(recColor) || recColor.includes(prodColor)) score += 25;
      // Partial color family matching
      const colorFamilies = {
        brown: ['walnut', 'brown', 'honey', 'oak', 'tan', 'dark brown'],
        white: ['white', 'ivory', 'cream', 'clear', 'white glossy'],
        black: ['black', 'charcoal', 'dark'],
        blue: ['blue', 'navy', 'navy blue', 'teal'],
        green: ['green', 'emerald', 'sage', 'emerald green'],
        grey: ['grey', 'gray', 'silver'],
        yellow: ['yellow', 'mustard', 'gold', 'mustard yellow'],
        natural: ['natural', 'beige', 'bamboo'],
      };
      for (const [, family] of Object.entries(colorFamilies)) {
        if (family.some(c => recColor.includes(c)) && family.some(c => prodColor.includes(c))) {
          score += 15;
          break;
        }
      }
      
      // Material match
      const recMaterial = (rec.suggestedMaterial || '').toLowerCase();
      const prodMaterial = product.material.toLowerCase();
      if (prodMaterial.includes(recMaterial) || recMaterial.includes(prodMaterial)) score += 20;
      // Material family matching
      const materialFamilies = {
        wood: ['wood', 'sheesham', 'teak', 'pine', 'oak', 'bamboo', 'plywood'],
        metal: ['metal', 'steel', 'iron'],
        fabric: ['fabric', 'velvet', 'mesh', 'cotton', 'linen'],
        leather: ['leather', 'leatherette', 'pu leather'],
        engineered: ['engineered', 'mdf', 'laminate'],
      };
      for (const [, family] of Object.entries(materialFamilies)) {
        if (family.some(m => recMaterial.includes(m)) && family.some(m => prodMaterial.includes(m))) {
          score += 10;
          break;
        }
      }

      // In-stock bonus
      if (product.stock > 0) score += 5;
      // Popular bonus
      if (product.sold > 25) score += 3;

      return { ...product, matchScore: score };
    });

    // Get top matches (score > 20, sorted by score)
    const matches = scored
      .filter(p => p.matchScore > 20)
      .sort((a, b) => b.matchScore - a.matchScore)
      .slice(0, 3);

    return {
      ...rec,
      matchedProducts: matches,
    };
  });
}

const DEMO_RESPONSE = {
  roomType: "Living Room",
  dimensions: "Medium",
  currentStyle: "Modern Minimalist",
  colorPalette: ["#2C3E50", "#ECF0F1", "#BDC3C7", "#F5E6CC"],
  existingFurniture: ["Wall-mounted TV", "Basic curtains", "Floor lamp"],
  recommendations: [
    { category: "Sofas", suggestedStyle: "Contemporary", suggestedColor: "Grey", suggestedMaterial: "Fabric", reason: "A neutral grey sofa would anchor the living space and complement the minimalist aesthetic.", priority: "High" },
    { category: "Living Room", suggestedStyle: "Modern", suggestedColor: "Walnut", suggestedMaterial: "Engineered Wood", reason: "A sleek TV unit would organize the entertainment area and add warmth with walnut tones.", priority: "High" },
    { category: "Living Room", suggestedStyle: "Modern", suggestedColor: "Clear", suggestedMaterial: "Glass + Metal", reason: "A glass center table would maintain the open, airy feel while being functional.", priority: "Medium" },
    { category: "Storage", suggestedStyle: "Contemporary", suggestedColor: "Honey", suggestedMaterial: "Sheesham Wood", reason: "A bookshelf would add personality and vertical interest to the room.", priority: "Medium" },
    { category: "Chairs", suggestedStyle: "Modern", suggestedColor: "Mustard Yellow", suggestedMaterial: "Fabric + Wood", reason: "An accent chair in mustard would add a pop of color against the neutral palette.", priority: "Low" },
  ],
  designTips: [
    "Add layered lighting — combine floor lamps with warm wall sconces for depth",
    "Introduce textile elements like throw cushions and a rug for warmth",
    "Consider a large-format artwork above the sofa as a focal point"
  ],
  overallAssessment: "This is a well-proportioned modern living room with good natural light. The neutral color palette provides an excellent canvas for adding furniture pieces that bring warmth and character. Focus on creating distinct zones — seating, entertainment, and reading."
};

function getDemoResponse(reason, targetSurface = 'countertop') {
  const demoAnalysis = IS_TGM ? {
    roomType: 'Kitchen',
    targetSurface,
    currentStyle: 'Contemporary',
    colorPalette: ['#E8E5DF', '#3D3D3D', '#A58B72'],
    recommendations: [{ category: 'Granite Slabs', suggestedStyle: 'Polished', suggestedColor: 'Black / Gold Fleck', suggestedMaterial: 'Granite', reason: 'A polished dark granite creates a durable contrast while retaining the room geometry.', priority: 'High' }],
    designTips: ['Confirm the actual lot and slab vein before cutting.', 'Template sink and hob cutouts after cabinets are installed.'],
    overallAssessment: 'Use the visual as a design reference, then approve the physical lot and measured slab for the final fabrication job.',
  } : DEMO_RESPONSE;
  return NextResponse.json({
    success: true,
    isDemo: true,
    demoReason: reason,
    analysis: {
      ...demoAnalysis,
      recommendations: matchProducts(demoAnalysis.recommendations),
    },
  });
}

function isConfiguredKey(value) {
  const key = String(value || '').trim();
  return Boolean(key) && !/^replace-with-/i.test(key) && !/^your[-_ ]/i.test(key);
}

function parseJsonObject(text) {
  const cleanText = String(text || '')
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '');
  const start = cleanText.indexOf('{');
  const end = cleanText.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('Vision model did not return a JSON object');
  return JSON.parse(cleanText.slice(start, end + 1));
}

function getInlineImageParts(imageDataUrl) {
  const match = String(imageDataUrl || '').match(/^data:([^;]+);base64,(.+)$/s);
  if (!match) throw new Error('Invalid image data supplied to vision model');
  return { mimeType: match[1], data: match[2] };
}

async function callGeminiVision(apiKey, prompt, imageDataUrl) {
  const image = getInlineImageParts(imageDataUrl);
  const models = [process.env.GEMINI_VISION_MODEL || 'gemini-2.5-flash', 'gemini-2.0-flash'];
  let lastError = null;

  for (const model of [...new Set(models)]) {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        contents: [{ parts: [
          { text: prompt },
          { inline_data: { mime_type: image.mimeType, data: image.data } },
        ] }],
        generationConfig: { temperature: 0.2, responseMimeType: 'application/json' },
      }),
    });

    if (response.status === 404) continue;
    if (!response.ok) {
      lastError = new Error(`Gemini vision API failed: ${response.status} — ${await response.text()}`);
      continue;
    }

    const payload = await response.json();
    const text = payload?.candidates?.[0]?.content?.parts?.find(part => part.text)?.text;
    return parseJsonObject(text);
  }

  throw lastError || new Error('No supported Gemini vision model was available');
}

async function callNvidiaVision(apiKey, prompt, imageDataUrl) {
  const response = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: process.env.NVIDIA_VISION_MODEL || 'meta/llama-3.2-90b-vision-instruct',
      messages: [{ role: 'user', content: [
        { type: 'text', text: `${prompt}\nReturn only a valid JSON object.` },
        { type: 'image_url', image_url: { url: imageDataUrl } },
      ] }],
      temperature: 0.2,
      max_tokens: 1800,
    }),
  });

  if (!response.ok) throw new Error(`NVIDIA vision API failed: ${response.status} — ${await response.text()}`);
  const payload = await response.json();
  const text = payload?.choices?.[0]?.message?.content;
  return parseJsonObject(text);
}

async function analyzeRoomWithVision(apiKey, systemPrompt, editInstruction, imageDataUrl, referenceSummary = '', targetSurface = '') {
  const prompt = `${systemPrompt}
Selected target surface: ${targetSurface || (IS_TGM ? 'countertop' : 'furniture')}
User instruction: ${editInstruction || 'Recommend the best suitable design for this space.'}
${referenceSummary ? `Reference material description: ${referenceSummary}` : ''}`;
  const geminiKey = process.env.GEMINI_API_KEY;
  if (isConfiguredKey(geminiKey) && apiKey === geminiKey) return callGeminiVision(apiKey, prompt, imageDataUrl);
  return callNvidiaVision(apiKey, prompt, imageDataUrl);
}

async function summarizeFurnitureReference(apiKey, mimeType, base64, visionProvider = 'nvidia') {
  const prompt = IS_TGM
    ? 'Inspect this tile, granite, marble or quartz reference. Return JSON with one replacementPrompt field describing its color, vein, finish, tile size or slab thickness, and a second field description with a concise material description. Do not invent brand, price or stock.'
    : 'Inspect this furniture reference. Return JSON with one replacementPrompt field describing the exact color, material, silhouette, upholstery and size cues, and a second field description with a concise item description.';
  const imageDataUrl = `data:${mimeType};base64,${base64}`;
  const result = visionProvider === 'gemini'
    ? await callGeminiVision(apiKey, prompt, imageDataUrl)
    : await callNvidiaVision(apiKey, prompt, imageDataUrl);
  return result.replacementPrompt || result.description || '';
}

async function generateStabilitySearchReplace(roomImageBuffer, roomMimeType, searchPrompt, replacementPrompt, returnBuffer = false, isStep2 = false, maskBuffer = null, maskMimeType = 'image/png') {
  const apiKey = process.env.STABILITY_API_KEY;
  if (!apiKey) {
    throw new Error('STABILITY_API_KEY is not configured');
  }

  const apiUrl = 'https://api.stability.ai/v2beta/stable-image/edit/search-and-replace';

  // Build multipart/form-data manually using a Blob-based FormData
  const formData = new FormData();
  
  // The room image as a file blob
  const imageBlob = new Blob([roomImageBuffer], { type: roomMimeType || 'image/jpeg' });
  const extension = (roomMimeType || 'image/jpeg').split('/')[1] || 'jpeg';
  formData.append('image', imageBlob, `room.${extension}`);

  // A manually supplied mask is more precise than text search for complex
  // rooms. White pixels identify the surface to replace; black pixels remain.
  if (maskBuffer) {
    formData.append('mask', new Blob([maskBuffer], { type: maskMimeType }), 'surface-mask.png');
  }
  
  // The search prompt (what to find in the image)
  formData.append('search_prompt', searchPrompt);

  // The replacement prompt (what to put in its place)
  formData.append('prompt', replacementPrompt);

  // Negative prompt: discourage common artifacts
  formData.append('negative_prompt', IS_TGM
    ? 'duplicate surfaces, distorted grout, broken tile edges, warped slab, floating material, wrong color, different color, blurry, unrealistic, cartoon, illustration, painting, sketch'
    : 'duplicate objects, two sofas, multiple items, distorted proportions, floating furniture, wrong color, different color, blurry, unrealistic, cartoon, illustration, painting, sketch');

  // grow_mask expands the bounding box so a larger replacement fits without clipping
  if (!isStep2) {
    formData.append('grow_mask', '15');
  }
  // Output format
  formData.append('output_format', 'webp');

  console.log('[Stability API] Search prompt:', searchPrompt);
  console.log('[Stability API] Replacement prompt:', replacementPrompt);

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Accept': 'image/*',
    },
    body: formData,
  });

  if (!response.ok) {
    const errBody = await response.text();
    console.error('Stability API Error:', response.status, errBody);
    throw new Error(`Stability API failed: ${response.status} — ${errBody}`);
  }

  // The API returns raw image bytes when Accept: image/*
  const imageArrayBuffer = await response.arrayBuffer();
  
  if (returnBuffer) {
    return Buffer.from(imageArrayBuffer);
  }

  const base64 = Buffer.from(imageArrayBuffer).toString('base64');
  return `data:image/webp;base64,${base64}`;
}

// Sends the room plus an optional material reference directly to Gemini.
async function editRoomWithGemini(geminiApiKey, roomBuffer, furnitureBuffer, furnitureMime, editInstruction) {
  const roomB64 = roomBuffer.toString('base64');
  const furnitureB64 = furnitureBuffer.toString('base64');

  const instruction = IS_TGM
    ? `You are an expert surface-material visualizer.

Task: "${editInstruction || 'Replace the specified target surface using Image 2'}"

Image 1 is the room/site to edit. Image 2 is the exact tile, granite, marble or quartz reference.
Replace ONLY the requested surface (floor, wall, countertop, backsplash, staircase or vanity) using Image 2. Keep all furniture, fixtures, geometry, grout scale, edges, lighting, perspective and non-target surfaces unchanged. Make the finish, vein direction and tile/slab scale physically believable. Output only the edited room image, nothing else.`
    : editInstruction?.trim()
    ? `You are an expert interior designer and image editor.

Task: "${editInstruction}"

Image 1 is the room to edit. Image 2 is the exact furniture item to place into the room.

Rules:
- Replace ONLY the target item in the room with the furniture from Image 2.
- The placed furniture MUST match Image 2 exactly: same color, shape, style, upholstery, and legs.
- Preserve everything else in the room exactly as-is: walls, floor, ceiling, lighting, windows, curtains, rug, table, and all other objects.
- Match the room's perspective and lighting for the placed furniture so it looks natural.
- Output only the edited room image, nothing else.`
    : `Image 1 is a room. Image 2 is a furniture item. Place the furniture from Image 2 into the room. Keep everything else unchanged.`;

  const body = {
    contents: [{ parts: [
      { text: instruction },
      { inline_data: { mime_type: 'image/jpeg', data: roomB64 } },
      { inline_data: { mime_type: furnitureMime,  data: furnitureB64 } }
    ]}],
    generationConfig: { responseModalities: ['IMAGE', 'TEXT'] }
  };

  // Verified available models (checked via ListModels API 2026-03-20)
  const GEMINI_IMAGE_MODELS = [
    'gemini-2.5-flash-image',
    'gemini-3.1-flash-image-preview',
    'gemini-3-pro-image-preview',
  ];

  for (const model of GEMINI_IMAGE_MODELS) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiApiKey}`;
    console.log(`[Gemini] Trying model: ${model}`);

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    if (response.status === 404) {
      console.warn(`[Gemini] Model ${model} not found, trying next...`);
      continue;
    }

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Gemini API error (${model}): ${response.status} - ${errText}`);
    }

    const data = await response.json();
    const parts = data?.candidates?.[0]?.content?.parts || [];
    const imagePart = parts.find(p => p.inlineData?.mimeType?.startsWith('image/'));

    if (!imagePart) {
      const textPart = parts.find(p => p.text);
      throw new Error(`Gemini (${model}) returned no image. Response: ${textPart?.text || JSON.stringify(data).slice(0, 300)}`);
    }

    console.log(`[Gemini] Success with model: ${model}`);
    return `data:${imagePart.inlineData.mimeType};base64,${imagePart.inlineData.data}`;
  }

  throw new Error('All Gemini image models failed or were not found for this API key.');
}

export async function POST(request) {
  try {
    const formData = await request.formData();
    const editInstruction = String(formData.get('editInstruction') || '').trim();
    const requestedTarget = String(formData.get('visualizationTarget') || (IS_TGM ? 'countertop' : 'furniture')).trim().toLowerCase();
    const targetSurface = IS_TGM
      ? ['floor', 'wall', 'countertop', 'backsplash', 'staircase', 'vanity'].includes(requestedTarget) ? requestedTarget : 'countertop'
      : 'furniture';

    // Extract base room image separately (we need its raw bytes for Stability API)
    let roomImageBuffer = null;
    let roomMimeType = 'image/jpeg';
    const kimiImages = [];
    const furnitureReferences = [];
    let surfaceMaskBuffer = null;

    for (const [key, val] of formData.entries()) {
      if (key === 'roomImage' && val instanceof Blob) {
        const bytes = await val.arrayBuffer();
        
        // Resize very large room images down to max 1280x1280 to save Stability API tokens/prevent 400 errors
        const originalBuffer = Buffer.from(bytes);
        roomImageBuffer = await sharp(originalBuffer)
          .resize(1280, 1280, { fit: 'inside', withoutEnlargement: true })
          .jpeg({ quality: 90 })
          .toBuffer();
          
        roomMimeType = 'image/jpeg';
        kimiImages.push(`data:${roomMimeType};base64,${roomImageBuffer.toString('base64')}`);
      } else if ((key.startsWith('furniture_') || key.startsWith('surface_')) && val instanceof Blob) {
        const bytes = await val.arrayBuffer();
        
        // Resize furniture references well under 1024x1024 to save Kimi payload
        const originalBuffer = Buffer.from(bytes);
        const resizedFurnitureBuffer = await sharp(originalBuffer)
          .resize(1024, 1024, { fit: 'inside', withoutEnlargement: true })
          .jpeg({ quality: 85 })
          .toBuffer();
          
        const mime = 'image/jpeg';
        const b64 = resizedFurnitureBuffer.toString('base64');
        kimiImages.push(`data:${mime};base64,${b64}`);
        furnitureReferences.push({ mime, b64 });
      } else if (key === 'surfaceMask' && val instanceof Blob) {
        const bytes = await val.arrayBuffer();
        surfaceMaskBuffer = await sharp(Buffer.from(bytes))
          .resize(1280, 1280, { fit: 'inside', withoutEnlargement: true })
          .grayscale()
          .png()
          .toBuffer();
      }
    }

    if (!roomImageBuffer) {
      return NextResponse.json({ success: false, error: 'No room image uploaded' }, { status: 400 });
    }

    const geminiApiKey = isConfiguredKey(process.env.GEMINI_API_KEY) ? process.env.GEMINI_API_KEY.trim() : '';
    const nvidiaApiKey = isConfiguredKey(process.env.NVIDIA_API_KEY) ? process.env.NVIDIA_API_KEY.trim() : '';
    const stabilityConfigured = isConfiguredKey(process.env.STABILITY_API_KEY);
    const visionApiKey = geminiApiKey || nvidiaApiKey;
    const visionProvider = geminiApiKey ? 'gemini' : 'nvidia';
    const hasFurniture = furnitureReferences.length > 0;

    if (!visionApiKey && !stabilityConfigured) {
      return getDemoResponse('No live AI keys configured', targetSurface);
    }

    // ── PATH A: Furniture uploaded + Gemini key → send both images directly to Gemini ──
    // Gemini SEES the actual furniture image and edits the room. No text description needed.
    // ── PATH B: No furniture or no Gemini key → Stability AI text-guided search-and-replace ──

    let analysis = null;
    let kimiErrorDetails = null;
    let stagedImageUrl = '';

    if (hasFurniture && geminiApiKey) {
      // PATH A — Gemini direct image editing
      console.log('[Pipeline] Using Gemini direct image editing...');
      try {
        const { mime: furnitureMime, b64: furnitureB64 } = furnitureReferences[0];
        const furnitureBuffer = Buffer.from(furnitureB64, 'base64');
        stagedImageUrl = await editRoomWithGemini(geminiApiKey, roomImageBuffer, furnitureBuffer, furnitureMime, editInstruction);
        console.log('[Gemini] Image editing succeeded.');
      } catch (geminiErr) {
        console.error('[Gemini] Failed:', geminiErr.message);
        return NextResponse.json({ success: false, error: `Gemini image editing failed: ${geminiErr.message}` }, { status: 500 });
      }

      // Still run room analysis for recommendations (room image only, no furniture description needed)
      try {
        analysis = await analyzeRoomWithVision(geminiApiKey, SYSTEM_PROMPT, editInstruction, kimiImages[0], '', targetSurface);
      } catch (e) {
        console.warn('[Vision Analysis] skipped:', e.message);
      }

    } else {
      // PATH B — Stability AI text-guided search-and-replace
      console.log('[Pipeline] Using Stability AI search-and-replace...');

      let furnitureReferenceSummary = '';
      if (hasFurniture && visionApiKey) {
        try {
          furnitureReferenceSummary = await summarizeFurnitureReference(visionApiKey, furnitureReferences[0].mime, furnitureReferences[0].b64, visionProvider);
          console.log('[Reference Vision Summary]:', furnitureReferenceSummary);
        } catch (e) {
          console.warn('[Reference Vision Summary] failed:', e.message);
        }
      }

      if (visionApiKey) {
        try {
          analysis = await analyzeRoomWithVision(visionApiKey, SYSTEM_PROMPT, editInstruction, kimiImages[0], furnitureReferenceSummary, targetSurface);
          console.log('[Vision Analysis] Result:', JSON.stringify(analysis, null, 2));
        } catch (modelError) {
          console.warn('[Vision Analysis] failed:', modelError.message);
          kimiErrorDetails = modelError.message;
        }
      }

      if (!analysis) {
        let fallbackSearchPrompt = IS_TGM ? 'floor' : 'furniture';
        const replaceMatch = editInstruction.match(/replace\s+(.+?)\s+with/i);
        if (replaceMatch) fallbackSearchPrompt = replaceMatch[1].trim();
        analysis = {
          searchPrompt: fallbackSearchPrompt,
          replacementPrompt: furnitureReferenceSummary || editInstruction || (IS_TGM ? 'premium natural stone surface' : 'modern stylish furniture'),
          recommendations: [IS_TGM ? { category: 'Granite Slabs', suggestedStyle: 'Polished', suggestedColor: 'Natural', suggestedMaterial: 'Granite', reason: 'Fallback surface recommendation', priority: 'High' } : { category: 'Sofas', suggestedStyle: 'Contemporary', suggestedColor: 'Blue', suggestedMaterial: 'Fabric', reason: 'Fallback', priority: 'High' }],
          roomType: IS_TGM ? 'Kitchen' : 'Living Room', currentStyle: 'Modern Minimalist',
          isKimiFallback: true, kimiFailureReason: kimiErrorDetails
        };
      }

      const searchPrompt = analysis.searchPrompt || (IS_TGM ? 'floor' : 'furniture');
      const furnitureDesc = furnitureReferenceSummary || analysis.replacementPrompt || (IS_TGM ? 'premium natural stone surface' : 'modern stylish furniture');
      const replacementPrompt = IS_TGM
        ? `${furnitureDesc}, replace only the target surface, preserve all geometry, seams, fixtures, perspective and lighting, photorealistic architectural photography`
        : `${furnitureDesc}, photorealistic, natural room lighting, seamless integration, interior design photography, single object`;
      console.log('[Stability] searchPrompt:', searchPrompt);
      console.log('[Stability] replacementPrompt:', replacementPrompt);

      if (stabilityConfigured) {
        try {
          stagedImageUrl = await generateStabilitySearchReplace(roomImageBuffer, roomMimeType, searchPrompt, replacementPrompt, false, false, surfaceMaskBuffer);
        } catch (stabilityErr) {
          console.error('Stability API failed:', stabilityErr);
          return NextResponse.json({ success: false, error: stabilityErr.message || 'Stability API failed' }, { status: 500 });
        }
      }
    }

    // Ensure analysis is never null before returning
    if (!analysis) {
      analysis = {
        roomType: IS_TGM ? 'Kitchen' : 'Living Room', currentStyle: 'Modern',
        recommendations: [IS_TGM ? { category: 'Granite Slabs', suggestedStyle: 'Polished', suggestedColor: 'Natural', suggestedMaterial: 'Granite', reason: 'AI staged surface', priority: 'High' } : { category: 'Sofas', suggestedStyle: 'Contemporary', suggestedColor: 'Blue', suggestedMaterial: 'Fabric', reason: 'AI staged room', priority: 'High' }]
      };
    }
    if (!Array.isArray(analysis.recommendations) || analysis.recommendations.length === 0) {
      analysis.recommendations = [IS_TGM ? { category: 'Granite Slabs', suggestedStyle: 'Polished', suggestedColor: 'Natural', suggestedMaterial: 'Granite', reason: 'Default surface recommendation', priority: 'High' } : { category: 'Sofas', suggestedStyle: 'Contemporary', suggestedColor: 'Blue', suggestedMaterial: 'Fabric', reason: 'Default', priority: 'High' }];
    }
    analysis.targetSurface = IS_TGM ? (analysis.targetSurface || targetSurface) : analysis.targetSurface;
    analysis.recommendations = matchProducts(analysis.recommendations);

    return NextResponse.json({
      success: true,
      isDemo: false,
      renderingAvailable: Boolean(stagedImageUrl),
      renderingProvider: stagedImageUrl ? (hasFurniture && geminiApiKey ? 'gemini' : 'stability') : null,
      stagedImage: stagedImageUrl,
      analysis
    });

  } catch (error) {
    console.error('Recommendation API error:', error);

    // If it's still a rate limit that slipped through, return demo
    if (error.message?.includes('429') || error.message?.includes('quota') || error.message?.includes('fetch failed')) {
      return getDemoResponse('API quota exceeded — showing demo results. Try again later or upgrade your plan.');
    }

    return NextResponse.json(
      { success: false, error: error.message || 'Failed to analyze image' },
      { status: 500 }
    );
  }
}

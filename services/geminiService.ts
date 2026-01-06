
import { GoogleGenAI, Type } from "@google/genai";

// Always use process.env.API_KEY directly for initialization
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const getFragranceInsights = async (query: string) => {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: query,
      config: {
        systemInstruction: `You are an expert perfume consultant and pricing assistant. 
        The user uses a calculator with these parameters:
        - Gross Weight Deduction: 136g (standard bottle weight).
        - Price per net gram/ml: 230 TSh.
        Provide brief, helpful answers about perfume measurements, densities, and pricing logic in Tanzania. 
        Keep responses concise and elegant.`,
      },
    });
    return response.text || "I'm sorry, I couldn't process that request.";
  } catch (error) {
    console.error("Gemini API Error:", error);
    return "Error: Could not connect to the fragrance assistant.";
  }
};

export const analyzePerfumeScaleImage = async (base64Image: string) => {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: {
        parts: [
          { inlineData: { data: base64Image, mimeType: 'image/jpeg' } },
          { text: "Read the weight displayed on this scale. Return only the numeric value in grams. If the display shows something like '1.234 kg', return '1234'. If no scale is visible, say '0'." }
        ]
      }
    });
    const text = response.text || '0';
    const match = text.match(/\d+(\.\d+)?/);
    return match ? parseFloat(match[0]) : 0;
  } catch (error) {
    console.error("Gemini Vision Error:", error);
    return 0;
  }
};

export interface BatchItem {
  name: string;
  weight: number;
}

export const analyzeBatchDocument = async (base64Image: string): Promise<BatchItem[]> => {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: {
        parts: [
          { inlineData: { data: base64Image, mimeType: 'image/jpeg' } },
          { text: "Extract all items from this document. Each item usually has a perfume name and a weight. Pay close attention to lab notation like '1kg136' (1136g). Return a JSON array of objects with 'name' and 'weight' (in grams). Example: [{\"name\": \"Sauvage Dior\", \"weight\": 1050}, {\"name\": \"Blue de Chanel\", \"weight\": 1136}]. If no name is found, use 'Item #'. If no weights found, return []." }
        ]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              name: { type: Type.STRING },
              weight: { type: Type.NUMBER }
            },
            required: ["name", "weight"]
          }
        }
      }
    });
    return JSON.parse(response.text || "[]") as BatchItem[];
  } catch (error) {
    console.error("Batch Document Error:", error);
    return [];
  }
};

import { GoogleGenerativeAI } from "@google/generative-ai";
import type { VercelRequest, VercelResponse } from "@vercel/node";

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Only POST allowed" });
  }

  try {
    const { topic, skill, count } = req.body;

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

    const model = genAI.getGenerativeModel({
      model: "gemini-1.5-flash",
    });

    const result = await model.generateContent(
      `Generate ${count} ${skill} level MCQ questions on ${topic}.
Each question must have exactly 4 options and one correct answer.
Return JSON only.`
    );

    res.status(200).json({
      result: result.response.text(),
    });
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
}

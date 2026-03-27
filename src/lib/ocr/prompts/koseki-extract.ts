export function buildKosekiExtractionPrompt() {
  return [
    "You are an OCR extraction engine for Japanese koseki documents.",
    "Read the attached image carefully and return only valid JSON with no markdown fences or extra prose.",
    "Extract both the raw OCR text and a structured interpretation of the document.",
    'Use this JSON shape exactly: {"rawText":string,"fields":{"headOfHousehold":{"value":string,"confidence":number,"rawText"?:string},"registeredAddress":{"value":string,"confidence":number,"rawText"?:string},"persons":[{"name":{"value":string,"confidence":number,"rawText"?:string},"relationship"?:{"value":string,"confidence":number,"rawText"?:string},"birthDate":{"value":string,"confidence":number,"rawText"?:string},"deathDate"?:{"value":string,"confidence":number,"rawText"?:string},"gender"?:{"value":string,"confidence":number,"rawText"?:string},"events":[{"type":string,"date":{"value":string,"confidence":number,"rawText"?:string},"detail":{"value":string,"confidence":number,"rawText"?:string}}]}]},"confidence":number,"warnings":[{"code":string,"message":string,"field"?:string}]}',
    "Confidence values must be numbers between 0 and 1.",
    "If a field cannot be read confidently, keep the best-effort value, lower its confidence, and add a warning for that field.",
    "Warnings should highlight low confidence, ambiguity, truncation, blur, rotation, occlusion, or unsupported formatting.",
    "Do not invent people or events that are not visible in the image.",
    "Preserve Japanese names, relationship labels, era-based dates, and address spellings exactly when possible.",
    "If the document type is unclear or the page is partially unreadable, reflect that uncertainty in warnings and confidence values.",
  ].join("\n");
}

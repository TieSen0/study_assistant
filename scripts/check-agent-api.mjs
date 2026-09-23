import assert from "node:assert/strict";

// Run only against the local preview. Fixtures never enter the hosted library.
const origin = process.argv[2] || "http://localhost:5173";
assert.ok(["localhost", "127.0.0.1"].includes(new URL(origin).hostname));
const keep = process.argv.includes("--keep");
const documents = [];
let checks = 0;
async function call(path, options = {}, expected = 200) {
  const response = await fetch(new URL(path, origin), options);
  const payload = await response.text();
  assert.ok(payload, `Empty response from ${options.method || "GET"} ${path}`);
  const value = JSON.parse(payload);
  assert.equal(response.status, expected, JSON.stringify(value));
  checks++;
  return value;
}
const json = (method, body) => ({ method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

// A three-page PDF fixture with real page boundaries and a text layer.
function fixturePdf() {
  const objects = ["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [4 0 R 6 0 R 8 0 R] /Count 3 >>", "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"];
  for (let page = 1; page <= 3; page++) {
    const text = `BT /F1 24 Tf 60 700 Td (Citation test - page ${page}) Tj ET`;
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5 + (page - 1) * 2} 0 R >>`, `<< /Length ${text.length} >>\nstream\n${text}\nendstream`);
  }
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => { offsets.push(Buffer.byteLength(pdf)); pdf += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("");
  return pdf + `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
}

try {
  for (const name of ["A", "B"]) {
    const form = new FormData();
    form.set("file", new File([fixturePdf()], `QA-Citation-${name}.pdf`, { type: "application/pdf" }));
    form.set("pages", JSON.stringify([1, 2, 3].map((pageNumber) => ({ pageNumber, content: `Citation test - page ${pageNumber}. Source material for document ${name}.` }))));
    const data = await call("/api/documents", { method: "POST", body: form }, 201);
    documents.push(data.document.id);
  }
  const [a, b] = documents.map((id) => `/api/documents/${id}/agent`);
  const question = { id: crypto.randomUUID(), content: "Why does page two make this claim?", contextPage: 2, sourceQuote: "Citation test - page 2" };
  const saved = await call(a, json("POST", question), 201);
  assert.equal(saved.message.context_kind, "selection");
  assert.equal(saved.message.source_quote, question.sourceQuote);
  assert.equal(saved.message.parent_message_id, null);
  assert.equal((await call(a, json("POST", question), 201)).message.id, saved.message.id);
  assert.equal((await call(a)).messages.length, 1, "Retry must not duplicate the question");
  assert.equal((await call(b)).messages.length, 0);
  await call(b, json("PATCH", question), 404);
  await call(b, json("DELETE", { id: question.id }));
  assert.equal((await call(a)).messages.length, 1, "Other document must not delete this question");
  const edited = { ...question, content: "Updated question", contextPage: 3, sourceQuote: "Citation test - page 3" };
  await call(a, json("PATCH", edited));
  assert.equal((await call(a)).messages[0].context_page, 3);
  const answer = { id: crypto.randomUUID(), role: "assistant", parentMessageId: question.id, content: "这是从外部聊天粘贴回 Lens 的回答。" };
  const savedAnswer = await call(a, json("POST", answer), 201);
  assert.equal(savedAnswer.message.role, "assistant");
  assert.equal(savedAnswer.message.parent_message_id, question.id);
  await call(b, json("POST", answer), 404);
  await call(a, json("POST", { ...answer, id: crypto.randomUUID(), parentMessageId: "missing-question" }), 404);
  await call(a, json("POST", { ...answer, id: crypto.randomUUID(), content: " " }), 400);
  await call(a, json("POST", { ...question, id: crypto.randomUUID(), content: "Whole document question", contextPage: null, sourceQuote: "" }), 201);
  const whole = (await call(a)).messages.find((message) => message.context_page === null);
  assert.equal(whole.context_kind, "document");
  for (const page of [0, 4, 1.5, "2", true, [1]]) await call(a, json("POST", { ...question, contextPage: page }), 400);
  for (const body of [null, [], {}, { ...question, content: " " }, { ...question, content: "x".repeat(8001) }, { ...question, sourceQuote: "x".repeat(4001) }, { ...question, contextPage: null }, { ...question, sourceQuote: 12 }]) await call(a, json("POST", body), 400);
  await call(a, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{" }, 400);
  await call("/api/documents/does-not-exist/agent", {}, 404);
  await call(a, json("DELETE", { id: question.id }));
  assert.equal((await call(a)).messages.length, 1, "Deleting a question must remove its imported answer");
  await call(a, json("DELETE", { id: whole.id }));
  assert.equal((await call(a)).messages.length, 0);
  console.log(`PASS: ${checks} local API checks (persistence, retry, isolation, edits, deletion, validation).`);
  if (keep) console.log(JSON.stringify({ fixtures: documents }));
} finally {
  if (!keep) for (const id of documents) await call(`/api/documents/${id}`, { method: "DELETE" });
}

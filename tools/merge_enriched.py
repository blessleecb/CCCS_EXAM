import json, glob, sys
from collections import Counter

BASE = r"D:\OneDrive - Pentalink\claude\CCCS\tools\questions.json"
ENRICHED_GLOB = r"D:\OneDrive - Pentalink\claude\CCCS\tools\enriched\batch_*.json"
OUT_JSON = r"D:\OneDrive - Pentalink\claude\CCCS\tools\questions_full.json"
OUT_JS = r"D:\OneDrive - Pentalink\claude\CCCS\questions.js"

base = json.load(open(BASE, encoding="utf-8"))
by_id = {q["id"]: q for q in base}

enriched = {}
files = sorted(glob.glob(ENRICHED_GLOB))
print("enriched files found:", len(files))
for fp in files:
    data = json.load(open(fp, encoding="utf-8"))
    for item in data:
        enriched[item["id"]] = item

missing = [qid for qid in by_id if qid not in enriched]
print("missing enrichment for ids:", missing)

merged = []
for qid, q in sorted(by_id.items()):
    e = enriched.get(qid, {})
    merged.append({
        "id": qid,
        "question": q["question"],
        "options": q["options"],
        "answer": q["answer"],
        "explanation_en": q["explanation"],
        "explanation_ko": e.get("explanation_ko", ""),
        "kw_q": e.get("kw_q", ""),
        "kw_a": e.get("kw_a", ""),
    })

# sanity checks
empty_kwq = [m["id"] for m in merged if not m["kw_q"]]
empty_kwa = [m["id"] for m in merged if not m["kw_a"]]
print("empty kw_q:", empty_kwq)
print("empty kw_a:", empty_kwa)

kwq_counter = Counter(m["kw_q"].strip().lower() for m in merged if m["kw_q"])
kwa_counter = Counter(m["kw_a"].strip().lower() for m in merged if m["kw_a"])
dup_kwq = {k: v for k, v in kwq_counter.items() if v > 1}
dup_kwa = {k: v for k, v in kwa_counter.items() if v > 1}
print("duplicate kw_q count:", len(dup_kwq))
print("duplicate kw_a count:", len(dup_kwa))
if dup_kwq:
    print("--- duplicate kw_q values ---")
    for k, v in sorted(dup_kwq.items(), key=lambda x: -x[1]):
        ids = [m["id"] for m in merged if m["kw_q"].strip().lower() == k]
        print(f"  '{k}' x{v} -> ids {ids}")

with open(OUT_JSON, "w", encoding="utf-8") as f:
    json.dump(merged, f, ensure_ascii=False, indent=2)

js = "const QUESTIONS = " + json.dumps(merged, ensure_ascii=False) + ";\n"
with open(OUT_JS, "w", encoding="utf-8") as f:
    f.write(js)

print("Done. Total:", len(merged))

import re, json, sys

SRC = r"D:\OneDrive - Pentalink\claude\CCCS\_raw_extract.txt"
OUT = r"D:\OneDrive - Pentalink\claude\CCCS\questions.json"

text = open(SRC, encoding="utf-8").read()

# strip footer noise from the PDF export
text = re.sub(r"IT Certification Guaranteed, The Easy Way!\n?\d*\n?", "\n", text)

# split into per-question blocks using "NO.<n>" markers
parts = re.split(r"(?=NO\.\d+\s)", text)
blocks = [p for p in parts if re.match(r"^NO\.\d+\s", p)]

OPTION_RE = re.compile(r"^([A-H])\.\s", re.M)

questions = []
for block in blocks:
    m = re.match(r"^NO\.(\d+)\s", block)
    qnum = int(m.group(1))
    rest = block[m.end():]

    # locate option start positions
    opt_matches = list(OPTION_RE.finditer(rest))
    if not opt_matches:
        print("WARN no options for", qnum, file=sys.stderr)
        continue

    question_text = rest[:opt_matches[0].start()].strip()
    question_text = re.sub(r"\s*\n\s*", " ", question_text).strip()

    # find Answer: marker to know where options end
    ans_m = re.search(r"\nAnswer:\s*([A-Za-z, ]+?)\s*\n", rest)
    if not ans_m:
        print("WARN no answer for", qnum, file=sys.stderr)
        continue

    options = {}
    for i, om in enumerate(opt_matches):
        letter = om.group(1)
        start = om.end()
        end = opt_matches[i+1].start() if i+1 < len(opt_matches) else ans_m.start()
        opt_text = rest[start:end].strip()
        opt_text = re.sub(r"\s*\n\s*", " ", opt_text).strip()
        options[letter] = opt_text

    answer_letters = sorted(set(re.findall(r"[A-H]", ans_m.group(1))))

    expl_start = ans_m.end()
    expl_m = re.search(r"Explanation:\s*", rest[expl_start:])
    if expl_m:
        explanation = rest[expl_start + expl_m.end():].strip()
    else:
        explanation = rest[expl_start:].strip()
    explanation = re.sub(r"\n{2,}", "\n\n", explanation).strip()

    questions.append({
        "id": qnum,
        "question": question_text,
        "options": options,
        "answer": answer_letters,
        "explanation": explanation,
    })

questions.sort(key=lambda q: q["id"])
print("Parsed:", len(questions))

ids = [q["id"] for q in questions]
missing = [i for i in range(1, 368) if i not in ids]
print("Missing ids:", missing)

with open(OUT, "w", encoding="utf-8") as f:
    json.dump(questions, f, ensure_ascii=False, indent=2)

import os
import json
import requests
from pathlib import Path
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from sentence_transformers import SentenceTransformer
import faiss
import numpy as np
from openai import OpenAI

DATA_PATH = Path("tafsir.jsonl")
EMBED_MODEL = "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"

app = FastAPI(title="Quran AI MVP")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

model = SentenceTransformer(EMBED_MODEL)
docs = []
index = None

def load_data():
    global docs, index
    docs = []
    if DATA_PATH.exists():
        for line in DATA_PATH.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line:
                docs.append(json.loads(line))
    if docs:
        texts = [
            f"{d.get('source','')} | {d.get('text','')}"
            for d in docs
        ]
        vecs = model.encode(texts, normalize_embeddings=True).astype("float32")
        index = faiss.IndexFlatIP(vecs.shape[1])
        index.add(vecs)

load_data()

class AskIn(BaseModel):
    question: str
    lang: str = "am"  # ar, en, am, om

SYSTEM_PROMPT = """
You are a careful Islamic studies assistant.
Answer ONLY using the provided tafsir/translation excerpts.
Do NOT invent Quran verses, hadith, or scholarly opinions.
If the excerpts are insufficient, say clearly that no verified source was found.
Always cite the source name and surah:ayah for each claim.
Never issue a fatwa. For personal religious rulings, advise consulting a qualified scholar.
Reply in the requested language: ar, en, am, or om.
"""

@app.post("/ask")
def ask(req: AskIn):
    if index is None or not docs:
        raise HTTPException(status_code=503, detail="Tafsir data not loaded.")
    qvec = model.encode([req.question], normalize_embeddings=True).astype("float32")
    scores, ids = index.search(qvec, 5)
    contexts = []
    for i in ids[0]:
        if i == -1:
            continue
        d = docs[int(i)]
        contexts.append(
            f"[{d.get('source','unknown')} | {d.get('surah')}:{d.get('ayah')}] {d.get('text','')}"
        )
    if not contexts:
        return {"answer": "በተረጋገጠ ምንጭ አልተገኘም።", "sources": []}

    context_text = "\n\n".join(contexts)
    user_prompt = f"""
Question: {req.question}
Requested language: {req.lang}

Verified excerpts:
{context_text}

Answer using only the excerpts above. Cite sources.
"""
    client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
    resp = client.chat.completions.create(
        model=os.getenv("OPENAI_MODEL", "gpt-4o-mini"),
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt},
        ],
        temperature=0.1,
    )
    answer = resp.choices[0].message.content
    return {"answer": answer, "sources": contexts}

@app.get("/mosques")
def mosques(lat: float, lon: float, radius: int = 3000):
    query = f"""
    [out:json][timeout:25];
    node["amenity"="place_of_worship"]["religion"="muslim"](around:{radius},{lat},{lon});
    out center;
    """
    r = requests.post(
        "https://overpass-api.de/api/interpreter",
        data={"data": query},
        headers={"User-Agent": "QuranAIMVP/1.0"},
        timeout=40,
    )
    r.raise_for_status()
    data = r.json()
    out = []
    for el in data.get("elements", []):
        tags = el.get("tags", {})
        out.append({
            "name": tags.get("name") or tags.get("name:en") or "Masjid",
            "lat": el.get("lat"),
            "lon": el.get("lon"),
            "tags": tags,
        })
    return {"mosques": out}

app.mount("/", StaticFiles(directory="static", html=True), name="static")

from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware

import fitz
import pytesseract
from PIL import Image

import edge_tts
from deep_translator import GoogleTranslator

import io
import os
import re
import time


# =========================================================
# FASTAPI
# =========================================================

app = FastAPI(title="SunoPDF API")


# =========================================================
# CORS
# =========================================================

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


# =========================================================
# TESSERACT
# =========================================================

pytesseract.pytesseract.tesseract_cmd = (
    r"C:\Program Files\Tesseract-OCR\tesseract.exe"
)


# =========================================================
# VOICE MAP
# =========================================================

VOICE_MAP = {
    "en": "en-US-AriaNeural",
    "hi": "hi-IN-SwaraNeural",
    "mr": "mr-IN-AarohiNeural"
}


# =========================================================
# LANGUAGE NAMES
# =========================================================

LANGUAGE_NAMES = {
    "en": "English",
    "hi": "Hindi",
    "mr": "Marathi"
}


# =========================================================
# AUDIO FILE
# =========================================================

AUDIO_FILE_PATH = "generated_audio.mp3"
"audio_url": f"/audio?v={version}"

# =========================================================
# HOME
# =========================================================

@app.get("/")
def home():
    return {
        "message": "Welcome to SunoPDF API"
    }


# =========================================================
# CLEAN TEXT
# =========================================================

def clean_text(text: str) -> str:

    # Remove excessive spaces
    text = re.sub(r"\s+", " ", text)

    # Remove weird control characters
    text = re.sub(r"[\x00-\x08\x0B\x0C\x0E-\x1F]", " ", text)

    return text.strip()


# =========================================================
# TRANSLATE TEXT
# =========================================================

def translate_text(text: str, language: str) -> str:

    if language == "en":
        return text

    if language not in ["hi", "mr"]:
        raise ValueError("Unsupported language")

    try:

        translator = GoogleTranslator(
            source="en",
            target=language
        )

        # Google Translator has limits, so translate chunks
        chunks = []

        sentences = re.split(
            r"(?<=[.!?।])\s+",
            text
        )

        current_chunk = ""

        for sentence in sentences:

            if len(current_chunk) + len(sentence) < 4000:
                current_chunk += " " + sentence

            else:
                chunks.append(current_chunk.strip())
                current_chunk = sentence

        if current_chunk.strip():
            chunks.append(current_chunk.strip())

        translated_parts = []

        for chunk in chunks:

            if not chunk.strip():
                continue

            translated = translator.translate(chunk)

            if translated:
                translated_parts.append(translated)

        translated_text = " ".join(translated_parts)

        return translated_text.strip()

    except Exception as e:

        print("TRANSLATION ERROR:", str(e))

        raise HTTPException(
            status_code=500,
            detail="Text translation failed: " + str(e)
        )


# =========================================================
# EXTRACT TEXT FROM PDF
# =========================================================

def extract_pdf_text(file_bytes: bytes) -> str:

    extracted_text = ""

    try:

        doc = fitz.open(
            stream=file_bytes,
            filetype="pdf"
        )

        # -----------------------------------------
        # FIRST TRY: NORMAL PDF TEXT
        # -----------------------------------------

        for page in doc:

            page_text = page.get_text("text")

            if page_text:
                extracted_text += page_text + "\n"

        # -----------------------------------------
        # SECOND TRY: OCR
        # IMPORTANT:
        # PDF SOURCE IS ENGLISH
        # SO OCR MUST USE "eng"
        # -----------------------------------------

        if not extracted_text.strip():

            print("Normal text not found.")
            print("Starting English OCR...")

            for page in doc:

                pix = page.get_pixmap(
                    matrix=fitz.Matrix(2, 2)
                )

                img_bytes = pix.tobytes("png")

                image = Image.open(
                    io.BytesIO(img_bytes)
                )

                # SOURCE PDF = ENGLISH
                ocr_text = pytesseract.image_to_string(
                    image,
                    lang="eng"
                )

                extracted_text += ocr_text + "\n"

        doc.close()

        return clean_text(extracted_text)

    except Exception as e:

        print("PDF EXTRACTION ERROR:", str(e))

        raise HTTPException(
            status_code=500,
            detail="PDF text extraction failed: " + str(e)
        )


# =========================================================
# UPLOAD
# =========================================================

@app.post("/upload")
async def upload_file(
    file: UploadFile = File(...),
    language: str = Form("en")
):

    try:

        print("\n===================================")
        print("NEW PDF REQUEST")
        print("===================================")

        print("File:", file.filename)
        print("Selected language:", language)

        # -----------------------------------------
        # VALIDATE LANGUAGE
        # -----------------------------------------

        if language not in ["en", "hi", "mr"]:

            raise HTTPException(
                status_code=400,
                detail="Unsupported language"
            )

        # -----------------------------------------
        # READ FILE
        # -----------------------------------------

        file_bytes = await file.read()

        if not file_bytes:

            raise HTTPException(
                status_code=400,
                detail="Empty file"
            )

        # -----------------------------------------
        # CHECK PDF
        # -----------------------------------------

        if not file.filename.lower().endswith(".pdf"):

            raise HTTPException(
                status_code=400,
                detail="Please upload a PDF file"
            )

        # -----------------------------------------
        # EXTRACT ENGLISH TEXT
        # -----------------------------------------

        original_text = extract_pdf_text(file_bytes)

        if not original_text:

            raise HTTPException(
                status_code=400,
                detail="PDF se readable text nahi mila."
            )

        # -----------------------------------------
        # LIMIT TEXT
        # -----------------------------------------

        original_text = original_text[:15000]

        print("\n===================================")
        print("ORIGINAL TEXT")
        print("===================================")

        print(original_text[:1000])

        # -----------------------------------------
        # TRANSLATION
        # -----------------------------------------

        translated_text = translate_text(
            original_text,
            language
        )

        if not translated_text:

            raise HTTPException(
                status_code=500,
                detail="Translation failed."
            )

        print("\n===================================")
        print("TRANSLATED TEXT")
        print("===================================")

        print(translated_text[:2000])

        # -----------------------------------------
        # SELECT VOICE
        # -----------------------------------------

        voice = VOICE_MAP[language]

        print("\n===================================")
        print("VOICE")
        print("===================================")

        print(voice)

        # -----------------------------------------
        # DELETE OLD AUDIO
        # -----------------------------------------

        if os.path.exists(AUDIO_FILE_PATH):

            try:
                os.remove(AUDIO_FILE_PATH)
            except:
                pass

        # -----------------------------------------
        # TEXT TO SPEECH
        # -----------------------------------------

        communicate = edge_tts.Communicate(
            translated_text,
            voice
        )

        await communicate.save(
            AUDIO_FILE_PATH
        )

        # -----------------------------------------
        # CHECK AUDIO
        # -----------------------------------------

        if not os.path.exists(AUDIO_FILE_PATH):

            raise HTTPException(
                status_code=500,
                detail="Audio file create nahi hui."
            )

        # -----------------------------------------
        # CACHE BUSTER
        # -----------------------------------------

        version = int(time.time() * 1000)

        print("\nAudio successfully created.")
        print("===================================\n")

        return {
            "message": "Audio Generated Successfully!",
            "language": language,
            "language_name": LANGUAGE_NAMES[language],
            "translated_text": translated_text,
            "audio_url": f"http://127.0.0.1:8000/audio?v={version}"
        }

    except HTTPException:
        raise

    except Exception as e:

        print("\n===================================")
        print("BACKEND ERROR")
        print("===================================")

        print(str(e))

        raise HTTPException(
            status_code=500,
            detail=str(e)
        )


# =========================================================
# AUDIO
# =========================================================

@app.get("/audio")
def get_audio():

    if not os.path.exists(AUDIO_FILE_PATH):

        raise HTTPException(
            status_code=404,
            detail="Audio file not found"
        )

    return FileResponse(
        path=AUDIO_FILE_PATH,
        media_type="audio/mpeg",
        filename="SunoPDF-Audio.mp3",
        headers={
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Pragma": "no-cache",
            "Expires": "0"
        }
    )

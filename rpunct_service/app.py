from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from simpletransformers.ner import NERModel

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize the model directly using simpletransformers (what rpunct uses under the hood)
# We use the Spanish model "felflare/bert-restore-punctuation-spanish" or fallback to english if needed.
# Since we are testing, let's use the standard "felflare/bert-restore-punctuation" (multilingual/english) 
# or a specific Spanish one if it exists. Actually, "oliverguhr/fullstop-punctuation-multilingual-sonar-base" is a great multilingual one,
# but we will stick to the rpunct default for simplicity:
try:
    print("Loading NER Model...")
    model = NERModel(
        "bert", 
        "dccuchile/bert-base-spanish-wwm-uncased", 
        use_cuda=False,
        args={"silent": True}
    )
    print("Model loaded successfully.")
except Exception as e:
    print(f"Error loading model: {e}")
    model = None

class TextRequest(BaseModel):
    text: str

def restore_punctuation(text: str) -> str:
    if not model:
        return text
        
    predictions, _ = model.predict([text])
    
    # predictions is a list of lists of dicts: [[{'word': 'O'}...]]
    if not predictions or not predictions[0]:
        return text
        
    result = ""
    for token_dict in predictions[0]:
        for word, tag in token_dict.items():
            result += word
            if tag != 'O':
                result += tag
            result += " "
            
    return result.strip()

@app.post("/punctuate")
def punctuate_text(request: TextRequest):
    if not request.text.strip():
        return {"text": ""}
        
    print(f"Received text: {request.text}")
    try:
        punctuated = restore_punctuation(request.text)
        print(f"Punctuated text: {punctuated}")
        return {"text": punctuated}
    except Exception as e:
        print(f"Error restoring punctuation: {e}")
        return {"text": request.text}

if __name__ == "__main__":
    import uvicorn
    # Start server on port 8000
    uvicorn.run(app, host="0.0.0.0", port=8000)

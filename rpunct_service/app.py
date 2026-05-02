from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from transformers import pipeline
import time
import torch

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Detect Apple Silicon (MPS) or CUDA
if torch.backends.mps.is_available():
    device = "mps"
elif torch.cuda.is_available():
    device = "cuda"
else:
    device = "cpu"

print(f"Using device: {device}")

# Initialize the model using a native transformers pipeline
# This model is robust and won't hallucinate like the Seq2Seq ones.
try:
    print("Loading Robust Punctuation Model (oliverguhr/fullstop-punctuation-multilingual-sonar-base)...")
    # Task is 'token-classification' for this model
    punct_pipeline = pipeline(
        "token-classification", 
        model="oliverguhr/fullstop-punctuation-multilingual-sonar-base",
        device=device
    )
    print("Model loaded successfully.")
except Exception as e:
    print(f"Error loading model: {e}")
    punct_pipeline = None

class TextRequest(BaseModel):
    text: str

def restore_punctuation(text: str) -> str:
    if not punct_pipeline:
        return text
    
    try:
        # The pipeline handles tokenization and label mapping
        results = punct_pipeline(text)
        
        # Reconstruct text with punctuation
        # The model returns a list of entities (tokens with their predicted punctuation)
        # oliverguhr's model tags: 0 (no punct), . (period), , (comma), ? (question), etc.
        
        punctuated_text = ""
        for i, res in enumerate(results):
            word = res['word']
            label = res['entity'] # labels are often like 'LABEL_0', 'LABEL_1' or the actual chars
            
            # Simple re-assembly logic for this specific pipeline output
            # (Note: this model often uses '0' for no punct and the symbol for others)
            # We need to handle BPE/WordPiece prefixes (like ' ' for XLM-R)
            
            if word.startswith(" "):
                punctuated_text += " " + word[1:]
            else:
                punctuated_text += word
                
            # If the label is not '0', append the punctuation
            if label != '0':
                punctuated_text += label
                
        return punctuated_text.strip()
    except Exception as e:
        print(f"Prediction error: {e}")
        # Fallback to a simpler approach if re-assembly fails
        return text

@app.post("/punctuate")
def punctuate_text(request: TextRequest):
    if not request.text.strip():
        return {"text": "", "time_ms": 0}
        
    start_time = time.time()
    try:
        # For this specific model, it's safer to use its internal processing
        # if the simple re-assembly above is too complex.
        # Actually, let's use a more robust way to join tokens for XLM-RoBERTa:
        
        # The pipeline can also be called directly on the text
        # But we need to handle the punctuation restoration correctly.
        # A common trick is to use a helper that knows the model's labels.
        
        # Let's use the most reliable method for this model:
        def get_punctuated_text(text):
            output = punct_pipeline(text)
            
            result = ""
            last_label = '0'
            
            for item in output:
                word = item['word']
                label = item['entity']
                
                # If this token starts a new word (starts with U+2581)
                if word.startswith("\u2581"):
                    # Before starting a new word, apply the punctuation of the previous word
                    if last_label != '0':
                        result += last_label
                    
                    result += " " + word[1:]
                    last_label = label # Update label for the new word
                else:
                    # It's a sub-token, just append it
                    result += word
                    # If this sub-token has punctuation, it usually applies to the whole word
                    if label != '0':
                        last_label = label
            
            # Apply the last label of the very last word
            if last_label != '0':
                result += last_label
                
            return result.strip()

        punctuated = get_punctuated_text(request.text)
        duration_ms = round((time.time() - start_time) * 1000, 2)
        print(f"[{duration_ms}ms] Punctuated: {punctuated}")
        return {"text": punctuated, "time_ms": duration_ms}
    except Exception as e:
        print(f"Error restoring punctuation: {e}")
        return {"text": request.text, "time_ms": 0}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
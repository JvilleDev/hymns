"""Export oliverguhr punct model to ONNX (build-time only, torch lives here)."""
import os

MODEL_ID = "oliverguhr/fullstop-punctuation-multilingual-sonar-base"
OUT_DIR = os.environ.get("PUNCT_ONNX_DIR", "./onnx/punct-sonar-base")

if __name__ == "__main__":
    from optimum.onnxruntime import ORTModelForTokenClassification

    # shortcut: fp32 export, no quantization — quantize later if latency needs it
    model = ORTModelForTokenClassification.from_pretrained(MODEL_ID, export=True)
    model.save_pretrained(OUT_DIR)
    print(f"Exported {MODEL_ID} -> {OUT_DIR}")

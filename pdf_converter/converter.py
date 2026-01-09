import fitz
import json
import uuid
import re
import requests
import sys

# --- API Configuration ---
# Change this to the IP/URL of your backend instance
API_BASE_URL = "http://192.168.1.16:3100"
# -------------------------


def extract_himnario(pdf_path, output_json, start_page=6):  # Page 7 is index 6
    doc = fitz.open(pdf_path)
    cantos = []
    current_canto = None

    # Font Size Thresholds
    SIZE_NH = 28.0
    SIZE_TITLE = 12.0
    SIZE_CONTENT = 11.0

    for page_num in range(start_page, len(doc)):
        page = doc[page_num]
        # Sort blocks by vertical position then horizontal
        blocks = page.get_text("dict", flags=fitz.TEXT_PRESERVE_IMAGES)["blocks"]

        # Identify song number from footer
        page_label = None
        for b in blocks:
            if "lines" not in b:
                continue
            for l in b["lines"]:
                for s in l["spans"]:
                    if abs(s["size"] - SIZE_NH) < 1.0 and s["origin"][1] > 500:
                        try:
                            page_label = int(s["text"].strip())
                        except:
                            pass

        # Find Title on this page
        page_has_title = False
        title_text = ""
        for b in blocks:
            if "lines" not in b:
                continue
            for l in b["lines"]:
                max_size = max(s["size"] for s in l["spans"])
                if abs(max_size - SIZE_TITLE) < 1.0:
                    line_text = "".join(s["text"] for s in l["spans"]).strip()
                    if line_text:
                        page_has_title = True
                        title_text = (
                            line_text
                            if not title_text
                            else title_text + " " + line_text
                        )

        if page_has_title:
            if current_canto:
                cantos.append(current_canto)
            current_canto = {
                "id": str(uuid.uuid4()),
                "title": title_text,
                "type": "Canto",
                "nh": page_label if page_label else (len(cantos) + 1),
                "stanzas": [],  # List of blocks/stanzas
            }

        # Extract content as stanzas
        for b in blocks:
            if "lines" not in b:
                continue
            origin_y = max(max(s["origin"][1] for s in l["spans"]) for l in b["lines"])
            if origin_y > 540:
                continue  # Footer

            block_content = []
            for l in b["lines"]:
                line_text = "".join(s["text"] for s in l["spans"]).strip()
                if not line_text:
                    continue
                max_size = max(s["size"] for s in l["spans"])

                if abs(max_size - SIZE_NH) < 1.0 or abs(max_size - SIZE_TITLE) < 1.0:
                    continue

                block_content.append(line_text)

            if block_content and current_canto:
                current_canto["stanzas"].append("\n".join(block_content))

    # Append last canto
    if current_canto:
        cantos.append(current_canto)

    doc.close()

    # Process stanzas and numbering
    for canto in cantos:
        stanza_number = 1
        final_stanzas = []

        for stanza in canto["stanzas"]:
            lines = [l.strip() for l in stanza.split("\n") if l.strip()]
            if not lines:
                continue

            first_line = lines[0]

            # 1. Check if it's already numbered
            if re.match(r"^\d+$", first_line):
                # Update stanza_number for subsequent unnumbered stanzas
                try:
                    stanza_number = int(first_line) + 1
                except:
                    pass
                final_stanzas.append(stanza)
            # 2. Check if it's a CORO
            elif first_line.upper() == "CORO" or first_line.upper().startswith("CORO"):
                final_stanzas.append(stanza)
            # 3. Check for structural markers
            elif first_line.upper() in ["AL CORO", "FINAL", "FIN"]:
                final_stanzas.append(stanza)
            # 4. Otherwise, it's an unnumbered stanza
            else:
                final_stanzas.append(str(stanza_number) + "\n" + stanza)
                stanza_number += 1

        canto["content"] = "\n".join(final_stanzas)
        del canto["stanzas"]

    # Save to local JSON
    with open(output_json, "w", encoding="utf-8") as f:
        json.dump(cantos, f, ensure_ascii=False, indent=4)
    print(f"Extracted {len(cantos)} cantos to {output_json}")

    # --- API Integration ---
    if API_BASE_URL:
        try:
            print(f"\nProcessing API requests to {API_BASE_URL}...")

            # Request 1: Delete all existing songs
            delete_url = f"{API_BASE_URL}/api/cantos"
            print(f"1. Deleting all existing songs at {delete_url}...")
            try:
                delete_res = requests.delete(delete_url, timeout=10)
                delete_res.raise_for_status()
                print(f"   Success: {delete_res.text}")
            except Exception as e:
                print(f"   Warning: Could not delete existing songs. {e}")
                print("   Continuing with import...")

            # Request 2: Import all new songs
            import_url = f"{API_BASE_URL}/import"
            print(f"2. Importing {len(cantos)} new songs to {import_url}...")
            import_res = requests.post(import_url, json=cantos, timeout=30)
            import_res.raise_for_status()
            print(f"   Success: {import_res.json().get('message', 'Import completed')}")
            print(f"   Count: {import_res.json().get('count', len(cantos))}")

        except requests.exceptions.RequestException as e:
            print(f"\nError connecting to API: {e}")
            print(
                "The JSON file 'cantos.json' was generated, but the API upload failed."
            )
        except Exception as e:
            print(f"\nAn unexpected error occurred during API integration: {e}")

    return cantos


if __name__ == "__main__":
    extract_himnario("himnario.pdf", "cantos.json")

import pypdf
import psycopg2
from dotenv import load_dotenv
import os
import uuid
# Load environment variables from .env file
load_dotenv()

def push_to_db():
    pdf = "Himnario2025.pdf"
    reader = pypdf.PdfReader(pdf)
    range = {"start": 6, "end": 161}

    pages = reader.pages[range["start"]-1:range["end"]]
    
    # Extract user, password, and host from environment variables
    user = os.getenv('DB_USER')
    password = os.getenv('DB_PASSWORD')
    host = os.getenv('DB_HOST')
    port = os.getenv('DB_PORT')

    conn = psycopg2.connect(
        dbname="postgres",
        user=user,
        password=password,
        host=host,
        port=port
    )
    cursor = conn.cursor()

    for page in pages:
        lines = page.extract_text().splitlines()
        data = {
            "id": str(uuid.uuid4()),  # Generate a unique UUID for the id field
            "nh": lines[0],
            "title": lines[1],
            "content": "\n".join(lines[2:]),
            "type": "Congregacional"
        }
        
        # Insert data into the database
        try:
            cursor.execute(
                """
                INSERT INTO cantos (id, nh, title, content, type)
                VALUES (%s, %s, %s, %s, %s)
                """,
                (data["id"], data["nh"], data["title"], data["content"], data["type"])
            )
            conn.commit()
            print(f"Inserted hymn {data['nh']} successfully.")
        except Exception as e:
            print(f"Failed to insert hymn {data['nh']}: {e}")
            conn.rollback()

    # Close the database connection
    cursor.close()
    conn.close()

if __name__ == "__main__":
    push_to_db()
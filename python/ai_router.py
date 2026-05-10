import httpx
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel


app = FastAPI(title="Park Management AI API")

OLLAMA_URL = "http://localhost:11434/api/generate"
MODEL_NAME = "tiger"


class StatusRequest(BaseModel):
    data: str
    question: str


class ReportRequest(BaseModel):
    data: str


SYSTEM_PROMPT_BASE = (
    "Language: English only. Strictly use provided sensor data; do not invent or hallucinate information. "
    "Do not include internal reasoning, chain-of-thought, or greetings."
)


@app.post("/status")
async def get_status(request: StatusRequest):
    prompt = (
        f"{SYSTEM_PROMPT_BASE}\n"
        "MODE: STATUS ANSWER. Provide a natural, conversational, and concise response. "
        "Integrate the Status and Action from the rules naturally.\n"
        f"DATA: {request.data}\n"
        f"USER QUESTION: {request.question}\n"
        "RULES:\n"
        "- Temp >= 33: High Temperature (Stay in shade)\n"
        "- Hum < 25: Fire Risk (Watering required)\n"
        "- Hum 25-39: Low Humidity (Watering recommended)\n"
        "- Trash > 5: Highly Dirty (Urgent alert)\n"
        "RESPONSE:"
    )

    return await call_ollama(prompt)


@app.post("/report")
async def get_report(request: ReportRequest):
    prompt = (
        f"{SYSTEM_PROMPT_BASE}\n"
        "MODE: REPORT. Generate a user-friendly summary paragraph. "
        "Then, list 'Anomalies & Alerts' with items needing attention.\n"
        f"DATA: {request.data}\n"
        "RULES:\n"
        "- Temp >= 33: High Temp\n"
        "- Hum < 25: Fire Risk\n"
        "- Trash > 5: Highly Dirty\n"
        "REPORT:"
    )

    return await call_ollama(prompt)


async def call_ollama(prompt: str):
    payload = {
        "model": MODEL_NAME,
        "prompt": prompt,
        "stream": False,
        "options": {
            "temperature": 0.1,
        },
    }

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(OLLAMA_URL, json=payload)
            response.raise_for_status()
            result = response.json()
            return {"response": result.get("response", "").strip()}
    except httpx.HTTPStatusError as error:
        raise HTTPException(status_code=error.response.status_code, detail=f"Ollama Error: {error.response.text}")
    except Exception as error:
        raise HTTPException(status_code=500, detail=str(error))


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)

import datetime
import time
import requests

from arduino.app_bricks.dbstorage_tsstore import TimeSeriesStore
from arduino.app_bricks.video_objectdetection import VideoObjectDetection
from arduino.app_bricks.web_ui import WebUI
from arduino.app_utils import App, Bridge


# ============================================================
#  OLLAMA — PURE HTTP CLIENT (NO PIP REQUIRED)
# ============================================================

OLLAMA_URL = "http://192.168.1.164:11434/api/chat"

def ask_llm(prompt: str) -> str:
    payload = {
        "model": "tiger",
        "stream": False,  
        "messages": [
            {"role": "user", "content": prompt}
        ]
    }

    try:
        r = requests.post(OLLAMA_URL, json=payload, timeout=120)
        r.raise_for_status()
        data = r.json()
        return data["message"]["content"]
    except Exception as e:
        return f"[LLM error: {e}]"



# ============================================================
#  DATABASE + CAMERA + UI SETUP
# ============================================================

db = TimeSeriesStore()
db.start()

ui = WebUI()
detector = VideoObjectDetection(confidence=0.5, debounce_sec=0.0)

latest_camera_counts = {
    "person": 0,
    "trash": 0
}


def update_camera_counts(detections: dict):
    print(f"Live detections: {detections}")
    latest_camera_counts["person"] = len(detections.get("person", []))
    latest_camera_counts["trash"] = len(detections.get("trash", []))


detector.on_detect_all(update_camera_counts)
detector.start()


# ============================================================
#  API HANDLERS
# ============================================================

def on_get_samples(resource: str, start: str, aggr_window: str):
    samples = db.read_samples(
        measure=resource,
        start_from=start,
        aggr_window=aggr_window,
        aggr_func="mean",
        limit=100,
    )
    return [{"ts": sample[1], "value": sample[2]} for sample in samples]


def on_get_latest():
    temperature = db.read_last_sample("temperature")
    humidity = db.read_last_sample("humidity")
    light = db.read_last_sample("light")
    person = db.read_last_sample("person")
    trash = db.read_last_sample("trash_counter")

    if temperature and temperature[1]:
        try:
            dt = datetime.datetime.fromisoformat(str(temperature[1]))
        except ValueError:
            dt = datetime.datetime.now()
    else:
        dt = datetime.datetime.now()

    formatted_ts = dt.strftime("T%Y-%m-%d_%H:%M:%S.%f")[:-3]

    return {
        "timestamp": formatted_ts,
        "temp": temperature[2] if temperature else None,
        "humidity": humidity[2] if humidity else None,
        "light": light[2] if light else None,
        "person": person[2] if person else 0,
        "trash_counter": trash[2] if trash else 0
    }


# ============================================================
#  CHAT ENDPOINT — LLM POWERED (PURE HTTP)
# ============================================================

def on_chat_message(payload: dict):
    user_text = str(payload.get("text", "")).strip()
    latest = on_get_latest()

    prompt = f"""
Ets un assistent del dashboard ambiental. Respon de manera breu i clara.

Dades actuals:
- Temperatura: {latest['temp']}
- Humitat: {latest['humidity']}
- Llum: {latest['light']}
- Persones detectades: {latest['person']}
- Brossa detectada: {latest['trash_counter']}

Usuari diu: "{user_text}"
"""

    reply = ask_llm(prompt)
    return {"reply": reply}


# ============================================================
#  REPORT ENDPOINT — LLM POWERED (PURE HTTP)
# ============================================================

def on_report():
    latest = on_get_latest()

    prompt = f"""
Generate a brief and formal environmental report based on these data:

temperature: {latest['temp']}
humidity: {latest['humidity']}
light level: {latest['light']}
people detected: {latest['person']}
trash detected: {latest['trash_counter']}

"""

    message = ask_llm(prompt)

    return {
        "latest": latest,
        "message": message,
    }


# ============================================================
#  REGISTER API ROUTES
# ============================================================

ui.expose_api("GET", "/get_samples/{resource}/{start}/{aggr_window}", on_get_samples)
ui.expose_api("GET", "/api/latest", on_get_latest)
ui.expose_api("POST", "/api/chat", on_chat_message)
ui.expose_api("GET", "/api/report", on_report)


# ============================================================
#  SENSOR RECORDING PIPELINE
# ============================================================

def record_sensor_samples(celsius: float, humidity: float, lightlevel: float):
    if celsius is None or humidity is None or lightlevel is None:
        return

    timestamp = int(datetime.datetime.now().timestamp() * 1000)

    person_count = latest_camera_counts["person"]
    trash_count = latest_camera_counts["trash"]

    db.write_sample("temperature", float(celsius), timestamp)
    db.write_sample("humidity", float(humidity), timestamp)
    db.write_sample("light", float(lightlevel), timestamp)
    db.write_sample("person", float(person_count), timestamp)
    db.write_sample("trash_counter", float(trash_count), timestamp)

    payload = {
        "temp": float(celsius),
        "humidity": float(humidity),
        "light": float(lightlevel),
        "person": float(person_count),
        "trash_counter": float(trash_count),
        "ts": timestamp,
    }

    for key, val in payload.items():
        if key != "ts":
            ui.send_message(key, {"value": val, "ts": timestamp})

    ui.send_message("sensors", payload)


def loop():
    time.sleep(0.1)


Bridge.provide("record_sensor_samples", record_sensor_samples)

try:
    App.run(user_loop=loop)
finally:
    db.stop()
    detector.stop()

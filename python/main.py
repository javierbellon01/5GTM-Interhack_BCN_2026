import datetime
import time

from arduino.app_bricks.dbstorage_tsstore import TimeSeriesStore
from arduino.app_bricks.video_objectdetection import VideoObjectDetection
from arduino.app_bricks.web_ui import WebUI
from arduino.app_utils import App, Bridge


db = TimeSeriesStore()
db.start()

ui = WebUI()
detector = VideoObjectDetection(confidence=0.5, debounce_sec=0.0)
latest_camera_counts = {
    "person": 0,
    "trash": 0
}

# 2. Define the callback function that the camera will trigger
def update_camera_counts(detections: dict):
    # Print exactly what the AI sees to your terminal for debugging
    print(f"Live detections: {detections}") 
    
    # Map the AI's "person" label to the dashboard's person counter
    latest_camera_counts["person"] = len(detections.get("person", []))
    latest_camera_counts["trash"] = len(detections.get("trash", []))
    
# 3. Register the callback BEFORE starting the detector
detector.on_detect_all(update_camera_counts)
detector.start()



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
    # Fetch latest from TimeSeries DB
    temperature = db.read_last_sample("temperature")
    humidity = db.read_last_sample("humidity")
    light = db.read_last_sample("light")
    person = db.read_last_sample("person")
    trash = db.read_last_sample("trash_counter")

    # Handle the timestamp formatting safely
    if temperature and temperature[1]:
        try:
            # Parse the DB's ISO string (e.g., '2026-05-09T18:08:01.701000+00:00')
            dt = datetime.datetime.fromisoformat(str(temperature[1]))
        except ValueError:
            # Fallback just in case the format is unexpected
            dt = datetime.datetime.now()
    else:
        # If the database is completely empty, use current time
        dt = datetime.datetime.now()

    # Format it to match "T2026-05-09_19:01:36.578" exactly
    formatted_ts = dt.strftime("T%Y-%m-%d_%H:%M:%S.%f")[:-3]

    # Return exactly the JSON format requested
    return {
        "timestamp": formatted_ts,
        "temp": temperature[2] if temperature else None,
        "humidity": humidity[2] if humidity else None,
        "light": light[2] if light else None,
        "person": person[2] if person else 0,
        "trash_counter": trash[2] if trash else 0
    }


def on_chat_message(payload: dict):
    text = str(payload.get("text", "")).strip()
    latest = on_get_latest()
    return {
        "reply": (
            f"Última lectura: {latest['temp']} ºC, {latest['humidity']} % d'humitat, "
                f"{latest['lightlevel']} lux, {latest['person']} persones i {latest['trash_counter']} brosses detectades."
        )
    }


def on_report():
    latest = on_get_latest()
    return {
        "latest": latest,
        "message": "Informe generat amb les darreres dades de la sèrie temporal.",
    }

ui.expose_api("GET", "/get_samples/{resource}/{start}/{aggr_window}", on_get_samples)
ui.expose_api("GET", "/api/latest", on_get_latest)
ui.expose_api("POST", "/api/chat", on_chat_message)
ui.expose_api("GET", "/api/report", on_report)


def record_sensor_samples(celsius: float, humidity: float, lightlevel: float):
    if celsius is None or humidity is None or lightlevel is None:
        return

    timestamp = int(datetime.datetime.now().timestamp() * 1000)

    # 1. Read the latest live detections from our background state
    person_count = latest_camera_counts["person"]
    trash_count = latest_camera_counts["trash"]

    # 2. Write everything to the TimeSeries DB
    db.write_sample("temperature", float(celsius), timestamp)
    db.write_sample("humidity", float(humidity), timestamp)
    db.write_sample("light", float(lightlevel), timestamp)
    db.write_sample("person", float(person_count), timestamp)
    db.write_sample("trash_counter", float(trash_count), timestamp)

    # 3. Push to Web UI via WebSockets
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
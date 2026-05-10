import datetime
import math
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

SENSOR_TIMEOUT_MS = 5000
SENSOR_STUCK_MS = 15000
sensor_last_seen_ms = {
    "temp": None,
    "humidity": None,
    "light": None,
}
sensor_last_change_ms = {
    "temp": None,
    "humidity": None,
    "light": None,
}
sensor_last_value = {
    "temp": None,
    "humidity": None,
    "light": None,
}
SENSOR_EPSILON = {
    "temp": 0.01,
    "humidity": 0.01,
    "light": 0.1,
}


def _is_valid_value(value):
    if value is None:
        return False
    try:
        return math.isfinite(float(value))
    except (TypeError, ValueError):
        return False


def _is_sensor_connected(sensor_key: str, now_ms: int):
    last_seen = sensor_last_seen_ms.get(sensor_key)
    last_change = sensor_last_change_ms.get(sensor_key)

    if last_seen is None or (now_ms - last_seen) > SENSOR_TIMEOUT_MS:
        return False

    if last_change is None or (now_ms - last_change) > SENSOR_STUCK_MS:
        return False

    return True


def _update_sensor_tracking(sensor_key: str, value: float, timestamp_ms: int):
    prev_value = sensor_last_value.get(sensor_key)
    epsilon = SENSOR_EPSILON.get(sensor_key, 0.01)
    was_connected = _is_sensor_connected(sensor_key, timestamp_ms)

    if prev_value is None or abs(float(value) - float(prev_value)) > epsilon or not was_connected:
        sensor_last_change_ms[sensor_key] = timestamp_ms

    sensor_last_seen_ms[sensor_key] = timestamp_ms
    sensor_last_value[sensor_key] = float(value)


def _read_live_value(measure_name: str, sensor_key: str, now_ms: int):
    if not _is_sensor_connected(sensor_key, now_ms):
        return None

    sample = db.read_last_sample(measure_name)
    if not sample:
        return None

    return sample[2]

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
    now_ms = int(datetime.datetime.now().timestamp() * 1000)

    # Fetch latest from TimeSeries DB
    temperature = _read_live_value("temperature", "temp", now_ms)
    humidity = _read_live_value("humidity", "humidity", now_ms)
    light = _read_live_value("light", "light", now_ms)
    person = db.read_last_sample("person")
    trash = db.read_last_sample("trash_counter")

    # Handle the timestamp formatting safely
    dt = datetime.datetime.now()

    # Format it to match "T2026-05-09_19:01:36.578" exactly
    formatted_ts = dt.strftime("T%Y-%m-%d_%H:%M:%S.%f")[:-3]

    # Return exactly the JSON format requested
    return {
        "timestamp": formatted_ts,
        "temp": float(temperature) if temperature is not None else None,
        "humidity": float(humidity) if humidity is not None else None,
        "light": float(light) if light is not None else None,
        "person": person[2] if person else 0,
        "trash_counter": trash[2] if trash else 0,
        "sensor_status": {
            "temp": temperature is not None,
            "humidity": humidity is not None,
            "light": light is not None,
        },
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
    timestamp = int(datetime.datetime.now().timestamp() * 1000)

    # 1. Read the latest live detections from our background state
    person_count = latest_camera_counts["person"]
    trash_count = latest_camera_counts["trash"]

    # 2. Write everything to the TimeSeries DB
    temp_value = float(celsius) if _is_valid_value(celsius) else None
    humidity_value = float(humidity) if _is_valid_value(humidity) else None
    light_value = float(lightlevel) if _is_valid_value(lightlevel) else None

    if temp_value is not None:
        db.write_sample("temperature", temp_value, timestamp)
        _update_sensor_tracking("temp", temp_value, timestamp)

    if humidity_value is not None:
        db.write_sample("humidity", humidity_value, timestamp)
        _update_sensor_tracking("humidity", humidity_value, timestamp)

    if light_value is not None:
        db.write_sample("light", light_value, timestamp)
        _update_sensor_tracking("light", light_value, timestamp)

    db.write_sample("person", float(person_count), timestamp)
    db.write_sample("trash_counter", float(trash_count), timestamp)

    # 3. Push to Web UI via WebSockets
    payload = {
        "temp": temp_value,
        "humidity": humidity_value,
        "light": light_value,
        "person": float(person_count),
        "trash_counter": float(trash_count),
        "sensor_status": {
            "temp": _is_sensor_connected("temp", timestamp),
            "humidity": _is_sensor_connected("humidity", timestamp),
            "light": _is_sensor_connected("light", timestamp),
        },
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
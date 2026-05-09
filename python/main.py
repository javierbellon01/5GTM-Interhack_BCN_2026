import datetime
import time

from arduino.app_bricks.dbstorage_tsstore import TimeSeriesStore
from arduino.app_bricks.web_ui import WebUI
from arduino.app_utils import App, Bridge


db = TimeSeriesStore()
db.start()

ui = WebUI()


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

    return {
        "temp": temperature[2] if temperature else None,
        "humidity": humidity[2] if humidity else None,
        "light": light[2] if light else None,
        "trash": None,
        "timestamp": temperature[1] if temperature else None,
    }


def on_chat_message(payload: dict):
    text = str(payload.get("text", "")).strip()
    latest = on_get_latest()
    return {
        "reply": (
            f"Última lectura: {latest['temp']} ºC, {latest['humidity']} % d'humitat i {latest['light']} lux."
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
    """Callback invoked by the sketch every second.

    Stores temperature, humidity, and light in the time-series DB and pushes the
    latest values to the Web UI.
    """
    if celsius is None or humidity is None or lightlevel is None:
        print(
            "Received invalid sensor samples: "
            f"celsius={celsius}, humidity={humidity}, light level={lightlevel}"
        )
        return

    timestamp = int(datetime.datetime.now().timestamp() * 1000)

    temperature = float(celsius)
    humidity_value = float(humidity)
    light_value = float(lightlevel)

    db.write_sample("temperature", temperature, timestamp)
    db.write_sample("humidity", humidity_value, timestamp)
    db.write_sample("light", light_value, timestamp)

    ui.send_message("temperature", {"value": temperature, "ts": timestamp})
    ui.send_message("humidity", {"value": humidity_value, "ts": timestamp})
    ui.send_message("light", {"value": light_value, "ts": timestamp})
    ui.send_message(
        "sensors",
        {
            "temp": temperature,
            "humidity": humidity_value,
            "light": light_value,
            "ts": timestamp,
        },
    )

    print(
        f"Received Temperature: {temperature} ºC, "
        f"Humidity: {humidity_value} %, "
        f"Light level: {light_value}"
    )


def loop():
    time.sleep(0.1)


print("Registering 'record_sensor_samples' callback.")
Bridge.provide("record_sensor_samples", record_sensor_samples)

try:
    App.run(user_loop=loop)
finally:
    db.stop()
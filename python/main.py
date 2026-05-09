import time

from arduino.app_utils import App, Bridge
from arduino.app_bricks.web_ui import WebUI

print("Hello world!")

ui = WebUI()

def record_sensor_samples(celsius: float, humidity: float, lightlevel: float):
    if celsius is None or humidity is None or lightlevel is None:
        print(
            "Received invalid sensor samples: "
            f"celsius={celsius}, humidity={humidity}, light level={lightlevel}"
        )
        return

    print(
        f"Received Temperature: {celsius} ºC, "
        f"Humidity: {humidity} %, "
        f"Light level: {lightlevel}"
    )

def loop():
    time.sleep(0.1)

print("Registering 'record_sensor_samples' callback.")
Bridge.provide("record_sensor_samples", record_sensor_samples)

App.run(user_loop=loop)
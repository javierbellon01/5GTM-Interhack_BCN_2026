import time

from arduino.app_utils import App
from arduino.app_bricks.web_ui import WebUI

print("Hello world!")


def loop():
    """This function is called repeatedly by the App framework."""
    # You can replace this with any code you want your App to run repeatedly.
    pass

ui = WebUI()

# See: https://docs.arduino.cc/software/app-lab/tutorials/getting-started/#app-run
App.run(user_loop=loop)

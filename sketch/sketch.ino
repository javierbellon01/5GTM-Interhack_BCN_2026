// SPDX-FileCopyrightText: Copyright (C) ARDUINO SRL (http://www.arduino.cc)
//
// SPDX-License-Identifier: MPL-2.0

#include <Arduino_Modulino.h>
#include <Arduino_RouterBridge.h>
#include <math.h>

// Create object instance
ModulinoThermo thermo;
ModulinoLight light;

unsigned long previousMillis = 0; 	// Stores last time values were updated
const long interval = 1000; 		//Every second

void setup() {
  Bridge.begin();

  // Initialize Modulino I2C communication
  Modulino.begin(Wire1);
  // Detect and connect to temperature/humidity sensor module
  thermo.begin();
  light.begin();
}

void loop() {
  unsigned long currentMillis = millis(); // Get the current time
  if (currentMillis - previousMillis >= interval) {
    // Save the last time you updated the values
    previousMillis = currentMillis;

    // Read temperature and humidity first.
    // If one sensor fails, values can become NaN and backend will handle it per-sensor.
    float celsius = thermo.getTemperature();
    float humidity = thermo.getHumidity();

    // Read light independently so a bad light value does not stop the notification.
    float lightlevel = NAN;
    light.update();
    lightlevel = light.getAL();
    
    // --- ADD THIS RECOVERY LOGIC ---
    // If any sensor returns NaN, the I2C bus or a sensor has failed/disconnected.
    if (isnan(celsius) || isnan(humidity) || isnan(lightlevel)) {
        
        // 1. Reset the entire Modulino I2C bus to clear any lockups
        Modulino.begin(Wire1); 
        
        // 2. Re-initialize the specific sensors that failed
        if (isnan(celsius) || isnan(humidity)) {
            thermo.begin(); 
        }
        if (isnan(lightlevel)) {
            light.begin();
        }
    }
    // --------------------------------

    Bridge.notify("record_sensor_samples", celsius, humidity, lightlevel);
  }
}


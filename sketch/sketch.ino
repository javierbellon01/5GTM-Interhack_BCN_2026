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
    
    // // Get colour approximation
    // String colourName = light.getColorApproximate();
    
    // // Get RGB values
    // ModulinoColor colour = light.getColor();
    // int r = (0xFF000000 & colour) >> 24;
    // int g = (0x00FF0000 & colour) >> 16;
    // int b = (0x0000FF00 & colour) >> 8;
    
    // // Get light intensity values
    // int lux = light.getAL();              // Ambient light (raw)
    // int luxCalibrated = light.getLux();   // Calibrated lux
    // int ir = light.getIR();               // Infrared level

    Bridge.notify("record_sensor_samples", celsius, humidity, lightlevel);
  }
}


<a id="readme-top"></a>

[![Contributors][contributors-shield]][contributors-url]
[![Forks][forks-shield]][forks-url]
[![Stargazers][stars-shield]][stars-url]
[![Issues][issues-shield]][issues-url]
[![MIT License][license-shield]][license-url]

<br />
<div align="center">
  <h3 align="center">5GTM-Interhack_BCN_2026</h3>

  <p align="center">
    An intelligent, edge-AI powered park monitoring system built for the 5GTM Interhack Barcelona 2026.
    <br />
    <a href="https://github.com/your_username/5GTM-Interhack_BCN_2026"><strong>Explore the docs »</strong></a>
    <br />
    <br />
    <a href="https://github.com/your_username/5GTM-Interhack_BCN_2026/issues">Report Bug</a>
    ·
    <a href="https://github.com/your_username/5GTM-Interhack_BCN_2026/issues">Request Feature</a>
  </p>
</div>

<details>
  <summary>Table of Contents</summary>
  <ol>
    <li>
      <a href="#about-the-project">About The Project</a>
      <ul>
        <li><a href="#built-with">Built With</a></li>
        <li><a href="#materials">Materials</a></li>
      </ul>
    </li>
    <li><a href="#development">Development</a></li>
    <li><a href="#usage">Usage</a></li>
    <li><a href="#license">License</a></li>
    <li><a href="#contact">Contact</a></li>
    <li><a href="#acknowledgments">Acknowledgments</a></li>
  </ol>
</details>

## About The Project

**5GTM-Interhack_BCN_2026** is an IoT and Edge AI solution designed to monitor the health, cleanliness, and environmental status of public parks. 

Using an Arduino Q1 equipped with various sensors and a webcam, the system collects local environmental data and performs real-time object detection to quantify litter on the ground. This data is saved locally in a JSON file and, Through a custom web dashboard, park administrators can view real-time metrics and trigger a lightweight, localized LLM to generate plain-text summaries of the park's current status based on the aggregated JSON sensor data sent over Wi-Fi.

**Key Metrics Monitored:**
* **Cleanliness:** Object boundary detection models calculate the percentage of trash in the webcam's field of view.
* **Environmental Health:** Real-time temperature, humidity, and sunlight tracking.
* **Noise Pollution:** Acoustic contamination measured via the webcam's integrated microphone.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

### Built With

* [![FastAPI][FastAPI.com]][FastAPI-url]
* [![JavaScript][JS.com]][JS-url]
* [![HTML5][HTML.com]][HTML-url]
* [![Edge Impulse][EdgeImpulse.com]][EdgeImpulse-url]
* Arduino (C++)

<p align="right">(<a href="#readme-top">back to top</a>)</p>

### Materials

* **Arduino Q1**
* **Webcam**
* **Temperature & Humidity Sensor** (e.g., DHT11/DHT22)
* **Sunlight/Photoresistor Sensor**
* **Computer** (Acts as the park administrator)

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## Development

The technical architecture is split between Edge Computing and a Centralized Orchestrator:

1. **Edge AI Model (Trash Detection):** We utilized **Edge Impulse** to train a FOMO (Faster Objects, More Objects) object detection model. The model is optimized for microcontrollers, running at a 320x320 resolution to efficiently identify and quantify trash boundaries in the park environment.
2. **Data Aggregation:** The Arduino Q1 collects data from the FOMO model, the temperature/humidity sensors, the sunlight sensor, and the microphone. This is formatted into a local JSON payload.
3. **Orchestrator Backend:** Built using **FastAPI**, the backend receives real-time telemetry from the Arduino via Wi-Fi.
4. **Dashboard + Backend:** Built using **JavaScript** and **FastAPI**, the Arduino runs a lightweight web-interface to display real-time telemetry. 
5. **LLM Integration:** A lightweight LLM utilizes the JSON telemetry data as context. When prompted via the dashboard, it parses the environmental data to return a human-readable park status report.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## Usage

*This section will be updated as the implementation is finalized.*

1. Power on the Arduino Q1 and ensure it connects to the local Wi-Fi network.
2. Run the FastAPI server on the orchestrator computer/Arduino Q1.
3. Open the web dashboard in your browser.
4. View real-time environmental and acoustic metrics.
5. Click the **"Descarrega l'informe"** button to trigger the LLM to interpret the latest JSON payload and provide an immediate summary of the park's condition.
6. Ask any question about the data to the chatbot.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## License

Distributed under the MIT License. See `LICENSE.txt` for more information. To be aded to the repository.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## Contact

Contact any of the contributors for more information.

Project Link: [https://github.com/your_username/5GTM-Interhack_BCN_2026](https://github.com/your_username/5GTM-Interhack_BCN_2026)

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## Acknowledgments

* [Edge Impulse](https://edgeimpulse.com/)
* [FastAPI](https://fastapi.tiangolo.com/)
* [5GTM Interhack BCN](https://example.com)

<p align="right">(<a href="#readme-top">back to top</a>)</p>


[contributors-shield]: https://img.shields.io/github/contributors/javierbellon01/5GTM-Interhack_BCN_2026.svg?style=for-the-badge
[contributors-url]: https://github.com/javierbellon01/5GTM-Interhack_BCN_2026/graphs/contributors
[forks-shield]: https://img.shields.io/github/forks/javierbellon01/5GTM-Interhack_BCN_2026.svg?style=for-the-badge
[forks-url]: https://github.com/javierbellon01/5GTM-Interhack_BCN_2026/network/members
[stars-shield]: https://img.shields.io/github/stars/javierbellon01/5GTM-Interhack_BCN_2026.svg?style=for-the-badge
[stars-url]: https://github.com/javierbellon01/5GTM-Interhack_BCN_2026/stargazers
[issues-shield]: https://img.shields.io/github/issues/javierbellon01/5GTM-Interhack_BCN_2026.svg?style=for-the-badge
[issues-url]: https://github.com/javierbellon01/5GTM-Interhack_BCN_2026/issues
[license-shield]: https://img.shields.io/github/license/javierbellon01/5GTM-Interhack_BCN_2026.svg?style=for-the-badge
[license-url]: https://github.com/javierbellon01/5GTM-Interhack_BCN_2026/blob/master/LICENSE.txt
[FastAPI.com]: https://img.shields.io/badge/FastAPI-005571?style=for-the-badge&logo=fastapi
[FastAPI-url]: https://fastapi.tiangolo.com/
[JS.com]: https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black
[JS-url]: https://developer.mozilla.org/en-US/docs/Web/JavaScript
[HTML.com]: https://img.shields.io/badge/HTML5-E34F26?style=for-the-badge&logo=html5&logoColor=white
[HTML-url]: https://developer.mozilla.org/en-US/docs/Web/HTML
[EdgeImpulse.com]: https://img.shields.io/badge/Edge_Impulse-FFFFFF?style=for-the-badge&logo=edgeimpulse&logoColor=black
[EdgeImpulse-url]: https://edgeimpulse.com/

(function () {
  function pad(value) {
    return String(value).padStart(2, '0');
  }

  function formatDate(value) {
    const date = value instanceof Date ? value : new Date(value || Date.now());
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  function normalizeText(value) {
    return String(value ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\x20-\x7E]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function escapePdfText(value) {
    return normalizeText(value).replace(/[\\()]/g, '\\$&');
  }

  function formatMetricValue(key, value) {
    if (value === null || value === undefined || Number.isNaN(Number(value))) {
      return 'N/A';
    }
    if (key === 'temp') {
      return Number(value).toFixed(1);
    }
    return String(Math.round(Number(value)));
  }

  function wrapText(value, maxChars) {
    const words = normalizeText(value).split(' ').filter(Boolean);
    if (!words.length) {
      return [''];
    }

    const lines = [];
    let line = '';

    words.forEach((word) => {
      if (!line.length) {
        line = word;
        return;
      }

      if ((line.length + word.length + 1) <= maxChars) {
        line += ` ${word}`;
        return;
      }

      lines.push(line);
      line = word;
    });

    if (line.length) {
      lines.push(line);
    }

    return lines;
  }

  function hexToRgb(hex) {
    const value = String(hex || '').replace('#', '').trim();
    if (value.length !== 6) {
      return [0.2, 0.43, 0.31];
    }

    return [0, 1, 2].map((index) => parseInt(value.slice(index * 2, index * 2 + 2), 16) / 255);
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function buildReportLines(report) {
    const metrics = report.metrics || {};
    const history = report.history || {};
    const events = Array.isArray(report.events) ? report.events : [];
    const sensors = Array.isArray(report.sensors) ? report.sensors : [];
    const commands = [];
    const pageWidth = 595;
    const margin = 44;

    function add(cmd) {
      commands.push(cmd);
    }

    function textBlock(x, y, text, size, color, font) {
      add(`BT /${font || 'F1'} ${size} Tf ${color || '0 0 0'} rg 1 0 0 1 ${x} ${y} Tm (${escapePdfText(text)}) Tj ET`);
    }

    function drawRect(x, y, w, h, fill, stroke, lineWidth) {
      if (fill) {
        add(`${fill} rg ${x} ${y} ${w} ${h} re f`);
      }
      if (stroke) {
        add(`${stroke} RG ${lineWidth || 1} w ${x} ${y} ${w} ${h} re S`);
      }
    }

    function drawLine(x1, y1, x2, y2, stroke, lineWidth) {
      add(`${stroke} RG ${lineWidth || 1} w ${x1} ${y1} m ${x2} ${y2} l S`);
    }

    function drawPolyline(points, stroke, lineWidth) {
      if (!points.length) {
        return;
      }
      const segments = [`${points[0][0].toFixed(1)} ${points[0][1].toFixed(1)} m`];
      points.slice(1).forEach(([px, py]) => {
        segments.push(`${px.toFixed(1)} ${py.toFixed(1)} l`);
      });
      add(`q ${stroke} RG ${lineWidth || 1} w ${segments.join(' ')} S Q`);
    }

    function drawFilledArea(points, baselineY, fillColor) {
      if (points.length < 2) {
        return;
      }
      const path = [
        `${points[0][0].toFixed(1)} ${baselineY.toFixed(1)} m`,
        `${points[0][0].toFixed(1)} ${points[0][1].toFixed(1)} l`
      ];
      points.slice(1).forEach(([px, py]) => {
        path.push(`${px.toFixed(1)} ${py.toFixed(1)} l`);
      });
      path.push(`${points[points.length - 1][0].toFixed(1)} ${baselineY.toFixed(1)} l`);
      path.push('h');
      add(`q ${fillColor} rg ${path.join(' ')} f Q`);
    }

    function drawMetricChart(x, y, width, height, key, label, unit, colorHex, fillHex) {
      const values = Array.isArray(history[key]) ? history[key].map((value) => Number(value)).filter((value) => Number.isFinite(value)) : [];
      const current = formatMetricValue(key, metrics[key]);
      const color = hexToRgb(colorHex);
      const fill = hexToRgb(fillHex);
      const line = color.map((value) => value.toFixed(3)).join(' ');
      const fillColor = fill.map((value) => value.toFixed(3)).join(' ');
      const chartX = x + 12;
      const chartY = y + 12;
      const chartWidth = width - 24;
      const chartHeight = height - 54;
      const min = values.length ? Math.min(...values) : 0;
      const max = values.length ? Math.max(...values) : 1;
      const range = Math.max(max - min, 0.0001);
      const points = [];

      drawRect(x, y, width, height, '1 1 1', '0.84 0.88 0.86', 1);
      add(`q ${fillColor} rg ${x + 10} ${y + 10} ${width - 20} ${height - 20} re f Q`);
      textBlock(x + 14, y + height - 22, `${label}`, 11, '0.16 0.2 0.18', 'F2');
      textBlock(x + 14, y + height - 38, `${current} ${unit}`, 16, line, 'F2');

      if (values.length < 2) {
        drawLine(chartX, chartY + chartHeight / 2, chartX + chartWidth, chartY + chartHeight / 2, '0.82 0.86 0.84', 1);
        textBlock(chartX, chartY + 8, 'Awaiting samples', 9, '0.44 0.47 0.46', 'F1');
        return;
      }

      const stepX = chartWidth / (values.length - 1);
      values.forEach((value, index) => {
        const mappedX = chartX + stepX * index;
        const mappedY = chartY + ((value - min) / range) * chartHeight;
        points.push([mappedX, mappedY]);
      });

      // background guides
      drawLine(chartX, chartY, chartX + chartWidth, chartY, '0.86 0.89 0.87', 0.8);
      drawLine(chartX, chartY + chartHeight / 2, chartX + chartWidth, chartY + chartHeight / 2, '0.9 0.92 0.91', 0.8);
      drawLine(chartX, chartY + chartHeight, chartX + chartWidth, chartY + chartHeight, '0.86 0.89 0.87', 0.8);

      drawFilledArea(points, chartY, fillColor);
      drawPolyline(points, line, 2.1);

      points.forEach(([px, py], index) => {
        if (index === 0) {
          add(`q ${line} rg ${px.toFixed(1)} ${py.toFixed(1)} 2.8 2.8 re f Q`);
          return;
        }
        const [prevX, prevY] = points[index - 1];
        drawLine(prevX, prevY, px, py, line, 2.2);
        add(`q ${line} rg ${px.toFixed(1)} ${py.toFixed(1)} 2.8 2.8 re f Q`);
      });

      textBlock(chartX, chartY - 4, `${min.toFixed(key === 'temp' ? 1 : 0)}`, 8, '0.45 0.48 0.47', 'F1');
      textBlock(chartX + chartWidth - 20, chartY - 4, `${max.toFixed(key === 'temp' ? 1 : 0)}`, 8, '0.45 0.48 0.47', 'F1');
    }

    add('0.96 0.98 0.97 rg');
    add('0 0 0 RG');
    drawRect(28, 30, 539, 784, '1 1 1', '0.86 0.89 0.87', 1);
    drawRect(28, 30, 539, 96, '0.94 0.97 0.95', '0.86 0.89 0.87', 1);
    textBlock(48, 784, 'Park Digital Twin Report', 22, '0.13 0.22 0.17', 'F2');
    textBlock(48, 764, `Generated: ${formatDate(report.generatedAt)}`, 10, '0.38 0.4 0.39', 'F1');
    textBlock(48, 748, report.connected ? 'Connection status: Connected' : 'Connection status: Disconnected', 11, report.connected ? '0.17 0.45 0.3' : '0.78 0.22 0.2', 'F2');

    textBlock(48, 706, 'Data report', 15, '0.13 0.22 0.17', 'F2');
    textBlock(48, 688, 'Live metrics plotted as recent history trends.', 10, '0.42 0.45 0.44', 'F1');
    textBlock(360, 706, `Trash count: ${formatMetricValue('trash', metrics.trash)} items`, 10, '0.22 0.24 0.23', 'F2');

    drawMetricChart(44, 582, 240, 120, 'temp', 'Temperature', 'C', '#356d4e', '#edf6f0');
    drawMetricChart(301, 582, 240, 120, 'humidity', 'Humidity', '%', '#4f8a67', '#eef8f2');
    drawMetricChart(44, 448, 240, 120, 'light', 'Light', 'lux', '#2f7a55', '#eff7f2');
    drawMetricChart(301, 448, 240, 120, 'noise', 'Noise', 'dB', '#6a8f58', '#f2f6eb');
    drawMetricChart(44, 314, 240, 120, 'people', 'People count', 'pers.', '#1f6f4b', '#ecf7f0');
    drawMetricChart(301, 314, 240, 120, 'trash', 'Trash count', 'items', '#577a2f', '#f1f7e8');

    drawRect(44, 150, 240, 132, '0.98 0.99 0.98', '0.86 0.89 0.87', 1);
    drawRect(301, 150, 240, 132, '0.98 0.99 0.98', '0.86 0.89 0.87', 1);
    drawRect(44, 30, 497, 104, '0.94 0.97 0.95', '0.86 0.89 0.87', 1);

    textBlock(58, 260, 'Recent events', 13, '0.13 0.22 0.17', 'F2');
    if (!events.length) {
      textBlock(58, 244, 'No recent events available.', 10, '0.45 0.48 0.47', 'F1');
    } else {
      events.slice(0, 3).forEach((event, index) => {
        const baseY = 244 - (index * 18);
        textBlock(58, baseY, `${normalizeText(event.time || 'Now')} - ${normalizeText(event.title || 'Event')}`, 10, '0.2 0.23 0.21', 'F1');
        textBlock(58, baseY - 11, normalizeText(event.zone || 'Unknown zone'), 9, '0.42 0.45 0.44', 'F1');
      });
    }

    textBlock(315, 260, 'Sensor status', 13, '0.13 0.22 0.17', 'F2');
    if (!sensors.length) {
      textBlock(315, 244, 'No sensor status available.', 10, '0.45 0.48 0.47', 'F1');
    } else {
      sensors.slice(0, 5).forEach((sensor, index) => {
        const baseY = 244 - (index * 16);
        textBlock(315, baseY, `${normalizeText(sensor.label || sensor.key || 'Sensor')}: ${normalizeText(sensor.status || 'Pending')}`, 10, '0.22 0.24 0.23', 'F1');
      });
    }

    // Render alerts into the LLM box (up to 6 lines)
    const alertsList = Array.isArray(report.alerts) ? report.alerts : [];
    if (alertsList.length) {
      textBlock(58, 120, 'LLM indications and alerts', 14, '0.18 0.33 0.24', 'F2');
      alertsList.slice(0, 6).forEach((a, idx) => {
        const yPos = 104 - idx * 14;
        const title = `${a.time || ''} - ${a.title}`.trim();
        const detail = a.detail || '';
        textBlock(58, yPos, title, 10, '0.22 0.24 0.23', 'F1');
        if (detail) {
          textBlock(58, yPos - 10, detail, 9, '0.42 0.45 0.44', 'F1');
        }
      });
    } else {
      textBlock(58, 114, 'LLM indications and alerts', 14, '0.18 0.33 0.24', 'F2');
      textBlock(58, 96, 'Reserved area for AI-generated alerts, annotations, and follow-up notes.', 10, '0.32 0.32 0.32', 'F1');
      textBlock(58, 79, 'Use this space for recommended actions, incident summaries, or warnings.', 10, '0.48 0.48 0.48', 'F1');
      textBlock(58, 60, '______________________________________________', 10, '0.48 0.48 0.48', 'F1');
      textBlock(58, 46, '______________________________________________', 10, '0.48 0.48 0.48', 'F1');
      textBlock(58, 32, '______________________________________________', 10, '0.48 0.48 0.48', 'F1');
    }

    return commands;
  }

  function buildContentStream(report) {
    return buildReportLines(report).join('\n');
  }

  function buildPdf(report) {
    const contentStream = buildContentStream(report || {});
    const objects = [];

    function addObject(body) {
      objects.push(`${objects.length + 1} 0 obj\n${body}\nendobj\n`);
    }

    addObject('<< /Type /Catalog /Pages 2 0 R >>');
    addObject('<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
    addObject('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> /Contents 4 0 R >>');
    addObject(`<< /Length ${contentStream.length} >>\nstream\n${contentStream}\nendstream`);
    addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
    addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>');

    let pdf = '%PDF-1.4\n';
    const offsets = [0];

    objects.forEach((object) => {
      offsets.push(pdf.length);
      pdf += object;
    });

    const xrefStart = pdf.length;
    pdf += `xref\n0 ${objects.length + 1}\n`;
    pdf += '0000000000 65535 f \n';

    for (let index = 1; index <= objects.length; index += 1) {
      pdf += `${String(offsets[index]).padStart(10, '0')} 00000 n \n`;
    }

    pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
    return pdf;
  }

  function downloadPdf(pdfString, filename) {
    const bytes = new TextEncoder().encode(pdfString);
    const blob = new Blob([bytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  window.createParkReportPdf = function createParkReportPdf(report) {
    const date = new Date(report && report.generatedAt ? report.generatedAt : Date.now());
    const filename = `park-report-${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}.pdf`;
    const pdfString = buildPdf(report || {});
    downloadPdf(pdfString, filename);
  };
})();

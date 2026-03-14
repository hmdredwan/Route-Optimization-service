export const renderMapPage = (result: any): string => {
  const { driver_id, driver_name, optimized_sequence, route_geometry, legs } = result;
  const startLat = result.driver_start_lat; // Assuming added to DB schema or derived
  const startLng = result.driver_start_lng; // Assuming added to DB schema or derived

  const markers = [
    { lat: startLat, lng: startLng, label: `Start: ${driver_name}`, icon: 'start' },
    ...optimized_sequence.map((stop: any, index: number) => ({
      lat: stop.lat,
      lng: stop.lng,
      label: `${index + 1}: ${stop.label}`,
      icon: 'stop',
    })),
  ];

  const coordinates = route_geometry.coordinates.map(([lng, lat]: [number, number]) => [lat, lng]);

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Route Optimization Map</title>
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <style>
    body { margin: 0; font-family: Arial, sans-serif; }
    #map { height: 70vh; }
    #summary { padding: 10px; background: #f0f0f0; }
    table { width: 100%; border-collapse: collapse; }
    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
  </style>
</head>
<body>
  <div id="map"></div>
  <div id="summary">
    <h3>Stop Summary</h3>
    <table>
      <tr><th>Position</th><th>Label</th><th>Distance from Previous (m)</th></tr>
      <tr><td>Start</td><td>${driver_name}</td><td>-</td></tr>
      ${optimized_sequence.map((stop: any, index: number) => {
        const leg = legs[index];
        return `<tr><td>${index + 1}</td><td>${stop.label}</td><td>${leg ? leg.distance_m : '-'}</td></tr>`;
      }).join('')}
    </table>
  </div>
  <script>
    const map = L.map('map').setView([${startLat}, ${startLng}], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);

    const startIcon = L.icon({ iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-green.png', iconSize: [25, 41] });
    const stopIcon = L.icon({ iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-blue.png', iconSize: [25, 41] });

    ${markers.map(marker => `
      L.marker([${marker.lat}, ${marker.lng}], { icon: ${marker.icon === 'start' ? 'startIcon' : 'stopIcon'} })
        .addTo(map)
        .bindPopup('${marker.label}');
    `).join('')}

    L.polyline(${JSON.stringify(coordinates)}, { color: 'blue' }).addTo(map);

    const bounds = L.latLngBounds(${markers.map(m => `[${m.lat}, ${m.lng}]`).join(', ')});
    map.fitBounds(bounds);
  </script>
</body>
</html>
  `;
  return html;
};